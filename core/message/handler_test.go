package message

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"SorarinBot/core/session"
	"SorarinBot/providers"
)

// fakeProvider records observed concurrency and returns a fixed reply.
type fakeProvider struct {
	inFlight    int64
	maxInFlight int64
	calls       int64
	delay       time.Duration
}

func (f *fakeProvider) Name() string         { return "fake" }
func (f *fakeProvider) SupportsVision() bool { return false }
func (f *fakeProvider) Chat(ctx context.Context, req providers.ChatRequest) (*providers.ChatResponse, error) {
	cur := atomic.AddInt64(&f.inFlight, 1)
	for {
		old := atomic.LoadInt64(&f.maxInFlight)
		if cur <= old || atomic.CompareAndSwapInt64(&f.maxInFlight, old, cur) {
			break
		}
	}
	atomic.AddInt64(&f.calls, 1)
	if f.delay > 0 {
		select {
		case <-time.After(f.delay):
		case <-ctx.Done():
		}
	}
	atomic.AddInt64(&f.inFlight, -1)
	return &providers.ChatResponse{
		Model:   "fake",
		Choices: []providers.ChatChoice{{Message: providers.ChatMessage{Role: "assistant", Content: "ok"}}},
	}, nil
}

// T-2.2: the global semaphore must cap provider calls across sessions.
func TestSemaphoreCapsConcurrency(t *testing.T) {
	const limit = 3
	fp := &fakeProvider{delay: 30 * time.Millisecond}
	h := &Handler{
		Provider: fp,
		Sessions: session.NewManager("p", 3),
		ImageTTL: time.Minute,
		Sem:      make(chan struct{}, limit),
	}

	var wg sync.WaitGroup
	for i := 0; i < 30; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			h.Handle(context.Background(), ChatTask{
				SessionKey: "private:u" + string(rune('a'+i%20)),
				UserName:   "u",
				Content:    "hi",
				Kind:       "private",
			})
		}(i)
	}
	wg.Wait()

	if got := atomic.LoadInt64(&fp.maxInFlight); got > limit {
		t.Errorf("max concurrent provider calls = %d, want <= %d", got, limit)
	}
	if got := atomic.LoadInt64(&fp.calls); got != 30 {
		t.Errorf("provider called %d times, want 30", got)
	}
}

// A nil Sem must mean "unbounded" so existing callers keep working.
func TestNilSemaphoreIsUnbounded(t *testing.T) {
	fp := &fakeProvider{}
	h := &Handler{Provider: fp, Sessions: session.NewManager("p", 3), ImageTTL: time.Minute}

	res := h.Handle(context.Background(), ChatTask{
		SessionKey: "private:u", UserName: "u", Content: "hi", Kind: "private",
	})
	if res.Reply != "ok" {
		t.Fatalf("Reply = %q, want ok", res.Reply)
	}
	if atomic.LoadInt64(&fp.calls) != 1 {
		t.Errorf("provider calls = %d, want 1", fp.calls)
	}
}

// T-2.1: a saturated semaphore must not make Handle block past SemWait.
func TestSemaphoreWaitIsBounded(t *testing.T) {
	fp := &fakeProvider{}
	h := &Handler{
		Provider: fp,
		Sessions: session.NewManager("p", 3),
		ImageTTL: time.Minute,
		Sem:      make(chan struct{}, 1),
		SemWait:  50 * time.Millisecond,
	}
	// Occupy the only slot so no slot ever becomes available.
	h.Sem <- struct{}{}

	start := time.Now()
	res := h.Handle(context.Background(), ChatTask{
		SessionKey: "private:u", UserName: "u", Content: "hi", Kind: "private",
	})
	elapsed := time.Since(start)

	if elapsed > 2*time.Second {
		t.Errorf("Handle waited %s despite SemWait=%s", elapsed, h.SemWait)
	}
	if !res.Err {
		t.Error("expected an error result when no slot could be acquired")
	}
	if atomic.LoadInt64(&fp.calls) != 0 {
		t.Error("provider must not be called when no slot was acquired")
	}
}

