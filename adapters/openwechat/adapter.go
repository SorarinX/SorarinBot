// Package openwechat implements the WeChat adapter for SorarinBot.
// This adapter translates WeChat events into handler calls.
package openwechat

import (
	"context"
	"fmt"
	"io"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"SorarinBot/core/config"
	"SorarinBot/core/message"
	"SorarinBot/core/session"
	ow "SorarinBot/internal/openwechat"

	"github.com/sirupsen/logrus"
	"github.com/skip2/go-qrcode"
)

// Gate-2 (P5-1 / P5-2) concurrency limits.
const (
	// maxConcurrentChats bounds how many provider.Chat calls may be in
	// flight at once across all sessions. The slot is acquired and
	// released inside the session worker goroutine only.
	maxConcurrentChats = 8

	// maxSessions bounds how many session workers may exist. Beyond this
	// the adapter refuses to open new conversations rather than growing
	// goroutines without limit.
	maxSessions = 200

	// slotWait bounds how long a worker waits for a concurrency slot, so
	// shutdown can never be blocked by a saturated semaphore.
	slotWait = 5 * time.Second

	// inflightWait bounds how long shutdown waits for delivery goroutines
	// after the context has been cancelled.
	inflightWait = 5 * time.Second
)

var replied sync.Map // msgId → time.Time, with TTL cleanup

// Adapter wraps the openwechat bot and registers handlers.
type Adapter struct {
	// bot is swapped by the login loop only AFTER a successful login, so
	// a half-initialised bot is never visible to other code paths.
	botmu sync.RWMutex
	bot   *ow.Bot

	Handler        *message.Handler
	Sessions       *session.Manager
	ctx            context.Context
	onLoginSuccess func()

	// P5-3 login state machine.
	loginmu   sync.Mutex
	login     LoginStatus
	loginStop chan struct{} // closed when the loop should exit
	loginDone chan struct{} // closed when the loop has fully exited
	loginReq  chan LoginState
	loginOnce sync.Once

	// P5-1: one serial worker per SessionKey. deliverwg tracks both the
	// workers themselves and each in-flight task, so WaitInflight covers
	// everything the adapter started.
	sem       chan struct{}
	workers   map[string]*session.Session
	workmu    sync.Mutex
	deliverwg sync.WaitGroup
	accepting atomic.Bool
}

// Bot returns the currently active bot, or nil before a successful login.
func (a *Adapter) Bot() *ow.Bot {
	a.botmu.RLock()
	defer a.botmu.RUnlock()
	return a.bot
}

// setBot publishes a bot as the active one.
func (a *Adapter) setBot(b *ow.Bot) {
	a.botmu.Lock()
	a.bot = b
	a.botmu.Unlock()
}

// LoginStatus returns a snapshot of the login state machine.
func (a *Adapter) LoginStatus() LoginStatus {
	a.loginmu.Lock()
	defer a.loginmu.Unlock()
	return a.login
}

// RetryLogin asks the login loop to run the token path again immediately,
// resetting the attempt counter. It never triggers a QR/browser side
// effect by itself; it only re-arms the loop.
func (a *Adapter) RetryLogin() bool {
	select {
	case a.loginReq <- LoginHotLoggingIn:
		return true
	default:
		return false // a request is already pending
	}
}

// setLogin mutates the snapshot under lock.
func (a *Adapter) setLogin(fn func(*LoginStatus)) {
	a.loginmu.Lock()
	defer a.loginmu.Unlock()
	fn(&a.login)
}

