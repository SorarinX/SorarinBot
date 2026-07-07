// Package openaicompat implements the OpenAI-compatible provider.
// Supports any service with /v1/chat/completions endpoint.
package openaicompat

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"SorarinBot/providers"

	"github.com/sirupsen/logrus"
)

// Config is the connection config for an OpenAI-compatible provider.
type Config struct {
	Name    string // registry key, e.g. "openai", "minimax"
	BaseURL string // e.g. "https://api.openai.com/v1"
	APIKey  string
	Model   string
	Timeout time.Duration
}

// Client is the OpenAI-compatible Provider implementation.
type Client struct {
	cfg     Config
	http    *http.Client
	vision  bool // cached: does the configured model support images
}

// New constructs a Client.
func New(cfg Config) *Client {
	if cfg.Timeout == 0 {
		cfg.Timeout = 60 * time.Second
	}
	if cfg.Name == "" {
		cfg.Name = "openaicompat"
	}
	cfg.BaseURL = strings.TrimRight(cfg.BaseURL, "/")
	return &Client{
		cfg:    cfg,
		http:   &http.Client{Timeout: cfg.Timeout},
		vision: detectVisionSupport(cfg.Model),
	}
}

// Name implements provider.Provider.
func (c *Client) Name() string { return c.cfg.Name }

// BaseURL returns the configured base URL (for debugging).
func (c *Client) BaseURL() string { return c.cfg.BaseURL }

// SupportsVision implements provider.Provider.
func (c *Client) SupportsVision() bool { return c.vision }

// detectVisionSupport uses simple heuristics; users can override at config time later.
func detectVisionSupport(model string) bool {
	m := strings.ToLower(model)
	visionHints := []string{"vision", "gpt-4o", "gpt-4-vision", "claude-3", "gemini", "minimax-m3", "qwen-vl"}
	for _, h := range visionHints {
		if strings.Contains(m, h) {
			return true
		}
	}
	return false
}

// Chat implements provider.Provider.
func (c *Client) Chat(ctx context.Context, req providers.ChatRequest) (*providers.ChatResponse, error) {
	body := c.buildBody(req)
	raw, err := c.doPost(ctx, "/chat/completions", body)
	if err != nil {
		return nil, err
	}
	return c.parseResponse(raw)
}

type wireRequest struct {
	Model       string        `json:"model"`
	Messages    []wireMessage `json:"messages"`
	Stream      bool          `json:"stream,omitempty"`
	Temperature float32       `json:"temperature,omitempty"`
	TopP        float32       `json:"top_p,omitempty"`
	MaxTokens   int           `json:"max_tokens,omitempty"`
}

type wireMessage struct {
	Role    string           `json:"role"`
	Content []wireContentPart `json:"-"`
}

// custom marshal to support either string or array content (for vision)
func (m wireMessage) MarshalJSON() ([]byte, error) {
	if len(m.Content) == 0 {
		return json.Marshal(struct {
			Role string `json:"role"`
		}{Role: m.Role})
	}
	// Single text-only -> plain string
	if len(m.Content) == 1 && m.Content[0].Type == "text" {
		return json.Marshal(struct {
			Role    string `json:"role"`
			Content string `json:"content"`
		}{Role: m.Role, Content: m.Content[0].Text})
	}
	type alias wireMessage
	return json.Marshal(struct {
		Role    string           `json:"role"`
		Content []wireContentPart `json:"content"`
	}{Role: alias(m).Role, Content: alias(m).Content})
}

type wireContentPart struct {
	Type     string          `json:"type"`
	Text     string          `json:"text,omitempty"`
	ImageURL *wireImageURL   `json:"image_url,omitempty"`
}

type wireImageURL struct {
	URL string `json:"url"`
}

func (c *Client) buildBody(req providers.ChatRequest) []byte {
	msgs := make([]wireMessage, 0, len(req.Messages))
	for _, m := range req.Messages {
		wm := wireMessage{Role: m.Role}
		wm.Content = append(wm.Content, wireContentPart{Type: "text", Text: m.Content})
		msgs = append(msgs, wm)
	}
	// If image present, attach to last user message
	if req.Image != nil && len(msgs) > 0 {
		last := &msgs[len(msgs)-1]
		if last.Role == "user" {
			// encode image data URI
			dataURI := fmt.Sprintf("data:%s;base64,%s", req.Image.MimeType, base64.StdEncoding.EncodeToString(req.Image.Data))
			last.Content = append(last.Content, wireContentPart{
				Type:     "image_url",
				ImageURL: &wireImageURL{URL: dataURI},
			})
		}
	}
	model := req.Model
	if model == "" {
		model = c.cfg.Model
	}
	wr := wireRequest{
		Model:       model,
		Messages:    msgs,
		Stream:      req.Stream,
		Temperature: req.Temperature,
		TopP:        req.TopP,
		MaxTokens:   req.MaxTokens,
	}
	out, err := json.Marshal(wr)
	if err != nil {
		logrus.Errorf("buildBody marshal: %v", err)
		return []byte("{}")
	}
	return out
}

type wireResponse struct {
	ID      string         `json:"id"`
	Model   string         `json:"model"`
	Choices []wireChoice   `json:"choices"`
	Usage   *wireUsage     `json:"usage"`
}

type wireChoice struct {
	Index   int          `json:"index"`
	Message wireRespMsg  `json:"message"`
}

type wireRespMsg struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type wireUsage struct {
	PromptTokens     int `json:"prompt_tokens"`
	CompletionTokens int `json:"completion_tokens"`
	TotalTokens      int `json:"total_tokens"`
}

func (c *Client) parseResponse(raw []byte) (*providers.ChatResponse, error) {
	var wr wireResponse
	if err := json.Unmarshal(raw, &wr); err != nil {
		return nil, fmt.Errorf("decode response: %w (body: %s)", err, truncate(string(raw), 300))
	}
	resp := &providers.ChatResponse{Model: wr.Model}
	for _, ch := range wr.Choices {
		resp.Choices = append(resp.Choices, providers.ChatChoice{
			Index: ch.Index,
			Message: providers.ChatMessage{
				Role:    ch.Message.Role,
				Content: ch.Message.Content,
			},
		})
	}
	if wr.Usage != nil {
		resp.Usage = providers.Usage{
			PromptTokens:     wr.Usage.PromptTokens,
			CompletionTokens: wr.Usage.CompletionTokens,
			TotalTokens:      wr.Usage.TotalTokens,
		}
	}
	return resp, nil
}

func (c *Client) doPost(ctx context.Context, path string, body []byte) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.cfg.BaseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.cfg.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.cfg.APIKey)
	}
	logrus.Debugf("HTTP POST %s model=%s", c.cfg.BaseURL+path, c.cfg.Model)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("http: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("api %d: %s", resp.StatusCode, truncate(string(raw), 500))
	}
	return raw, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
