// Package message handles incoming WeChat messages and dispatches to the LLM.
package message

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"SorarinBot/core/session"
	"SorarinBot/providers"
)

type Handler struct {
	mu       sync.Mutex
	Provider providers.Provider
	Sessions *session.Manager
	ImageTTL time.Duration
	DB       interface {
		InsertMessage(sender, room, userMsg, botReply, model string, promptTokens, completionTokens, totalTokens int)
	}

	// Sem is an optional global concurrency limit for provider calls
	// (P5-2). It is acquired and released strictly around Provider.Chat
	// inside Handle, which always runs on a session worker goroutine —
	// never on the WeChat sync goroutine. A nil Sem means unbounded.
	Sem chan struct{}

	// SemWait bounds how long a worker waits for a concurrency slot
	// before giving up, so shutdown cannot be blocked by a full
	// semaphore. Zero means wait forever.
	SemWait time.Duration
}

// acquireSlot takes a global concurrency slot (P5-2). It MUST only be
// called from a session worker goroutine; calling it on the WeChat sync
// goroutine would reintroduce the long-poll stall this phase removes.
// Returns false when no slot became available (context cancelled or
// SemWait elapsed), in which case the caller must not call the provider.
func (h *Handler) acquireSlot(ctx context.Context) bool {
	if h.Sem == nil {
		return true
	}
	select {
	case h.Sem <- struct{}{}:
		return true
	default:
	}
	if h.SemWait <= 0 {
		select {
		case h.Sem <- struct{}{}:
			return true
		case <-ctx.Done():
			return false
		}
	}
	timer := time.NewTimer(h.SemWait)
	defer timer.Stop()
	select {
	case h.Sem <- struct{}{}:
		return true
	case <-ctx.Done():
		return false
	case <-timer.C:
		return false
	}
}

// releaseSlot returns a global concurrency slot.
func (h *Handler) releaseSlot() {
	if h.Sem == nil {
		return
	}
	select {
	case <-h.Sem:
	default:
	}
}

// SetProvider swaps the LLM provider at runtime (thread-safe).
func (h *Handler) SetProvider(p providers.Provider) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.Provider = p
}

// imageCache is a simple RAM cache keyed by "sender" (dev‑grade – not for prod).
type imageCache struct {
	Data []byte
	Mime string
	Time time.Time
}

var imgCache sync.Map

func init() {
	// Fix-4: periodic cleanup of expired image cache entries
	go func() {
		ticker := time.NewTicker(5 * time.Minute)
		defer ticker.Stop()
		for range ticker.C {
			imgCache.Range(func(key, value any) bool {
				if entry, ok := value.(imageCache); ok {
					if time.Since(entry.Time) > 10*time.Minute {
						imgCache.Delete(key)
					}
				}
				return true
			})
		}
	}()
}

// CacheImage stores image bytes for the given sender.
func CacheImage(sender string, data []byte, mime string) {
	imgCache.Store(sender, imageCache{Data: data, Mime: mime, Time: time.Now()})
}

// PopImage retrieves and removes the image for the sender if within TTL.
func PopImage(sender string, ttl time.Duration) ([]byte, string, bool) {
	v, ok := imgCache.Load(sender)
	if !ok {
		return nil, "", false
	}
	imgCache.Delete(sender)
	entry := v.(imageCache)
	if time.Since(entry.Time) > ttl {
		return nil, "", false
	}
	return entry.Data, entry.Mime, true
}

// ChatTask is one unit of work: a single incoming message plus the
// identity information required to isolate and record it (P5-5).
type ChatTask struct {
	// SessionKey is the isolation key and the sole determinant of which
	// conversation buffer is used:
	//   "private:<senderUserName>"
	//   "group:<roomUserName>:<senderUserName>"
	SessionKey string

	// Room is the room UserName for group messages ("@@xxx@chatroom"),
	// empty for private chats. Persisted to the messages.room column.
	Room string

	// Display is the human-readable sender name, for logs and UI only.
	// It is never used for keying.
	Display string

	// UserName is the stable sender identifier. Also the image cache key.
	UserName string

	// Content is the (already trigger-stripped) message text.
	Content string

	// Kind is "private" or "group", for logging.
	Kind string
}