// StartAsync runs the login state machine in the background and returns
// immediately, so the web UI is reachable regardless of WeChat's state.
//
// Frozen policy (Gate-3, option B):
//  1. First startup tries the token (hot login) only.
//  2. If that exhausts its retries, exactly ONE automatic scan-login is
//     attempted, controlled by the state machine.
//  3. If the scan also fails, the state becomes failed and no further QR
//     appears automatically; the operator must call RetryLogin (optionally
//     with a scan request) explicitly.
//  4. Later retries are token-only and never open a browser.
//
// The library's RetryLoginOption is deliberately NOT used: it converts a
// failed hot login into a full scan-login by itself, which would put the
// QR/browser side effect outside state-machine control.
func (a *Adapter) StartAsync() {
	a.loginOnce.Do(func() {
		go func() {
			defer close(a.loginDone)
			a.loginLoop()
		}()
	})
}

func (a *Adapter) loginLoop() {
	// 1. Token path with bounded retries. Skipped entirely when auto_login is
	//    off, so an operator who wants a fresh session gets a QR code straight
	//    away instead of five failed token attempts first. The key used to be
	//    parsed and ignored.
	if config.Snapshot().WeChat.AutoLogin {
		for attempt := 1; attempt <= maxHotLoginAttempts; attempt++ {
			a.setLogin(func(s *LoginStatus) {
				s.State = LoginHotLoggingIn
				s.Attempts = attempt
				s.QRURL = ""
			})

			if d := hotLoginBackoff(attempt); d > 0 {
				a.setLogin(func(s *LoginStatus) {
					s.NextRetry = time.Now().Add(d).Format(time.RFC3339)
				})
				if !a.sleep(d) {
					return
				}
			}

			err := a.tryHotLogin()
			if err == nil {
				a.markLoggedIn()
				return
			}

			logrus.Warnf("[login] hot login attempt %d/%d failed: %v", attempt, maxHotLoginAttempts, err)
			a.setLogin(func(s *LoginStatus) {
				s.LastError = err.Error()
				s.NextRetry = ""
			})
		}
	} else {
		logrus.Info("[login] auto_login is off; going straight to a QR scan")
	}

	// 2. One automatic scan-login fallback.
	a.setLogin(func(s *LoginStatus) {
		s.State = LoginWaitingScan
		s.LastError = "token 登录失败，等待扫码"
	})
	if err := a.tryScanLogin(); err == nil {
		a.markLoggedIn()
		return
	} else {
		logrus.Warnf("[login] automatic scan login failed: %v", err)
		a.setLogin(func(s *LoginStatus) {
			s.LastError = err.Error()
		})
	}

	// 3. Give up; wait for an explicit retry.
	a.setLogin(func(s *LoginStatus) {
		s.State = LoginFailed
		s.NextRetry = ""
	})
	logrus.Warnf("[login] giving up automatic login; use POST /api/login/retry to retry")

	// 4. Serve explicit retry requests forever. The process stays alive
	//    and the web UI stays usable regardless of WeChat's state.
	//
	// BUG-P6-2: a manual retry must be observable. Previously this branch
	// called tryHotLogin() with no state change, no attempt reset and no
	// log, so a failed manual retry was indistinguishable from a request
	// that never ran. Each accepted request now publishes a fresh cycle
	// (State + Attempts=0) and logs its outcome.
	for {
		select {
		case <-a.ctx.Done():
			return
		case <-a.loginStop:
			return
		case req := <-a.loginReq:
			logrus.Infof("[login] manual retry started")

			var err error
			if req == LoginWaitingScan {
				a.setLogin(func(s *LoginStatus) {
					s.State = LoginWaitingScan
					s.Attempts = 0
					s.QRURL = ""
				})
				err = a.tryScanLogin()
			} else {
				a.setLogin(func(s *LoginStatus) {
					s.State = LoginHotLoggingIn
					s.Attempts = 0
					s.QRURL = ""
				})
				err = a.tryHotLogin()
			}

			if err == nil {
				a.markLoggedIn()
				return
			}
			// Distinguishable from the automatic cycle's
			// "hot login attempt N/5 failed" line on purpose.
			logrus.Warnf("[login] manual retry failed: %v", err)
			a.setLogin(func(s *LoginStatus) {
				s.LastError = err.Error()
				s.State = LoginFailed
			})
		}
	}
}

