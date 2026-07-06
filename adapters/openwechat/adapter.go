// Package openwechat implements the WeChat adapter for SorarinBot.
// This adapter translates WeChat events into handler calls.
package openwechat

import (
	"context"
	"fmt"
	"io"
	"path/filepath"
	"strings"
	"sync"

	ow "SorarinBot/internal/openwechat"
	"SorarinBot/core/config"
	"SorarinBot/core/message"
	"SorarinBot/core/session"

	"github.com/skip2/go-qrcode"
	"github.com/sirupsen/logrus"
)

var replied sync.Map

// Adapter wraps the openwechat bot and registers handlers.
type Adapter struct {
	Bot            *ow.Bot
	Handler        *message.Handler
	Sessions       *session.Manager
	ctx            context.Context
	onLoginSuccess func()
}

// SetOnLoginSuccess sets the callback for successful login.
func (a *Adapter) SetOnLoginSuccess(fn func()) {
	a.onLoginSuccess = fn
}

// NewAdapter creates the wechat adapter.
func NewAdapter(ctx context.Context, cfg *config.Config, handler *message.Handler, sessMgr *session.Manager) (*Adapter, error) {
	bot := ow.DefaultBot(ow.Desktop)
	a := &Adapter{
		Bot:      bot,
		Handler:  handler,
		Sessions: sessMgr,
		ctx:      ctx,
	}
	bot.UUIDCallback = a.onQR
	bot.MessageHandler = a.dispatch()

	// 扫码登录成功后隐藏终端窗口
	bot.LoginCallBack = func(resp ow.CheckLoginResponse) {
		logrus.Infof("[login] WeChat login successful")
		// hideConsoleWindow is defined in main package platform_windows.go
		// We signal via a channel instead
		if a.onLoginSuccess != nil {
			a.onLoginSuccess()
		}
	}

	return a, nil
}

// Start begins the wechat login loop.
func (a *Adapter) Start() error {
	tokenPath := config.Snapshot().WeChat.TokenFile
	if tokenPath == "" {
		tokenPath = filepath.Join(filepath.Dir(config.Path), "token.json")
	}
	reload := ow.NewFileHotReloadStorage(tokenPath)
	return a.Bot.HotLogin(reload, ow.NewRetryLoginOption())
}

func (a *Adapter) onQR(uuid string) {
	q, _ := qrcode.New("https://login.weixin.qq.com/l/"+uuid, qrcode.Medium)
	fmt.Println(q.ToSmallString(false))
	logrus.Infof("[scan] QR code displayed, scan with WeChat")
}

// dispatch builds the message‑match dispatcher.
func (a *Adapter) dispatch() ow.MessageHandler {
	dispatcher := ow.NewMessageMatchDispatcher()

	// Unified text + system message handler (deduplicated)
	dispatcher.OnText(a.onText)
	dispatcher.OnImage(a.onImage)
	dispatcher.OnEmoticon(a.onImage)

	// 拍一拍 (tickle/pat) — 只回复拍自己的
	dispatcher.RegisterHandler(
		func(msg *ow.Message) bool { return msg.IsTickledMe() },
		a.onTickle,
	)

	return dispatcher.AsMessageHandler()
}

func (a *Adapter) onTickle(ctx *ow.MessageContext) {
	logrus.Infof("[tickle] detected in group=%v, replying", ctx.IsSendByGroup())
	ctx.ReplyText(randomTrickReply())
}

func (a *Adapter) checkNeedReply(msg *ow.Message) (need bool, isimg bool) {
	msg.Content = strings.TrimSpace(msg.Content)
	if msg.Content == "" || msg.IsSendBySelf() {
		return false, false
	}
	if !msg.IsSendByGroup() {
		// 私聊：非公众号消息都回复
		sender, _ := msg.Sender()
		if sender != nil && sender.IsMP() {
			return false, false
		}
		logrus.Debugf("[check] private chat from %s, reply", sender.NickName)
		return true, false
	}
	// 群聊：只回复 @机器人 或 trigger_prefix
	if msg.IsAt() {
		msg.Content = strings.Replace(msg.Content, "@"+msg.Owner().NickName, "", 1)
		msg.Content = strings.TrimSpace(msg.Content)
		logrus.Debugf("[check] group @mention, reply")
		return true, false
	}
	prefix := config.Snapshot().WeChat.TriggerPrefix
	if prefix != "" && strings.HasPrefix(msg.Content, prefix) {
		logrus.Debugf("[check] group trigger prefix '%s', reply", prefix)
		return true, false
	}
	logrus.Debugf("[check] group msg ignored (no @, no prefix)")
	return false, false
}

func (a *Adapter) onText(ctx *ow.MessageContext) {
	// skip self and system messages
	if ctx.IsSendBySelf() {
		return
	}

	// Handle join group
	if ctx.IsJoinGroup() {
		ctx.ReplyText("欢迎欢迎～")
		return
	}

	// Deduplicate: same msg id already replied
	msgID := ctx.MsgId
	if msgID == "" {
		msgID = fmt.Sprintf("%d", ctx.NewMsgId)
	}
	if msgID != "" {
		if _, loaded := replied.LoadOrStore(msgID, true); loaded {
			logrus.Debugf("[text] duplicate msgId=%s, skipping", msgID)
			return
		}
	}

	need, _ := a.checkNeedReply(ctx.Message)
	if !need {
		return
	}

	sender, _ := ctx.Sender()
	if ctx.IsSendByGroup() {
		sender, _ = ctx.SenderInGroup()
	}
	nick := sender.NickName

	// leak check
	for _, kw := range message.LeakKeywords {
		if strings.Contains(strings.ToLower(ctx.Content), kw) {
			ctx.ReplyText("唔…这个不能告诉你哦～")
			return
		}
	}

	txt := ctx.Content
	reply := a.Handler.HandleText(a.ctx, nick, txt)
	if reply == "" {
		return // duplicate message, skip
	}
	ctx.ReplyText(reply)

	if message.WantsVoiceReply(txt) {
		go a.handleVoice(ctx, reply, nick)
	}
}

func (a *Adapter) onImage(ctx *ow.MessageContext) {
	if ctx.IsSendBySelf() {
		return
	}
	sender, _ := ctx.Sender()
	if ctx.IsSendByGroup() {
		sender, _ = ctx.SenderInGroup()
	}
	nick := sender.NickName

	resp, err := ctx.GetPicture()
	if err != nil {
		logrus.Errorf("[image] GetPicture failed: %v", err)
		return
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	mime := guessMime(data)
	if mime == "" {
		return
	}

	// Cache for the text handler
	message.CacheImage(nick, data, mime)

	// Only auto‑reply if explicitly triggered
	isTriggered := ctx.IsAt()
	if ctx.IsSendByGroup() && !isTriggered {
		logrus.Infof("[image] cached for %s, no @, no reply", nick)
		return
	}
}

func (a *Adapter) handleVoice(ctx *ow.MessageContext, reply, nick string) {
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