// ChatResult carries the reply plus non-fatal notes for the caller.
// Empty Reply always means "do not send anything".
type ChatResult struct {
	Reply string

	// Err is true when Reply is a user-facing failure notice (transport
	// error, API error, empty completion) rather than a model answer.
	// Such notices must never be persisted as conversation history.
	Err bool
}

// Handle processes a message task and returns the reply.
func (h *Handler) Handle(ctx context.Context, t ChatTask) ChatResult {
	// Fix-1: copy Provider reference under lock to avoid data race
	h.mu.Lock()
	provider := h.Provider
	h.mu.Unlock()

	// Build context messages
	imgData, imgMime, hasImage := PopImage(t.UserName, h.ImageTTL)

	if h.Sessions == nil {
		return ChatResult{Reply: "唔…内部错误", Err: true}
	}
	sess := h.Sessions.Get(t.SessionKey)
	if sess == nil {
		return ChatResult{Reply: "唔…内部错误", Err: true}
	}
	sess.SetMeta(t.Display, t.Room, t.Kind)
	sess.SetMax(h.Sessions.MaxPairs)

	msgs := sess.BuildMessages(t.Content, nil)

	req := providers.ChatRequest{
		Messages: msgs,
	}
	if hasImage {
		req.Image = &providers.ImageContent{MimeType: imgMime, Data: imgData}
	}

	chatCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	// P5-2: acquire a global concurrency slot. This always runs on a
	// session worker goroutine, never on the WeChat sync goroutine.
	if !h.acquireSlot(chatCtx) {
		return ChatResult{Reply: "", Err: true}
	}
	defer h.releaseSlot()

	resp, err := provider.Chat(chatCtx, req)
	if err != nil {
		return ChatResult{Reply: fmt.Sprintf("唔…出错了: %v", err), Err: true}
	}
	if resp == nil || len(resp.Choices) == 0 {
		return ChatResult{Reply: "唔…没有收到回复", Err: true}
	}
	reply := resp.Choices[0].Message.Content
	reply = stripThinkBlocks(reply)
	if reply == "" {
		// The model produced no usable text (e.g. it emitted only a
		// reasoning block). Send nothing and record nothing.
		return ChatResult{Reply: ""}
	}

	// Save context
	sess.Append(t.Content, reply)

	// Persist to database
	if h.DB != nil {
		h.DB.InsertMessage(t.Display, t.Room, t.Content, reply, resp.Model,
			resp.Usage.PromptTokens, resp.Usage.CompletionTokens, resp.Usage.TotalTokens)
	}

	return ChatResult{Reply: reply}
}

// HandleText is a convenience wrapper for the common single-message case.
// Deprecated: prefer Handle with an explicit ChatTask.
func (h *Handler) HandleText(ctx context.Context, uid, sender, msg string) string {
	return h.Handle(ctx, ChatTask{
		SessionKey: "private:" + uid,
		Display:    sender,
		UserName:   uid,
		Content:    msg,
		Kind:       "private",
	}).Reply
}

func stripThinkBlocks(s string) string {
	for {
		start := strings.Index(s, "<think>")
		end := strings.Index(s, "</think>")
		if start == -1 || end == -1 || end < start {
			break
		}
		s = s[:start] + s[end+len("</think>"):]
	}
	return strings.TrimSpace(s)
}

// TriggerWords for voice reply detection.
var voiceKeywords = []string{
	"用语音回答", "用语音回复", "用语音介绍", "用语音说",
	"语音回答", "语音回复", "念出来", "发语音",
}

// WantsVoiceReply reports whether the message asks for an audio reply.
func WantsVoiceReply(msg string) bool {
	msg = strings.ToLower(msg)
	for _, kw := range voiceKeywords {
		if strings.Contains(msg, kw) {
			return true
		}
	}
	if strings.Contains(msg, "语音") {
		for _, v := range []string{"回复", "回答", "介绍", "说", "播", "讲", "念"} {
			if strings.Contains(msg, v) {
				return true
			}
		}
	}
	return false
}

// LeakKeywords is used by the handler to block prompt‑leak attempts.
var LeakKeywords = []string{
	"system prompt", "ignore previous", "repeat the prompt", "base64",
}