// sleep waits for d, returning false if the adapter is shutting down.
func (a *Adapter) sleep(d time.Duration) bool {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-a.ctx.Done():
		return false
	case <-a.loginStop:
		return false
	case <-t.C:
		return true
	}
}

// tryHotLogin performs one token-based login on a fresh bot.
//
// RetryLoginOption is intentionally replaced by DoNothingBotLoginOption:
// the library's retry option would start a scan-login (and its QR/browser
// side effect) on its own, outside this state machine's control.
func (a *Adapter) tryHotLogin() error {
	bot := a.newBotWithHandler()
	a.attachCallbacks(bot)

	reload := ow.NewFileHotReloadStorage(tokenPath())

	if err := bot.HotLogin(reload, ow.DoNothingBotLoginOption); err != nil {
		return err
	}
	a.setBot(bot)
	return nil
}

// tryScanLogin runs exactly one interactive scan-login attempt. The QR may
// be shown because the caller has already moved the state to waiting_scan.
func (a *Adapter) tryScanLogin() error {
	if a.ctx.Err() != nil {
		return a.ctx.Err()
	}
	bot := a.newBotWithHandler()
	a.attachCallbacks(bot)

	done := make(chan error, 1)
	go func() { done <- bot.Login() }()

	timer := time.NewTimer(scanQRTimeout)
	defer timer.Stop()

	select {
	case err := <-done:
		if err != nil {
			return err
		}
		a.setBot(bot)
		return nil
	case <-timer.C:
		bot.Exit()
		return fmt.Errorf("scan login timed out after %s", scanQRTimeout)
	case <-a.ctx.Done():
		bot.Exit()
		return a.ctx.Err()
	}
}

// markLoggedIn publishes the logged-in state and fires the login hook once.
func (a *Adapter) markLoggedIn() {
	a.setLogin(func(s *LoginStatus) {
		s.State = LoginLoggedIn
		s.LastError = ""
		s.NextRetry = ""
	})
	if a.onLoginSuccess != nil {
		a.onLoginSuccess()
	}
	logrus.Infof("[login] WeChat login successful")
}

// attachCallbacks wires the state machine's callbacks onto a bot.
func (a *Adapter) attachCallbacks(bot *ow.Bot) {
	bot.UUIDCallback = func(uuid string) {
		// Reaching here means a scan is genuinely required, which only
		// happens on the automatic first-run fallback or an explicit
		// operator retry.
		a.setLogin(func(s *LoginStatus) {
			s.State = LoginWaitingScan
			s.QRURL = ow.GetQrcodeUrl(uuid)
		})
		qrDisplay(uuid)
	}
	bot.ScanCallBack = func(ow.CheckLoginResponse) {
		a.setLogin(func(s *LoginStatus) { s.State = LoginScanned })
	}
	bot.LoginCallBack = func(ow.CheckLoginResponse) {
		a.setLogin(func(s *LoginStatus) { s.State = LoginLoggedIn })
	}
}

// SetOnLoginSuccess sets the callback for successful login.
func (a *Adapter) SetOnLoginSuccess(fn func()) {
	a.onLoginSuccess = fn
}

// newBot constructs a fresh bot in desktop mode.
//
// It exists so the login lifecycle can be exercised by a probe without
// constructing a real bot, and so P5-3's retry loop can create a new bot
// per attempt. It performs no I/O.
var newBot = func() *ow.Bot { return ow.DefaultBot(ow.Desktop) }

// qrDisplay renders the login QR code. It is a package-level hook purely so
// tests can neutralise it: the library's default UUIDCallback opens a
// browser window, which an automated test must never do. Production keeps
// the terminal QR code.
var qrDisplay = func(uuid string) {
	q, err := qrcode.New(ow.GetQrcodeUrl(uuid), qrcode.Medium)
	if err != nil {
		logrus.Warnf("[scan] qr render failed: %v", err)
		return
	}
	fmt.Println(q.ToSmallString(false))
	logrus.Infof("[scan] QR code displayed, scan with WeChat")
}

