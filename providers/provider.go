// Package providers defines the unified LLM Provider interface.
package providers

import (
	"context"
)

// ChatMessage is a single message in a conversation.
type ChatMessage struct {
	Role    string // "system" | "user" | "assistant"
	Content string
}

// ImageContent carries an image attachment for vision models.
type ImageContent struct {
	MimeType string // "image/jpeg" | "image/png" | "image/gif" | "image/webp"
	Data     []byte // raw image bytes
}

// ChatRequest is a model-agnostic chat request.
type ChatRequest struct {
	Model       string
	Messages    []ChatMessage
	Image       *ImageContent // optional, for vision
	Temperature float32
	MaxTokens   int
	TopP        float32
	Stream      bool
}

// ChatChoice is a single completion choice in the response.
type ChatChoice struct {
	Index   int
	Message ChatMessage
}

// Usage tracks token usage.
type Usage struct {
	PromptTokens     int
	CompletionTokens int
	TotalTokens      int
}

// ChatResponse is the unified response returned by a Provider.
type ChatResponse struct {
	Model   string
	Choices []ChatChoice
	Usage   Usage
}

// Provider is the contract every model backend must implement.
//
// Implementations should be safe for concurrent use.
type Provider interface {
	// Name returns a stable identifier (e.g. "openai", "claude", "minimax").
	Name() string

	// Chat sends a non-streaming chat request and returns the response.
	Chat(ctx context.Context, req ChatRequest) (*ChatResponse, error)

	// SupportsVision reports whether the configured model can handle images.
	SupportsVision() bool
}

// Registry holds available providers by name.
type Registry struct {
	providers map[string]Provider
}

// NewRegistry returns an empty Registry.
func NewRegistry() *Registry {
	return &Registry{providers: make(map[string]Provider)}
}

// Register adds (or replaces) a provider under its Name().
func (r *Registry) Register(p Provider) {
	r.providers[p.Name()] = p
}

// Get retrieves a provider by name; returns nil if not present.
func (r *Registry) Get(name string) Provider {
	return r.providers[name]
}

// Names returns the list of registered provider names.
func (r *Registry) Names() []string {
	out := make([]string, 0, len(r.providers))
	for n := range r.providers {
		out = append(out, n)
	}
	return out
}
