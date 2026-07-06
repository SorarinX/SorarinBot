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
	Bot      *ow.Bot
	Handler  *message.Handler
	Sessions *session.Manager
	ctx      context.Context
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

	return dispatcher.AsMessageHandler()
}

func (a *Adapter) checkNeedReply(msg *ow.Message) (need bool, isimg bool) {
	msg.Content = strings.TrimSpace(msg.Content)
	if msg.Content == "" || msg.IsSendBySelf() {
		return false, false
	}
	if !msg.IsSendByGroup() {
		sender, _ := msg.Sender()
		if sender != nil && sender.IsMP() {
			return false, false
		}
		return true, false
	}
	if msg.IsAt() {
		msg.Content = strings.Replace(msg.Content, "@"+msg.Owner().NickName, "", 1)
		msg.Content = strings.TrimSpace(msg.Content)
		return true, false
	}
	if strings.HasPrefix(msg.Content, config.Snapshot().WeChat.TriggerPrefix) {
		return true, false
	}
	return false, false
}

func (a *Adapter) onText(ctx *ow.MessageContext) {
	// skip self and system messages
	if ctx.IsSendBySelf() {
		return
	}

	// Handle tickle and join group inside the text handler
	if ctx.IsTickled() {
		ctx.ReplyText(randomTrickReply())
		return
	}
	if ctx.IsJoinGroup() {
		ctx.ReplyText("欢迎欢迎～")
		return
	}

	sender, _ := ctx.Sender()
	if ctx.IsSendByGroup() {
		sender, _ = ctx.SenderInGroup()
	}
	nick := sender.NickName

	// Deduplicate: same msg id already replied
	msgID := ctx.MsgId
	if msgID == "" {
		msgID = fmt.Sprintf("%d", ctx.NewMsgId)
	}
	if msgID != "" {
		if _, loaded := replied.LoadOrStore(msgID, true); loaded {
			logrus.Debugf("[text] duplicate msgId=%s from %s, skipping", msgID, nick)
			return
		}
	}

	need, _ := a.checkNeedReply(ctx.Message)
	if !need {
		return
	}

	// leak check
	for _, kw := range message.LeakKeywords {
		if strings.Contains(strings.ToLower(ctx.Content), kw) {
			ctx.ReplyText("唔…这个不能告诉你哦～")
			return
		}
	}

	txt := ctx.Content
	reply := a.Handler.HandleText(a.ctx, nick, txt)
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
