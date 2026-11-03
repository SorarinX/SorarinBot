package console

import (
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/sirupsen/logrus"
)

var ansiPattern = regexp.MustCompile("\x1b\\[[0-9;]*m")

func stripANSI(s string) string { return ansiPattern.ReplaceAllString(s, "") }

func TestRuneWidth(t *testing.T) {
	cases := []struct {
		in   string
		want int
	}{
		{"", 0},
		{"abc", 3},
		{"管理后台", 8},
		{"微信 × AI", 9},
		{"● 等待扫码", 10}, // ● is ambiguous-width; we treat it as one column
		{"e\u0301", 1}, // combining acute accent
	}
	for _, c := range cases {
		if got := textWidth(c.in); got != c.want {
			t.Errorf("textWidth(%q) = %d, want %d", c.in, got, c.want)
		}
	}
}

func TestCardPlain(t *testing.T) {
	lines := renderCard(CardConfig{
		Version:  "v2.4.0",
		WebURL:   "http://localhost:8080",
		Provider: "openaicompat",
		DBPath:   "./data.db",
	}, false)

	if len(lines) != 6 {
		t.Fatalf("renderCard returned %d lines, want 6: %q", len(lines), lines)
	}
	out := strings.Join(lines, "\n")
	if strings.ContainsRune(out, 0x1b) {
		t.Fatalf("plain card contains an ANSI escape: %q", out)
	}
	for _, want := range []string{
		"SorarinBot · v2.4.0",
		"微信 × AI",
		"管理后台",
		"http://localhost:8080",
		"AI 服务",
		"openaicompat · 未配置",
		"微信",
		"● 等待扫码",
		"数据",
		"./data.db",
	} {
		if !strings.Contains(out, want) {
			t.Errorf("plain card is missing %q: %q", want, out)
		}
	}
	if strings.ContainsRune(out, '╭') || strings.ContainsRune(out, '│') {
		t.Errorf("plain card should not draw a box: %q", out)
	}
}

func TestCardColouredIsAligned(t *testing.T) {
	lines := renderCard(CardConfig{
		Version:     "v2.4.0",
		WebURL:      "http://localhost:8080",
		Provider:    "openaicompat",
		DBPath:      "./data.db",
		WeChatState: StateScanned,
	}, true)

	if !strings.Contains(strings.Join(lines, "\n"), "\x1b[38;2;") {
		t.Fatal("coloured card has no 24-bit colour escapes")
	}
	box := []string{lines[0], lines[1], lines[2], lines[3]}
	want := textWidth(stripANSI(box[0]))
	for i, line := range box {
		if got := textWidth(stripANSI(line)); got != want {
			t.Errorf("box line %d is %d columns, want %d: %q", i, got, want, stripANSI(line))
		}
	}
	// lines: box(0-3), blank(4), 管理后台(5), AI 服务(6), 微信(7), 数据(8).
	if !strings.Contains(stripANSI(lines[7]), "已扫码，请在手机上确认") {
		t.Errorf("card does not reflect the WeChat state: %q", stripANSI(lines[5]))
	}
}

func TestCardPlainNeverColoursUnconfiguredAI(t *testing.T) {
	lines := renderCard(CardConfig{Provider: "openaicompat"}, false)
	if got := lines[3]; !strings.Contains(got, "openaicompat · 未配置") {
		t.Errorf("AI row = %q, want the unconfigured hint", got)
	}
}

func TestStatusParts(t *testing.T) {
	cases := []struct {
		state  string
		detail string
		dot    string
		text   string
	}{
		{StateIdle, "", "○", "启动中"},
		{StateHotLoggingIn, "1/5", "●", "正在使用已保存的登录态…（1/5）"},
		{StateWaitingScan, "", "●", "等待扫码"},
		{StateScanned, "", "●", "已扫码，请在手机上确认"},
		{StateLoggedIn, "阿猫", "●", "已登录  阿猫"},
		{StateFailed, "token 过期", "●", "登录失败：token 过期"},
	}
	for _, c := range cases {
		dot, text, _ := statusParts(c.state, c.detail)
		if dot != c.dot || text != c.text {
			t.Errorf("statusParts(%q, %q) = (%q, %q), want (%q, %q)",
				c.state, c.detail, dot, text, c.dot, c.text)
		}
	}
}

func TestQRPlainIsScannable(t *testing.T) {
	url := "https://login.weixin.qq.com/qrcode/test"
	lines, err := renderQR(url, 3*time.Minute, false)
	if err != nil {
		t.Fatalf("renderQR: %v", err)
	}
	if len(lines) < 10 {
		t.Fatalf("QR block is only %d lines", len(lines))
	}
	art := lines[:len(lines)-2]
	want := textWidth(art[0])
	for i, line := range art {
		if got := textWidth(line); got != want {
			t.Errorf("QR line %d is %d columns, want %d", i, got, want)
		}
	}
	out := strings.Join(lines, "\n")
	if strings.ContainsRune(out, 0x1b) {
		t.Fatal("plain QR block contains an ANSI escape")
	}
	if !strings.Contains(out, "用微信扫一扫 · 3 分钟内有效") {
		t.Errorf("QR block is missing its instruction: %q", out)
	}
	if !strings.Contains(out, url) {
		t.Errorf("QR block is missing the fallback URL: %q", out)
	}
	if strings.ContainsRune(out, '┌') {
		t.Error("plain QR block should not draw a frame")
	}
}