// Cancelling the context while waiting for a slot must abort promptly.
func TestSemaphoreWaitAbortsOnCancel(t *testing.T) {
	fp := &fakeProvider{}
	h := &Handler{
		Provider: fp,
		Sessions: session.NewManager("p", 3),
		ImageTTL: time.Minute,
		Sem:      make(chan struct{}, 1),
	}
	h.Sem <- struct{}{}

	ctx, cancel := context.WithCancel(context.Background())
	go func() { time.Sleep(30 * time.Millisecond); cancel() }()

	start := time.Now()
	res := h.Handle(ctx, ChatTask{SessionKey: "private:u", UserName: "u", Content: "hi", Kind: "private"})
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Errorf("Handle took %s, expected prompt abort", elapsed)
	}
	if !res.Err {
		t.Error("expected an error result after cancellation")
	}
}

// The slot must be released even when the provider errors, or the
// semaphore would leak capacity.
func TestSlotReleasedAfterError(t *testing.T) {
	h := &Handler{
		Provider: errProvider{},
		Sessions: session.NewManager("p", 3),
		ImageTTL: time.Minute,
		Sem:      make(chan struct{}, 1),
	}
	for i := 0; i < 5; i++ {
		res := h.Handle(context.Background(), ChatTask{
			SessionKey: "private:u", UserName: "u", Content: "hi", Kind: "private",
		})
		if !res.Err {
			t.Fatalf("iteration %d: expected error result", i)
		}
	}
	if len(h.Sem) != 0 {
		t.Errorf("semaphore leaked %d slots", len(h.Sem))
	}
}

type errProvider struct{}

func (errProvider) Name() string         { return "err" }
func (errProvider) SupportsVision() bool { return false }
func (errProvider) Chat(context.Context, providers.ChatRequest) (*providers.ChatResponse, error) {
	return nil, context.DeadlineExceeded
}

// ── P5-5 (deferred from Gate-1): room must reach the database writer ──

// recordingDB captures what Handle passes to the persistence layer.
type recordingDB struct {
	calls    int
	sender   string
	room     string
	userMsg  string
	botReply string
}

func (d *recordingDB) InsertMessage(sender, room, userMsg, botReply, model string,
	promptTokens, completionTokens, totalTokens int) {
	d.calls++
	d.sender = sender
	d.room = room
	d.userMsg = userMsg
	d.botReply = botReply
}

// A group message must persist its room, and a private message must
// persist an empty room. This is the end-to-end assertion that was not
// possible in Gate-1.
func TestHandlePersistsRoom(t *testing.T) {
	tests := []struct {
		name     string
		task     ChatTask
		wantRoom string
	}{
		{
			name: "group message persists the room id",
			task: ChatTask{
				SessionKey: "group:@@room1:wxid_a",
				Room:       "@@room1",
				Display:    "Alice",
				UserName:   "wxid_a",
				Content:    "hi",
				Kind:       "group",
			},
			wantRoom: "@@room1",
		},
		{
			name: "private message persists an empty room",
			task: ChatTask{
				SessionKey: "private:wxid_a",
				Room:       "",
				Display:    "Alice",
				UserName:   "wxid_a",
				Content:    "hi",
				Kind:       "private",
			},
			wantRoom: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db := &recordingDB{}
			h := &Handler{
				Provider: &fakeProvider{},
				Sessions: session.NewManager("p", 3),
				ImageTTL: time.Minute,
				DB:       db,
			}

			res := h.Handle(context.Background(), tt.task)
			if res.Err {
				t.Fatalf("Handle reported an error: %+v", res)
			}
			if db.calls != 1 {
				t.Fatalf("InsertMessage called %d times, want 1", db.calls)
			}
			if db.room != tt.wantRoom {
				t.Errorf("persisted room = %q, want %q", db.room, tt.wantRoom)
			}
			if db.sender != tt.task.Display {
				t.Errorf("persisted sender = %q, want %q", db.sender, tt.task.Display)
			}
			if db.userMsg != tt.task.Content || db.botReply == "" {
				t.Errorf("persisted message/reply = %q/%q", db.userMsg, db.botReply)
			}
		})
	}
}

