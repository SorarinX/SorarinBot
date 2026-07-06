// Package session manages user-level conversation memory.
package session

import (
	"fmt"
	"strings"
	"sync"

	"SorarinBot/providers"
)

const DefaultMaxPairs = 3

// Session holds a per-user conversation buffer.
//
// Note: the system prompt is no longer stored on the Session itself.
// It is read at message-build time from Manager.Prompt (see
// BuildMessages and the manager field below). This avoids the bug
// where a fresh Session would inherit an empty prompt and ignore
// any user updates applied through the manager.
type Session struct {
	sync.Mutex
	User    string
	History []providers.ChatMessage
	manager *Manager
	Max     int // max question-response pairs (0 treated as 1 by Get)
}

// Manager holds all active sessions keyed by user identifier.
type Manager struct {
	mu       sync.RWMutex
	sessions map[string]*Session
	Prompt   string // system prompt (shared across all users)
	MaxPairs int
}

func NewManager(systemPrompt string, maxPairs int) *Manager {
	return &Manager{
		sessions: make(map[string]*Session),
		Prompt:   systemPrompt,
		MaxPairs: maxPairs,
	}
}

// Get retrieves or creates a session for a user.
func (m *Manager) Get(user string) *Session {
	m.mu.RLock()
	s, ok := m.sessions[user]
	m.mu.RUnlock()
	if ok {
		return s
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	// double‑check after write lock
	if s, ok = m.sessions[user]; ok {
		return s
	}
	max := m.MaxPairs
	if max <= 0 {
		// B39: protect against unbounded History growth if the operator
		// (or a bug) sets max_context to 0 or a negative value.
		max = 1
	}
	s = &Session{User: user, manager: m, Max: max}
	m.sessions[user] = s
	return s
}

// Delete removes a session (e.g. on reset).
func (m *Manager) Delete(user string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.sessions, user)
}

// SetPrompt updates the system prompt under the Manager's write lock.
func (m *Manager) SetPrompt(p string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Prompt = p
}

// GetPrompt returns a snapshot of the system prompt under the
// Manager's read lock. Callers should treat the result as a value
// (copy) and not assume it is stable across other goroutines.
func (m *Manager) GetPrompt() string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.Prompt
}

// BuildMessages constructs the message slice sent to the LLM.
// The system prompt is read live from Manager.Prompt so that a
// prompt update via PUT /api/config takes effect for both new and
// existing sessions without any explicit refresh step.
func (s *Session) BuildMessages(content string, image *providers.ImageContent) []providers.ChatMessage {
	s.Lock()
	defer s.Unlock()

	var msgs []providers.ChatMessage
	prompt := ""
	if s.manager != nil {
		prompt = s.manager.GetPrompt()
	}
	if prompt != "" {
		msgs = append(msgs, providers.ChatMessage{Role: "system", Content: prompt})
	}
	msgs = append(msgs, s.History...)
	msgs = append(msgs, providers.ChatMessage{Role: "user", Content: content})
	return msgs
}

// Append appends user+assistant to the history, trimming oldest pairs.
func (s *Session) Append(userMsg, asstMsg string) {
	s.Lock()
	defer s.Unlock()
	s.History = append(s.History,
		providers.ChatMessage{Role: "user", Content: userMsg},
		providers.ChatMessage{Role: "assistant", Content: asstMsg},
	)
	if s.Max > 0 && len(s.History)/2 > s.Max {
		s.History = s.History[2:] // drop oldest pair
	}
}

// PairCount returns the number of q‑a pairs in the buffer.
func (s *Session) PairCount() int {
	s.Lock()
	defer s.Unlock()
	return len(s.History) / 2
}

// Dump returns a readable representation for the admin UI.
func (s *Session) Dump() string {
	s.Lock()
	defer s.Unlock()
	var b strings.Builder
	// B17: stop one short of len(s.History) so we never read i+1 out
	// of bounds when the underlying buffer ends up odd-lengthed.
	for i := 0; i+1 < len(s.History); i += 2 {
		u := s.History[i]
		a := s.History[i+1]
		fmt.Fprintf(&b, "Q: %s\nA: %s\n\n", u.Content, a.Content)
	}
	return b.String()
}

// Names returns a copy of the user key list.
func (m *Manager) Names() []string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	out := make([]string, 0, len(m.sessions))
	for k := range m.sessions {
		out = append(out, k)
	}
	return out
}
