package session

import (
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
