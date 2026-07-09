package message

import "testing"

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