// ── P5-3 login state machine ─────────────────────────────────────────

// LoginState is the externally observable login state.
type LoginState string

const (
	LoginIdle         LoginState = "idle"
	LoginHotLoggingIn LoginState = "hot_logging_in"
	LoginWaitingScan  LoginState = "waiting_scan"
	LoginScanned      LoginState = "scanned"
	LoginLoggedIn     LoginState = "logged_in"
	LoginFailed       LoginState = "failed"
)

// LoginStatus is a snapshot of the login state machine, safe to serialise.
type LoginStatus struct {
	State     LoginState `json:"state"`
	Attempts  int        `json:"attempts"`
	QRURL     string     `json:"qr_url,omitempty"`
	LastError string     `json:"last_error,omitempty"`
	NextRetry string     `json:"next_retry_at,omitempty"`
}

// Login policy (frozen in Gate-3).
const (
	// maxHotLoginAttempts bounds automatic token retries, so a revoked
	// token cannot spin forever in the background.
	maxHotLoginAttempts = 5

	// scanQRTimeout bounds the single automatic scan-login attempt before
	// the state machine gives up and waits for an explicit retry.
	scanQRTimeout = 3 * time.Minute
)

// hotLoginBackoff returns the delay before automatic attempt n (1-based).
// Attempt 1 happens immediately. Sequence: 0, 5, 10, 20, 40s.
//
// It is a package-level func variable so tests can compress the schedule;
// the default is the frozen production policy.
var hotLoginBackoff = func(attempt int) time.Duration {
	switch attempt {
	case 1:
		return 0
	case 2:
		return 5 * time.Second
	case 3:
		return 10 * time.Second
	case 4:
		return 20 * time.Second
	default:
		return 40 * time.Second
	}
}

// NewAdapter creates the wechat adapter.
func NewAdapter(ctx context.Context, cfg *config.Config, handler *message.Handler, sessMgr *session.Manager) (*Adapter, error) {
	a := &Adapter{
		Handler:   handler,
		Sessions:  sessMgr,
		ctx:       ctx,
		login:     LoginStatus{State: LoginIdle},
		loginStop: make(chan struct{}),
		loginDone: make(chan struct{}),
		loginReq:  make(chan LoginState, 1),
		sem:       make(chan struct{}, maxConcurrentChats),
		workers:   make(map[string]*session.Session),
	}
	a.setBot(a.newBotWithHandler())

	a.accepting.Store(true)
	// P5-2: a panicking task must be contained on its worker goroutine.
	session.OnTaskPanic = func(v any) {
		logrus.Errorf("[panic] session task recovered: %v", v)
	}
	// P5-2: enforce the global provider-call limit. The handler only
	// acquires from this channel inside worker goroutines.
	if handler != nil {
		handler.Sem = a.sem
		handler.SemWait = slotWait
	}

	// Fix-2: start replied cleanup with context awareness (replaces init())
	go func() {
		ticker := time.NewTicker(60 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				cutoff := time.Now().Add(-2 * time.Minute)
				replied.Range(func(key, value any) bool {
					if t, ok := value.(time.Time); ok && t.Before(cutoff) {
						replied.Delete(key)
					}
					return true
				})
			}
		}
	}()

	return a, nil
}

// newBotWithHandler builds a bot with the message dispatcher attached.
// The login loop creates one of these per attempt; the adapter also keeps
// one from construction so Bot() is never nil.
func (a *Adapter) newBotWithHandler() *ow.Bot {
	bot := newBot()
	bot.MessageHandler = a.dispatch()
	return bot
}

// tokenPath returns the configured hot-login storage path.
func tokenPath() string {
	p := config.Snapshot().WeChat.TokenFile
	if p == "" {
		p = filepath.Join(filepath.Dir(config.Path), "token.json")
	}
	return p
}

