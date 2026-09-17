// Package session manages user-level conversation memory.
package session

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"SorarinBot/providers"
)

const DefaultMaxPairs = 3

// SerialQueueCap is the per-session backlog limit (P5-1). When a session
// already has this many tasks waiting, further messages are rejected
// rather than queued, so a flooding sender cannot grow memory without
// bound. Rejection is reported to the caller, never silently swallowed.
const SerialQueueCap = 16

// SerialDrainTimeout bounds how long Stop waits for a worker to finish
// the task it is currently running. It deliberately does not wait for
// the whole backlog: shutdown must not be held hostage by queued work.
const SerialDrainTimeout = 2 * time.Second

// Task is one unit of work executed on a session's serial worker.
// The context is the worker's lifetime context, so cancelling it
// propagates into in-flight provider calls.
type Task func(ctx context.Context)

// Session holds a per-user conversation buffer.
//
// Note: the system prompt is no longer stored on the Session itself.
// It is read at message-build time from Manager.Prompt (see
// BuildMessages and the manager field below). This avoids the bug
// where a fresh Session would inherit an empty prompt and ignore
// any user updates applied through the manager.
type Session struct {
	sync.Mutex
	User    string // session key: "private:<uid>" or "group:<room>:<uid>"
	History []providers.ChatMessage
	manager *Manager
	Max     int // max question-response pairs (0 treated as 1 by Get)

	// P5-5: identity metadata for display. Session isolation uses User
	// (the stable key); these fields are never used for keying.
	Display string // human-readable name (group display name preferred)
	Room    string // room UserName for group sessions, "" for private chats
	Kind    string // "private" | "group"

	// P5-1: serial execution. schedmu guards the queue handle only; its
	// critical section is a single non-blocking channel send, so it is
	// never held across a task and never held across I/O. queue is
	// published once by StartWorker and set to nil by Stop.
	schedmu sync.RWMutex
	queue   atomic.Pointer[chan Task]
	started atomic.Bool
	done    chan struct{}
	once    sync.Once
}

// StartWorker launches the single serial worker for this session. It is
// idempotent: calling it more than once has no additional effect.
func (s *Session) StartWorker(ctx context.Context, wg *sync.WaitGroup) {
	if !s.started.CompareAndSwap(false, true) {
		return
	}
	q := make(chan Task, SerialQueueCap)
	s.done = make(chan struct{})
	s.queue.Store(&q)

	wg.Add(1)
	go func() {
		defer wg.Done()
		defer close(s.done)
		// The worker is the only reader; Stop is the only closer, and the
		// close is serialised against senders by schedmu.
		for t := range q {
			if ctx.Err() != nil {
				// Shutting down: abandon the remaining backlog rather
				// than holding shutdown for it.
				return
			}
			if t != nil {
				runTaskSafely(t, ctx)
			}
		}
	}()
}

// runTaskSafely isolates a task panic (P5-2). A task runs on this
// session's worker goroutine, so without this an unrecovered panic would
// take down the whole process. Session has no logger, so the handler is
// invoked through OnTaskPanic when one is installed.
func runTaskSafely(t Task, ctx context.Context) {
	defer func() {
		if r := recover(); r != nil {
			if OnTaskPanic != nil {
				OnTaskPanic(r)
			}
		}
	}()
	t(ctx)
}

// OnTaskPanic, when non-nil, is called with the value recovered from a
// panicking task. It exists so the session package can stay free of a
// logging dependency; the adapter installs it. It must not panic itself.
var OnTaskPanic func(any)

// RunSerial enqueues a task for strictly serial execution on this
// session's worker. It never blocks: the channel send is non-blocking, so
// even a full backlog costs one select, not a wait.
//
// Returns false when the task was rejected — either because the worker is
// stopped (or was never started), or because the backlog is full. A false
// return guarantees the task will NOT run; a true return guarantees it is
// queued and will run before any task enqueued after it.
//
// The read lock is required for memory safety, not for mutual exclusion
// of tasks: it pairs with Stop's write lock so that a send can never
// overlap the close of the queue. It is held only for the duration of a
// non-blocking send, never across a task or any I/O.
func (s *Session) RunSerial(t Task) bool {
	s.schedmu.RLock()
	defer s.schedmu.RUnlock()

	qp := s.queue.Load()
	if qp == nil {
		return false
	}
	select {
	case *qp <- t:
		return true
	default:
		return false
	}
}

// Stop prevents any further task from being enqueued and waits, bounded
// by SerialDrainTimeout, for the worker to finish the task it is running.
// It is idempotent.
//
// Closing the queue is what releases any sender that already holds the
// handle and would otherwise block on a full backlog: a receive from a
// closed channel is an immediate zero-value read, so the worker's range
// loop simply ends. The write lock guarantees the close cannot race with
// a concurrent send.
func (s *Session) Stop() {
	s.once.Do(func() {
		s.schedmu.Lock()
		if qp := s.queue.Swap(nil); qp != nil {
			close(*qp)
		}
		s.schedmu.Unlock()

		if s.done != nil {
			select {
			case <-s.done:
			case <-time.After(SerialDrainTimeout):
			}
		}
	})
}

// Pending returns the number of tasks currently waiting in the queue.
func (s *Session) Pending() int {
	qp := s.queue.Load()
	if qp == nil {
		return 0
	}
	return len(*qp)
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

// Detail returns a read-only view of an existing session without
// creating one. ok is false when no session exists for key.
func (m *Manager) Detail(key string) (meta Meta, dump string, ok bool) {
	m.mu.RLock()
	s, ok := m.sessions[key]
	m.mu.RUnlock()
	if !ok {
		return Meta{}, "", false
	}
	return s.Meta(), s.Dump(), true
}

// Count returns the number of live sessions.
func (m *Manager) Count() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.sessions)
}

// Meta is a read-only snapshot of a session's identity, for the admin UI.
type Meta struct {
	Key     string `json:"key"`
	Display string `json:"display"`
	Kind    string `json:"kind"`
	Room    string `json:"room"`
	Pairs   int    `json:"pairs"`
}

// Render returns identity snapshots for all sessions (P5-5).
// Sort order is unspecified; callers that need determinism should sort.
func (m *Manager) Render() []Meta {
	m.mu.RLock()
	all := make([]*Session, 0, len(m.sessions))
	for _, s := range m.sessions {
		all = append(all, s)
	}
	m.mu.RUnlock()

	out := make([]Meta, 0, len(all))
	for _, s := range all {
		out = append(out, s.Meta())
	}
	return out
}

// Meta returns this session's identity snapshot.
func (s *Session) Meta() Meta {
	s.Lock()
	defer s.Unlock()
	return Meta{
		Key:     s.User,
		Display: s.Display,
		Kind:    s.Kind,
		Room:    s.Room,
		Pairs:   len(s.History) / 2,
	}
}

// SetMeta records identity metadata for display. An empty kind defaults
// to "private" so a session can never be rendered as an untyped key.
func (s *Session) SetMeta(display, room, kind string) {
	s.Lock()
	defer s.Unlock()
	if display != "" {
		s.Display = display
	}
	s.Room = room
	if kind != "" {
		s.Kind = kind
	} else {
		s.Kind = "private"
	}
}

// SetMax updates the history-pair cap. Values <= 0 are clamped to 1 so
// History can never grow without bound, matching Manager.Get.
func (s *Session) SetMax(max int) {
	if max <= 0 {
		max = 1
	}
	s.Lock()
	defer s.Unlock()
	s.Max = max
}
