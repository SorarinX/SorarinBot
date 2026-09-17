package openwechat

import (
	"context"
	"fmt"
	"testing"

	"SorarinBot/core/message"
	"SorarinBot/core/session"
)

// newTestAdapter builds just enough Adapter to exercise the worker
// registry without a live bot or network.
func newTestAdapter(t *testing.T) *Adapter {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	a := &Adapter{
		Handler:  &message.Handler{Sessions: session.NewManager("p", 3)},
		Sessions: session.NewManager("p", 3),
		ctx:      ctx,
		sem:      make(chan struct{}, maxConcurrentChats),
		workers:  make(map[string]*session.Session),
	}
	a.accepting.Store(true)
	t.Cleanup(func() {
		a.StopAccepting()
		cancel()
	})
	return a
}

// T-1.3: the same SessionKey must always resolve to the same worker, and
// distinct keys to distinct workers.
func TestWorkerForReusesByKey(t *testing.T) {
	a := newTestAdapter(t)

	w1 := a.workerFor("private:a")
	w2 := a.workerFor("private:a")
	if w1 == nil || w1 != w2 {
		t.Fatal("same key must return the same worker instance")
	}

	w3 := a.workerFor("private:b")
	if w3 == nil || w3 == w1 {
		t.Fatal("distinct keys must get distinct workers")
	}

	g1 := a.workerFor("group:@@r:a")
	if g1 == nil || g1 == w1 {
		t.Fatal("group key must not collide with private key")
	}
}

// T-1.4: after StopAccepting the registry must refuse new work.
func TestWorkerForRefusesAfterStop(t *testing.T) {
	a := newTestAdapter(t)
	if a.workerFor("private:a") == nil {
		t.Fatal("expected a worker before shutdown")
	}

	a.StopAccepting()

	if got := a.workerFor("private:a"); got != nil {
		t.Error("workerFor must return nil after StopAccepting")
	}
	if a.runOnWorker("private:a", func(context.Context) {}) {
		t.Error("runOnWorker must return false after StopAccepting")
	}
}

// StopAccepting must be idempotent and must drain the registry.
func TestStopAcceptingIdempotent(t *testing.T) {
	a := newTestAdapter(t)
	a.workerFor("private:a")
	a.workerFor("private:b")

	a.StopAccepting()
	a.StopAccepting()

	a.workmu.Lock()
	n := len(a.workers)
	a.workmu.Unlock()
	if n != 0 {
		t.Errorf("workers map has %d entries after StopAccepting, want 0", n)
	}
}

// T-2.6: the worker count must be bounded by maxSessions.
func TestWorkerRegistryIsCapped(t *testing.T) {
	a := newTestAdapter(t)

	created := 0
	for i := 0; i < maxSessions+25; i++ {
		if a.workerFor(fmt.Sprintf("private:u%d", i)) != nil {
			created++
		}
	}
	if created != maxSessions {
		t.Errorf("created %d workers, want exactly %d", created, maxSessions)
	}

	a.workmu.Lock()
	n := len(a.workers)
	a.workmu.Unlock()
	if n > maxSessions {
		t.Errorf("registry holds %d workers, cap is %d", n, maxSessions)
	}
}

// runOnWorker must reject when no worker can be created (cap reached).
func TestRunOnWorkerRejectsWhenCapped(t *testing.T) {
	a := newTestAdapter(t)
	for i := 0; i < maxSessions; i++ {
		a.workerFor(fmt.Sprintf("private:u%d", i))
	}
	if a.runOnWorker("private:overflow", func(context.Context) {}) {
		t.Error("runOnWorker must reject once the session cap is reached")
	}
}

// Gate-1 (P5-5): conversation isolation keys.
//
// Session isolation must be derived from stable WeChat identifiers
// (UserName / room UserName), never from the mutable NickName.
func TestBuildSessionKey(t *testing.T) {
	tests := []struct {
		name     string
		kind     string
		room     string
		userName string
		want     string
	}{
		{"private", "private", "", "wxid_alice", "private:wxid_alice"},
		{"group", "group", "@@room1", "wxid_alice", "group:@@room1:wxid_alice"},
		{"group with empty room falls back to private shape", "group", "", "wxid_alice", "private:wxid_alice"},
		{"private ignores room", "private", "@@room1", "wxid_alice", "private:wxid_alice"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := buildSessionKey(tt.kind, tt.room, tt.userName); got != tt.want {
				t.Errorf("buildSessionKey(%q,%q,%q) = %q, want %q",
					tt.kind, tt.room, tt.userName, got, tt.want)
			}
		})
	}
}

