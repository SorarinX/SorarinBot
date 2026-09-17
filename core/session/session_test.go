package session

import (
	"encoding/json"
	"testing"

	"SorarinBot/providers"
)

func TestNewManager(t *testing.T) {
	m := NewManager("test prompt", 3)
	if m.Prompt != "test prompt" {
		t.Errorf("Prompt = %q, want %q", m.Prompt, "test prompt")
	}
	if m.MaxPairs != 3 {
		t.Errorf("MaxPairs = %d, want 3", m.MaxPairs)
	}
}

func TestGetCreatesSession(t *testing.T) {
	m := NewManager("test", 3)
	s := m.Get("user1")
	if s == nil {
		t.Fatal("Get returned nil")
	}
	if s.User != "user1" {
		t.Errorf("User = %q, want %q", s.User, "user1")
	}
	// Same user returns same session
	s2 := m.Get("user1")
	if s != s2 {
		t.Error("Get returned different session for same user")
	}
}

func TestGetMaxPairsZero(t *testing.T) {
	m := NewManager("test", 0)
	s := m.Get("user1")
	if s.Max != 1 {
		t.Errorf("Max = %d, want 1 (fallback for 0)", s.Max)
	}
}

func TestAppendAndHistory(t *testing.T) {
	m := NewManager("test", 5)
	s := m.Get("user1")
	s.Append("hello", "hi there")

	if s.PairCount() != 1 {
		t.Errorf("PairCount = %d, want 1", s.PairCount())
	}
	if len(s.History) != 2 {
		t.Errorf("History length = %d, want 2", len(s.History))
	}
}

func TestAppendTrimsOldest(t *testing.T) {
	m := NewManager("test", 2)
	s := m.Get("user1")
	s.Append("q1", "a1")
	s.Append("q2", "a2")
	s.Append("q3", "a3") // should drop q1/a1

	if s.PairCount() != 2 {
		t.Errorf("PairCount = %d, want 2", s.PairCount())
	}
	if s.History[0].Content != "q2" {
		t.Errorf("oldest message = %q, want %q", s.History[0].Content, "q2")
	}
}

func TestBuildMessages(t *testing.T) {
	m := NewManager("system prompt", 5)
	s := m.Get("user1")
	msgs := s.BuildMessages("hello", nil)

	if len(msgs) != 2 {
		t.Fatalf("len(msgs) = %d, want 2", len(msgs))
	}
	if msgs[0].Role != "system" || msgs[0].Content != "system prompt" {
		t.Errorf("first message = %+v, want system prompt", msgs[0])
	}
	if msgs[1].Role != "user" || msgs[1].Content != "hello" {
		t.Errorf("second message = %+v, want user hello", msgs[1])
	}
}

func TestBuildMessagesWithHistory(t *testing.T) {
	m := NewManager("system prompt", 5)
	s := m.Get("user1")
	s.Append("prev q", "prev a")

	msgs := s.BuildMessages("new question", nil)
	// system + prev_user + prev_assistant + new_user = 4
	if len(msgs) != 4 {
		t.Fatalf("len(msgs) = %d, want 4", len(msgs))
	}
}

func TestBuildMessagesWithImage(t *testing.T) {
	m := NewManager("system prompt", 5)
	s := m.Get("user1")
	img := &providers.ImageContent{MimeType: "image/png", Data: []byte("fake")}
	msgs := s.BuildMessages("describe this", img)

	if len(msgs) != 2 {
		t.Fatalf("len(msgs) = %d, want 2", len(msgs))
	}
}

func TestBuildMessagesEmptyPrompt(t *testing.T) {
	m := NewManager("", 5)
	s := m.Get("user1")
	msgs := s.BuildMessages("hello", nil)

	// No system message when prompt is empty
	if len(msgs) != 1 {
		t.Fatalf("len(msgs) = %d, want 1 (no system msg)", len(msgs))
	}
	if msgs[0].Role != "user" {
		t.Errorf("first message role = %q, want user", msgs[0].Role)
	}
}