// StopLoginLoop closes the state machine's background loop and waits for
// it to exit, so no login attempt can still be in flight afterwards. It
// is idempotent.
func (a *Adapter) StopLoginLoop() {
	select {
	case <-a.loginStop:
		// already closed
	default:
		close(a.loginStop)
	}
	if a.loginDone != nil {
		select {
		case <-a.loginDone:
		case <-time.After(5 * time.Second):
			logrus.Warnf("[login] login loop did not stop within 5s")
		}
	}
}

// dispatch builds the message‑match dispatcher.
//
// P5-1: the dispatcher is set to async so a handler never occupies the
// bot's message-sync goroutine, and every handler body is additionally
// wrapped so that a panic in one message cannot kill the process (P5-2).
func (a *Adapter) dispatch() ow.MessageHandler {
	dispatcher := ow.NewMessageMatchDispatcher()
	dispatcher.SetAsync(true)

	// Unified text + system message handler (deduplicated)
	dispatcher.OnText(a.guard(a.onText))
	dispatcher.OnImage(a.guard(a.onImage))
	dispatcher.OnEmoticon(a.guard(a.onImage))

	// 拍一拍 (tickle/pat) — 只回复拍自己的
	dispatcher.RegisterHandler(
		func(msg *ow.Message) bool { return msg.IsTickledMe() },
		a.guard(a.onTickle),
	)

	return dispatcher.AsMessageHandler()
}

// guard wraps a message handler so that:
//   - messages that arrive after shutdown began are ignored, and
//   - a panic is contained to its own message instead of killing the
//     process (P5-2 panic isolation).
func (a *Adapter) guard(h func(*ow.MessageContext)) func(*ow.MessageContext) {
	return func(ctx *ow.MessageContext) {
		if !a.accepting.Load() {
			return
		}
		defer func() {
			if r := recover(); r != nil {
				logrus.Errorf("[panic] message handler recovered: %v", r)
			}
		}()
		h(ctx)
	}
}

// runOnWorker enqueues fn onto the serial worker for key (P5-1). It
// returns false when the task was rejected, either because delivery is
// shutting down or because the session backlog is full.
//
// This function is called from the bot's sync goroutine, so it must never
// block: enqueueing is a non-blocking channel send, and a new worker is
// only registered when a session is first seen.
func (a *Adapter) runOnWorker(key string, fn session.Task) bool {
	if !a.accepting.Load() {
		return false
	}
	sess := a.workerFor(key)
	if sess == nil {
		return false
	}
	if !sess.RunSerial(fn) {
		logrus.Warnf("[queue] backlog full for %s, message dropped (pending=%d)", key, sess.Pending())
		return false
	}
	return true
}

// workerFor returns the serial worker for key, creating it on first use.
// Returns nil when the session cap is reached, or after shutdown.
func (a *Adapter) workerFor(key string) *session.Session {
	a.workmu.Lock()
	defer a.workmu.Unlock()

	if !a.accepting.Load() {
		return nil
	}
	if s, ok := a.workers[key]; ok {
		return s
	}
	if len(a.workers) >= maxSessions {
		logrus.Warnf("[queue] session limit %d reached, refusing %s", maxSessions, key)
		return nil
	}
	if a.Sessions == nil {
		return nil
	}
	s := a.Sessions.Get(key)
	if s == nil {
		return nil
	}
	s.StartWorker(a.ctx, &a.deliverwg)
	a.workers[key] = s
	return s
}

// StopAccepting closes the door on new deliveries and stops every worker.
// It must be called before WaitInflight so the inflight set cannot grow
// while we are waiting on it (P5-2).
func (a *Adapter) StopAccepting() {
	a.accepting.Store(false)

	a.workmu.Lock()
	all := make([]*session.Session, 0, len(a.workers))
	for k, s := range a.workers {
		all = append(all, s)
		delete(a.workers, k)
	}
	a.workmu.Unlock()

	for _, s := range all {
		s.Stop()
	}
}