// The same person in two different rooms must not share a session, and
// must not share one with their private chat.
func TestSessionKeyIsolatesGroupAndPrivate(t *testing.T) {
	uid := "wxid_alice"
	private := buildSessionKey(sessionKind(false), roomKey(false, uid), uid)
	roomA := buildSessionKey(sessionKind(true), roomKey(true, "@@roomA"), uid)
	roomB := buildSessionKey(sessionKind(true), roomKey(true, "@@roomB"), uid)

	if private == roomA || private == roomB || roomA == roomB {
		t.Fatalf("session keys collided: private=%q roomA=%q roomB=%q", private, roomA, roomB)
	}
}

// Two different users who happen to share a nickname must not collide,
// because the key never contains the nickname.
func TestSessionKeySameNicknameDifferentUsers(t *testing.T) {
	a := buildSessionKey("private", "", "wxid_a")
	b := buildSessionKey("private", "", "wxid_b")
	if a == b {
		t.Fatalf("distinct users collided on key %q", a)
	}
}

// Gate-1 (P5-5): room must be persisted only for group messages.
func TestRoomKey(t *testing.T) {
	if got := roomKey(false, "wxid_alice"); got != "" {
		t.Errorf("private roomKey = %q, want empty", got)
	}
	if got := roomKey(true, "@@room1"); got != "@@room1" {
		t.Errorf("group roomKey = %q, want %q", got, "@@room1")
	}
}

// Gate-1 (P5-5): display name selection.
func TestDisplayNameFor(t *testing.T) {
	tests := []struct {
		name     string
		isGroup  bool
		nick     string
		display  string
		userName string
		want     string
	}{
		{"private uses nickname", false, "Alice", "ignored", "wxid_a", "Alice"},
		{"group prefers display name", true, "Alice", "群昵称", "wxid_a", "群昵称"},
		{"group without display name", true, "Alice", "", "wxid_a", "Alice"},
		{"private with no nickname falls back to uid", false, "", "", "wxid_a", "wxid_a"},
		{"group with nothing falls back to uid", true, "", "", "wxid_a", "wxid_a"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := displayNameFor(tt.isGroup, tt.nick, tt.display, tt.userName); got != tt.want {
				t.Errorf("displayNameFor(%v,%q,%q,%q) = %q, want %q",
					tt.isGroup, tt.nick, tt.display, tt.userName, got, tt.want)
			}
		})
	}
}

func TestSessionKind(t *testing.T) {
	if got := sessionKind(true); got != "group" {
		t.Errorf("sessionKind(true) = %q, want group", got)
	}
	if got := sessionKind(false); got != "private" {
		t.Errorf("sessionKind(false) = %q, want private", got)
	}
}

// Gate-1 (P5-6): message-id validity.
//
// WeChat emits MsgId "0" as a placeholder for some message kinds. Treating
// it as a real id would make every such message collide in the dedup map.
func TestValidMsgID(t *testing.T) {
	tests := []struct {
		id   string
		want bool
	}{
		{"1234567890", true},
		{"", false},
		{"0", false},
		{"00", true},
	}
	for _, tt := range tests {
		if got := validMsgID(tt.id); got != tt.want {
			t.Errorf("validMsgID(%q) = %v, want %v", tt.id, got, tt.want)
		}
	}
}

// Gate-1 (P5-6): the fallback dedup key is keyed on the stable UserName
// and is collision-proof against crafted content.
func TestContentDedupKey(t *testing.T) {
	// Same text from two different users must not collide.
	a := contentDedupKey("wxid_a", "hello")
	b := contentDedupKey("wxid_b", "hello")
	if a == b {
		t.Fatalf("dedup keys collided across users: %q", a)
	}

	// Same user, identical text -> identical key (this is the intended
	// dedup hit, which layer 1 no longer suppresses when a msgId exists).
	if contentDedupKey("wxid_a", "hi") != contentDedupKey("wxid_a", "hi") {
		t.Error("identical (user, content) produced different keys")
	}

	// A nickname crafted to look like a key prefix must not collide with
	// another sender's entry, because NUL cannot appear in either field.
	crafted := contentDedupKey("wxid_a\x00x", "y")
	legit := contentDedupKey("wxid_a", "x\x00y")
	if crafted == legit {
		t.Errorf("crafted content collided: %q", crafted)
	}
}