func TestDelete(t *testing.T) {
	m := NewManager("test", 5)
	m.Get("user1")
	m.Delete("user1")
	m.Get("user1") // should create new session, not panic
}

func TestNames(t *testing.T) {
	m := NewManager("test", 5)
	m.Get("alice")
	m.Get("bob")
	names := m.Names()
	if len(names) != 2 {
		t.Errorf("len(names) = %d, want 2", len(names))
	}
}

func TestSetGetPrompt(t *testing.T) {
	m := NewManager("old", 5)
	m.SetPrompt("new")
	if m.GetPrompt() != "new" {
		t.Errorf("GetPrompt = %q, want %q", m.GetPrompt(), "new")
	}
}

func TestDump(t *testing.T) {
	m := NewManager("test", 5)
	s := m.Get("user1")
	s.Append("hello", "hi")
	dump := s.Dump()
	if dump == "" {
		t.Error("Dump returned empty string")
	}
}

func TestDumpOddHistory(t *testing.T) {
	m := NewManager("test", 5)
	s := m.Get("user1")
	s.History = append(s.History, providers.ChatMessage{Role: "user", Content: "orphan"})
	dump := s.Dump()
	if dump != "" {
		t.Errorf("Dump should be empty for odd history, got %q", dump)
	}
}

// ── Gate-1 (P5-5): session isolation and identity metadata ──────────

// The same user must get one session per isolated dimension: private
// chat, and each distinct room.
func TestSessionIsolationByKey(t *testing.T) {
	m := NewManager("p", 5)
	private := m.Get("private:wxid_alice")
	roomA := m.Get("group:@@roomA:wxid_alice")
	roomB := m.Get("group:@@roomB:wxid_alice")

	if private == roomA || private == roomB || roomA == roomB {
		t.Fatal("sessions for distinct keys must be distinct objects")
	}
	private.Append("q-private", "a-private")
	roomA.Append("q-a", "a-a")

	if private.PairCount() != 1 || roomA.PairCount() != 1 || roomB.PairCount() != 0 {
		t.Fatalf("histories leaked across sessions: private=%d roomA=%d roomB=%d",
			private.PairCount(), roomA.PairCount(), roomB.PairCount())
	}
	if got := private.History[0].Content; got != "q-private" {
		t.Errorf("private history contaminated: %q", got)
	}
	if got := roomA.History[0].Content; got != "q-a" {
		t.Errorf("roomA history contaminated: %q", got)
	}
}

func TestSetMetaAndMeta(t *testing.T) {
	m := NewManager("p", 5)
	s := m.Get("group:@@roomA:wxid_alice")
	s.SetMeta("群昵称", "@@roomA", "group")

	got := s.Meta()
	if got.Key != "group:@@roomA:wxid_alice" || got.Display != "群昵称" ||
		got.Room != "@@roomA" || got.Kind != "group" {
		t.Errorf("Meta() = %+v", got)
	}
	if got.Pairs != 0 {
		t.Errorf("Meta().Pairs = %d, want 0", got.Pairs)
	}
}

func TestSetMetaDefaults(t *testing.T) {
	m := NewManager("p", 5)
	s := m.Get("private:wxid_a")

	// Empty kind must default to "private" so a session is never untyped.
	s.SetMeta("", "", "")
	if got := s.Meta(); got.Kind != "private" {
		t.Errorf("Kind = %q, want private", got.Kind)
	}
	// An empty display name must not erase a previously known one.
	s.SetMeta("Alice", "", "private")
	s.SetMeta("", "", "private")
	if got := s.Meta().Display; got != "Alice" {
		t.Errorf("Display = %q, want Alice", got)
	}
}

func TestRender(t *testing.T) {
	m := NewManager("p", 5)
	s := m.Get("private:wxid_a")
	s.SetMeta("Alice", "", "private")
	s.Append("q", "a")

	all := m.Render()
	if len(all) != 1 {
		t.Fatalf("Render() returned %d sessions, want 1", len(all))
	}
	if all[0].Key != "private:wxid_a" || all[0].Display != "Alice" ||
		all[0].Kind != "private" || all[0].Pairs != 1 {
		t.Errorf("Render()[0] = %+v", all[0])
	}
}