// WaitInflight waits for worker and task goroutines to finish, bounded by
// the supplied context or inflightWait, whichever comes first.
func (a *Adapter) WaitInflight() {
	done := make(chan struct{})
	go func() {
		a.deliverwg.Wait()
		close(done)
	}()
	select {
	case <-done:
	case <-time.After(inflightWait):
		logrus.Warnf("[shutdown] inflight tasks did not finish within %s", inflightWait)
	}
}

func (a *Adapter) onTickle(ctx *ow.MessageContext) {
	logrus.Infof("[tickle] detected in group=%v, replying", ctx.IsSendByGroup())
	if _, err := ctx.ReplyText(randomTrickReply()); err != nil {
		logrus.Warnf("[tickle] reply failed: %v", err)
	}
}

// ── P5-5 / P5-6 key derivation ───────────────────────────────────────
//
// These helpers are deliberately pure so the isolation and dedup rules
// can be unit-tested without constructing concrete openwechat types
// (which would require a live bot).

// sessionKind classifies a message as "group" or "private".
func sessionKind(isGroup bool) string {
	if isGroup {
		return "group"
	}
	return "private"
}

// roomKey returns the stable room identifier for a group message, or ""
// for private chats. Stable room UserName (@@xxx@chatroom) is used rather
// than the mutable room display name.
func roomKey(isGroup bool, fromUserName string) string {
	if !isGroup {
		return ""
	}
	return fromUserName
}

// buildSessionKey derives the conversation isolation key (P5-5):
//
//	private:<senderUserName>
//	group:<roomUserName>:<senderUserName>
func buildSessionKey(kind, room, userName string) string {
	if kind == "group" && room != "" {
		return "group:" + room + ":" + userName
	}
	return "private:" + userName
}

// displayNameFor picks the human-readable label: in group chats the
// per-room display name wins, otherwise the nickname, falling back to
// the stable identifier so a label is never empty.
func displayNameFor(isGroup bool, nickName, displayName, userName string) string {
	name := nickName
	if isGroup && displayName != "" {
		name = displayName
	}
	if name == "" {
		name = userName
	}
	return name
}

// validMsgID reports whether a message id can be used for dedup.
// WeChat emits MsgId "0" as a placeholder for some message kinds, which
// must not be treated as a real id or every such message would collide.
func validMsgID(id string) bool {
	return id != "" && id != "0"
}

// contentDedupKey returns the fallback dedup key used only when no usable
// message id exists (P5-6). It is keyed on the stable UserName rather than
// the mutable nickname.
//
// The user name is length-prefixed so the encoding is injective: a NUL
// separator alone is not sufficient, because ("a\x00b", "c") and ("a",
// "b\x00c") would otherwise concatenate to the same byte string.
func contentDedupKey(userName, content string) string {
	return strconv.Itoa(len(userName)) + ":" + userName + "\x00" + content
}

// checkNeedReply decides whether the bot should answer this message.
//
// sender must be the already-resolved sender for msg (P5-4): resolving it
// here duplicated an O(n) contact lookup and left an unguarded nil
// dereference when Sender() returned (nil, err). Callers resolve once.
//
// As a side effect, msg.Content is normalised: leading/trailing space is
// trimmed and, for group @-mentions, the "@<bot>" prefix is removed.
// checkNeedReply reports whether the bot should reply.
func (a *Adapter) checkNeedReply(msg *ow.Message, sender *ow.User) bool {
	msg.Content = strings.TrimSpace(msg.Content)
	if msg.Content == "" || msg.IsSendBySelf() {
		return false
	}
	if !msg.IsSendByGroup() {
		// 私聊：非公众号消息都回复
		if sender == nil {
			logrus.Debugf("[check] private chat, sender unresolved, skip")
			return false
		}
		if sender.IsMP() {
			return false
		}
		logrus.Debugf("[check] private chat from %s, reply", sender.NickName)
		return true
	}
	// 群聊：只回复 @机器人 或 trigger_prefix
	if msg.IsAt() {
		owner := msg.Owner()
		if owner != nil {
			msg.Content = strings.Replace(msg.Content, "@"+owner.NickName, "", 1)
			msg.Content = strings.TrimSpace(msg.Content)
		}
		logrus.Debugf("[check] group @mention, reply")
		return true
	}
	prefix := config.Snapshot().WeChat.TriggerPrefix
	if prefix != "" && strings.HasPrefix(msg.Content, prefix) {
		logrus.Debugf("[check] group trigger prefix '%s', reply", prefix)
		return true
	}
	logrus.Debugf("[check] group msg ignored (no @, no prefix)")
	return false
}

