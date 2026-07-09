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

// HandleText processes a text message and returns the reply.
// uid is the unique user identifier (for image cache), sender is the display name (for session).
func (h *Handler) HandleText(ctx context.Context, uid, sender, msg string) string {
	// Fix-1: copy Provider reference under lock to avoid data race
	h.mu.Lock()
	provider := h.Provider
	h.mu.Unlock()

	// Build context messages
	imgData, imgMime, hasImage := PopImage(uid, h.ImageTTL)

	sess := h.Sessions.Get(sender)
	msgs := sess.BuildMessages(msg, nil)

	req := providers.ChatRequest{
		Messages: msgs,
	}
	if hasImage {
		req.Image = &providers.ImageContent{MimeType: imgMime, Data: imgData}
	}

	chatCtx, cancel := context.WithTimeout(ctx, 60*time.Second)
	defer cancel()

	resp, err := provider.Chat(chatCtx, req)
	if err != nil {
		return fmt.Sprintf("唔…出错了: %v", err)
	}
	if len(resp.Choices) == 0 {
		return "唔…没有收到回复"
	}
	reply := resp.Choices[0].Message.Content
	reply = stripThinkBlocks(reply)

	// Save context
	sess.Append(msg, reply)

	// Persist to database
	if h.DB != nil {
		h.DB.InsertMessage(sender, "", msg, reply, resp.Model,
			resp.Usage.PromptTokens, resp.Usage.CompletionTokens, resp.Usage.TotalTokens)
	}

	return reply
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