// Detail must not create a session as a side effect of being asked.
func TestDetailDoesNotCreate(t *testing.T) {
	m := NewManager("p", 5)
	if _, _, ok := m.Detail("private:nobody"); ok {
		t.Error("Detail reported a session that does not exist")
	}
	if len(m.Names()) != 0 {
		t.Errorf("Detail created a session as a side effect: %v", m.Names())
	}

	s := m.Get("private:wxid_a")
	s.SetMeta("Alice", "", "private")
	s.Append("q", "a")

	meta, dump, ok := m.Detail("private:wxid_a")
	if !ok {
		t.Fatal("Detail did not find an existing session")
	}
	if meta.Display != "Alice" || meta.Pairs != 1 {
		t.Errorf("meta = %+v", meta)
	}
	if dump == "" {
		t.Error("dump should not be empty for a session with history")
	}
}

// SetMax must clamp non-positive values so History cannot grow unbounded,
// matching the guarantee made by Manager.Get.
func TestSetMaxClamps(t *testing.T) {
	m := NewManager("p", 5)
	s := m.Get("user1")
	s.SetMax(0)
	for i := 0; i < 10; i++ {
		s.Append("q", "a")
	}
	if got := s.PairCount(); got != 1 {
		t.Errorf("PairCount = %d after SetMax(0), want 1", got)
	}
}

// ── P5-10: frontend contract guard ──────────────────────────────────

// Meta is serialised straight into /api/status.sessions and consumed by
// web/app/types/index.ts as SessionInfo. Renaming a field here silently
// breaks the dashboard, so the wire keys are pinned by this test.
func TestMetaJSONContract(t *testing.T) {
	m := NewManager("p", 5)
	s := m.Get("group:@@room:wxid_a")
	s.SetMeta("Alice", "@@room", "group")

	raw, err := json.Marshal(s.Meta())
	if err != nil {
		t.Fatalf("marshal Meta: %v", err)
	}

	var got map[string]any
	if err := json.Unmarshal(raw, &got); err != nil {
		t.Fatalf("unmarshal Meta: %v", err)
	}

	// Exact key set expected by the TypeScript SessionInfo interface.
	want := []string{"key", "display", "kind", "room", "pairs"}
	for _, k := range want {
		if _, ok := got[k]; !ok {
			t.Errorf("SessionInfo is missing wire key %q (frontend expects it)", k)
		}
	}
	if len(got) != len(want) {
		t.Errorf("Meta has %d wire keys, want %d: %v", len(got), len(want), got)
	}
	if got["kind"] != "group" {
		t.Errorf("kind = %v, want group", got["kind"])
	}
	if got["room"] != "@@room" {
		t.Errorf("room = %v, want @@room", got["room"])
	}
	if got["display"] != "Alice" {
		t.Errorf("display = %v, want Alice", got["display"])
	}
}

// Render must be JSON-serialisable as an array of SessionInfo, which is
// what /api/status and /api/sessions return.
func TestRenderJSONIsArray(t *testing.T) {
	m := NewManager("p", 5)
	m.Get("private:a").SetMeta("A", "", "private")
	m.Get("group:@@r:b").SetMeta("B", "@@r", "group")

	raw, err := json.Marshal(m.Render())
	if err != nil {
		t.Fatalf("marshal Render: %v", err)
	}
	var arr []map[string]any
	if err := json.Unmarshal(raw, &arr); err != nil {
		t.Fatalf("Render is not a JSON array: %v", err)
	}
	if len(arr) != 2 {
		t.Fatalf("Render returned %d entries, want 2", len(arr))
	}
	for _, e := range arr {
		if _, ok := e["key"]; !ok {
			t.Errorf("entry missing key: %v", e)
		}
	}
}