func (a *Adapter) onText(ctx *ow.MessageContext) {
	if ctx.IsSendBySelf() {
		return
	}

	if ctx.IsJoinGroup() {
		if _, err := ctx.ReplyText("欢迎欢迎～"); err != nil {
			logrus.Warnf("[text] welcome reply failed: %v", err)
		}
		return
	}

	// Dedup layer 1: msgId-based
	msgID := ctx.MsgId
	if !validMsgID(msgID) {
		msgID = fmt.Sprintf("%d", ctx.NewMsgId)
		if !validMsgID(msgID) {
			msgID = ""
		}
	}
	if msgID != "" {
		if _, loaded := replied.LoadOrStore(msgID, time.Now()); loaded {
			return
		}
	}

	// Resolve the sender exactly once (P5-4). Sender() may legitimately
	// return (user, err) with a usable user — e.g. when the contact cache
	// missed and Detail() failed — so only give up when there is no user.
	isGroup := ctx.IsSendByGroup()
	sender, err := ctx.Sender()
	if isGroup {
		sender, err = ctx.SenderInGroup()
	}
	if sender == nil {
		logrus.Warnf("[text] sender unresolved: %v", err)
		return
	}

	uid := sender.UserName
	if uid == "" {
		// Defensive: never key a session on an empty identifier.
		logrus.Warnf("[text] empty UserName (nick=%q), skipping", sender.NickName)
		return
	}

	kind := sessionKind(isGroup)
	room := roomKey(isGroup, ctx.FromUserName)
	nick := displayNameFor(isGroup, sender.NickName, sender.DisplayName, uid)
	sessionKey := buildSessionKey(kind, room, uid)

	// Dedup layer 2: only when no usable msgId exists, keyed on the
	// stable UserName rather than the mutable nickname (P5-6).
	if msgID == "" {
		if _, loaded := replied.LoadOrStore(contentDedupKey(uid, ctx.Content), time.Now()); loaded {
			return
		}
	}

	if !a.checkNeedReply(ctx.Message, sender) {
		return
	}

	// P5-1: everything that can block (the provider call, the reply) is
	// handed to this session's serial worker. The enqueue below is a
	// non-blocking send, so the bot's sync goroutine never waits here.
	//
	// msg is captured deliberately: Message.ReplyText routes through the
	// bot owner pointer, not through the per-batch MessageContext, so it
	// is safe to send from the worker goroutine.
	txt := ctx.Content
	msg := ctx.Message
	task := message.ChatTask{
		SessionKey: sessionKey,
		Room:       room,
		Display:    nick,
		UserName:   uid,
		Content:    txt,
		Kind:       kind,
	}
	// Give the worker the panic-isolation boundary too: a panic in a task
	// runs on the worker goroutine, where guard() cannot reach it.
	a.deliverwg.Add(1)
	if !a.runOnWorker(sessionKey, func(context.Context) {
		defer a.deliverwg.Done()
		defer func() {
			if r := recover(); r != nil {
				logrus.Errorf("[panic] task recovered for %s: %v", sessionKey, r)
			}
		}()
		a.handleTextTask(msg, task, txt, nick)
	}) {
		a.deliverwg.Done()
	}
}