// Two group conversations for the same user must not share history, which
// is the isolation guarantee the SessionKey encodes.
func TestHandleIsolatesSessionsByKey(t *testing.T) {
	h := &Handler{
		Provider: &fakeProvider{},
		Sessions: session.NewManager("p", 5),
		ImageTTL: time.Minute,
	}

	base := ChatTask{Display: "Alice", UserName: "wxid_a", Content: "hi", Kind: "group"}
	roomA := base
	roomA.SessionKey, roomA.Room = "group:@@A:wxid_a", "@@A"
	roomB := base
	roomB.SessionKey, roomB.Room = "group:@@B:wxid_a", "@@B"

	h.Handle(context.Background(), roomA)
	h.Handle(context.Background(), roomA)
	h.Handle(context.Background(), roomB)

	metaA, _, okA := h.Sessions.Detail("group:@@A:wxid_a")
	metaB, _, okB := h.Sessions.Detail("group:@@B:wxid_a")
	if !okA || !okB {
		t.Fatal("both sessions must exist")
	}
	if metaA.Pairs != 2 {
		t.Errorf("room A pairs = %d, want 2", metaA.Pairs)
	}
	if metaB.Pairs != 1 {
		t.Errorf("room B pairs = %d, want 1", metaB.Pairs)
	}
	if metaA.Room != "@@A" || metaB.Room != "@@B" {
		t.Errorf("rooms recorded wrong: %q / %q", metaA.Room, metaB.Room)
	}
}

// Error results must not be persisted as conversation history, and must
// not be appended to the session.
func TestHandleDoesNotPersistErrors(t *testing.T) {
	db := &recordingDB{}
	h := &Handler{
		Provider: errProvider{},
		Sessions: session.NewManager("p", 3),
		ImageTTL: time.Minute,
		DB:       db,
	}

	res := h.Handle(context.Background(), ChatTask{
		SessionKey: "private:wxid_a", UserName: "wxid_a", Content: "hi", Kind: "private",
	})
	if !res.Err {
		t.Error("expected an error result")
	}
	if db.calls != 0 {
		t.Errorf("InsertMessage called %d times for a failed call, want 0", db.calls)
	}
	if pairs := h.Sessions.Get("private:wxid_a").PairCount(); pairs != 0 {
		t.Errorf("failed call appended %d pairs, want 0", pairs)
	}
}

func TestStripThinkBlocks(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{"no think block", "Hello world", "Hello world"},
		{"single think block", "Hello <think>reasoning</think> world", "Hello  world"},
		{"multiple think blocks", "A <think>r1</think> B <think>r2</think> C", "A  B  C"},
		{"empty think block", "Hello <think></think> world", "Hello  world"},
		{"unclosed think block", "Hello <think>not closed", "Hello <think>not closed"},
		{"nested think", "Hello <think>outer <think>inner</think> outer</think> world", "Hello  outer</think> world"},
		{"only think block", "<think>only thinking</think>", ""},
		{"empty input", "", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := stripThinkBlocks(tt.input)
			if got != tt.want {
				t.Errorf("stripThinkBlocks(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestWantsVoiceReply(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  bool
	}{
		{"explicit voice request", "用语音回答这个问题", true},
		{"voice reply", "请语音回复", true},
		{"read aloud", "念出来", true},
		{"voice + action", "用语音介绍自己", true},
		{"voice + reply combo", "语音回复我", true},
		{"normal message", "你好", false},
		{"empty string", "", false},
		{"partial match only voice", "语音", false},
		{"partial match only action", "回复", false},
		{"voice + action pair", "语音回答", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := WantsVoiceReply(tt.input)
			if got != tt.want {
				t.Errorf("WantsVoiceReply(%q) = %v, want %v", tt.input, got, tt.want)
			}
		})
	}
}