func TestQRColouredKeepsCodeUncoloured(t *testing.T) {
	const url = "https://login.weixin.qq.com/qrcode/test"
	plain, err := renderQR(url, 3*time.Minute, false)
	if err != nil {
		t.Fatalf("renderQR: %v", err)
	}
	lines, err := renderQR(url, 3*time.Minute, true)
	if err != nil {
		t.Fatalf("renderQR: %v", err)
	}
	// The art sits between the top frame/blank pair and the bottom blank/frame pair.
	art := lines[2 : len(lines)-4]
	plainArt := plain[:len(plain)-2]
	if len(art) != len(plainArt) {
		t.Fatalf("framed QR has %d art lines, plain QR has %d", len(art), len(plainArt))
	}
	for i := range art {
		// Only the frame columns may carry colour: once the escapes are
		// stripped, the row must be exactly the plain QR row inside bars.
		if got, want := stripANSI(art[i]), "  │"+plainArt[i]+"  │"; got != want {
			t.Fatalf("QR line %d = %q, want %q", i, got, want)
		}
		if n := strings.Count(art[i], "\x1b"); n != 4 {
			t.Fatalf("QR line %d has %d escape sequences, want 4 (two painted bars)", i, n)
		}
	}
	stripped := stripANSI(strings.Join(lines, "\n"))
	for _, want := range []string{"┌", "┐", "└", "┘", "用微信扫一扫 · 3 分钟内有效"} {
		if !strings.Contains(stripped, want) {
			t.Errorf("framed QR block is missing %q", want)
		}
	}
}

func TestQRHint(t *testing.T) {
	cases := []struct {
		ttl  time.Duration
		want string
	}{
		{0, "用微信扫一扫"},
		{3 * time.Minute, "用微信扫一扫 · 3 分钟内有效"},
		{90 * time.Second, "用微信扫一扫 · 2 分钟内有效"},
	}
	for _, c := range cases {
		if got := qrHint(c.ttl); got != c.want {
			t.Errorf("qrHint(%s) = %q, want %q", c.ttl, got, c.want)
		}
	}
}

func TestFormatterPlain(t *testing.T) {
	f := consoleFormatter{coloured: false}
	entry := &logrus.Entry{
		Time:    time.Date(2026, 11, 3, 14, 32, 5, 0, time.UTC),
		Level:   logrus.WarnLevel,
		Message: "hot login attempt 1/5 failed",
		Data:    map[string]interface{}{"provider": "openaicompat"},
	}
	got, err := f.Format(entry)
	if err != nil {
		t.Fatalf("Format: %v", err)
	}
	want := "14:32:05  WARN   hot login attempt 1/5 failed provider=openaicompat\n"
	if string(got) != want {
		t.Errorf("Format() = %q, want %q", got, want)
	}
	if strings.ContainsRune(string(got), 0x1b) {
		t.Error("uncoloured formatter emitted an ANSI escape")
	}
}

func TestFormatterColouredMatchesPlainText(t *testing.T) {
	entry := &logrus.Entry{
		Time:    time.Date(2026, 11, 3, 9, 5, 0, 0, time.UTC),
		Level:   logrus.ErrorLevel,
		Message: "provider: api 401",
	}
	plain, err := consoleFormatter{}.Format(entry)
	if err != nil {
		t.Fatalf("Format: %v", err)
	}
	coloured, err := consoleFormatter{coloured: true}.Format(entry)
	if err != nil {
		t.Fatalf("Format: %v", err)
	}
	if !strings.Contains(string(coloured), "\x1b[38;2;") {
		t.Fatalf("coloured formatter emitted no colour: %q", coloured)
	}
	if got, want := stripANSI(string(coloured)), string(plain); got != want {
		t.Errorf("stripped coloured output = %q, want %q", got, want)
	}
}

func TestLevelLabels(t *testing.T) {
	cases := map[logrus.Level]string{
		logrus.TraceLevel: "TRACE",
		logrus.DebugLevel: "DEBUG",
		logrus.InfoLevel:  "INFO",
		logrus.WarnLevel:  "WARN",
		logrus.ErrorLevel: "ERROR",
		logrus.FatalLevel: "FATAL",
		logrus.PanicLevel: "PANIC",
	}
	for level, want := range cases {
		if got := levelLabel(level); got != want {
			t.Errorf("levelLabel(%s) = %q, want %q", level, got, want)
		}
	}
}