// handleTextTask runs on a session worker goroutine. Because exactly one
// worker exists per SessionKey, tasks for the same conversation execute
// strictly one after another: A handled -> A replied/appended -> B handled.
func (a *Adapter) handleTextTask(msg *ow.Message, target message.ChatTask, txt, nick string) {
	// leak check
	if lower := strings.ToLower(txt); lower != "" {
		for _, kw := range message.LeakKeywords {
			if strings.Contains(lower, kw) {
				logrus.Debugf("[text] leak keyword blocked for %s", target.SessionKey)
				a.reply(msg, target.SessionKey, "唔…这个不能告诉你哦～")
				return
			}
		}
	}

	res := a.Handler.Handle(a.ctx, target)
	if res.Reply == "" {
		return
	}
	if res.Err {
		// Failure notice: still delivered to the user (matching the
		// original behaviour) but never treated as a model answer.
		logrus.Warnf("[text] handle failed for %s: %s", target.SessionKey, res.Reply)
	}
	a.reply(msg, target.SessionKey, res.Reply)

	// Never synthesise speech from a failure notice.
	if !res.Err && message.WantsVoiceReply(txt) {
		a.deliverwg.Add(1)
		go func() {
			defer a.deliverwg.Done()
			a.handleVoice(target, res.Reply, nick)
		}()
	}
}

// reply sends text on msg and logs a warning if the send fails (P5-4).
// Safe from a worker goroutine. The error is deliberately not returned:
// callers have nothing useful to do with it.
func (a *Adapter) reply(msg *ow.Message, sessionKey, text string) {
	if msg == nil || text == "" {
		return
	}
	if _, err := msg.ReplyText(text); err != nil {
		logrus.Warnf("[text] reply failed for %s: %v", sessionKey, err)
	}
}

func (a *Adapter) onImage(ctx *ow.MessageContext) {
	if ctx.IsSendBySelf() || !a.accepting.Load() {
		return
	}
	// Resolve the sender exactly once (P5-4).
	sender, err := ctx.Sender()
	if ctx.IsSendByGroup() {
		sender, err = ctx.SenderInGroup()
	}
	if sender == nil {
		logrus.Warnf("[image] sender unresolved: %v", err)
		return
	}
	nick := sender.NickName
	uid := sender.UserName
	if uid == "" {
		logrus.Warnf("[image] empty UserName for %q, skipping", nick)
		return
	}

	resp, err := ctx.GetPicture()
	if err != nil {
		logrus.Errorf("[image] GetPicture failed: %v", err)
		return
	}
	if resp == nil || resp.Body == nil {
		logrus.Errorf("[image] GetPicture returned empty response")
		return
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		logrus.Errorf("[image] read body failed: %v", err)
		return
	}
	mime := guessMime(data)
	if mime == "" {
		logrus.Debugf("[image] unrecognised image format from %s, ignored", nick)
		return
	}

	// Cache keyed by unique UserName (not NickName, which can collide)
	message.CacheImage(uid, data, mime)

	// Only auto‑reply if explicitly triggered
	isTriggered := ctx.IsAt()
	if ctx.IsSendByGroup() && !isTriggered {
		logrus.Infof("[image] cached for %s, no @, no reply", nick)
		return
	}
}

func (a *Adapter) handleVoice(task message.ChatTask, reply, nick string) {
	// TODO: Implement TTS in a future phase. Currently a no-op.
	logrus.Infof("[voice] generating for %s: %s", nick, reply)
}

func guessMime(data []byte) string {
	if len(data) < 4 {
		return ""
	}
	switch {
	case data[0] == 0xff && data[1] == 0xd8:
		return "image/jpeg"
	case data[0] == 0x89 && data[1] == 'P' && data[2] == 'N' && data[3] == 'G':
		return "image/png"
	case data[0] == 'G' && data[1] == 'I' && data[2] == 'F':
		return "image/gif"
	case data[0] == 'R' && data[1] == 'I' && data[2] == 'F' && data[3] == 'F':
		return "image/webp"
	}
	return ""
}
