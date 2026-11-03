// Package console renders SorarinBot's terminal start-up card, the WeChat
// login status line and the QR block.
//
// The terminal is a supporting actor: it only has to look tidy during the few
// seconds between launch and the dashboard appearing. Every rendering path
// degrades to plain text when stdout is not a terminal, when NO_COLOR (or
// SORARINBOT_NO_COLOR) is set, when -quiet is active, or when the backend is
// running inside the Electron shell.
package console

import (
	"fmt"
	"os"
	"strings"
	"sync"
	"sync/atomic"
	"unicode"
)

// Login states. They mirror adapters/openwechat.LoginState, which is the
// producer of every status transition rendered here.
const (
	StateIdle         = "idle"
	StateHotLoggingIn = "hot_logging_in"
	StateWaitingScan  = "waiting_scan"
	StateScanned      = "scanned"
	StateLoggedIn     = "logged_in"
	StateFailed       = "failed"
)

// rgb is a 24-bit colour from the palette the dashboard uses. Terminals
// without truecolor support degrade to their nearest approximation.
type rgb struct{ r, g, b uint8 }

var (
	mint     = rgb{0x13, 0xE0, 0xBC} // 品牌薄荷：成功、等待扫码
	gold     = rgb{0xD1, 0xAB, 0x79} // 暖金：副标题
	darkGray = rgb{0x6B, 0x6B, 0x6B} // 暗灰：键名、次要信息
	amber    = rgb{0xF5, 0x9E, 0x0B} // 琥珀：进行中、待确认
	red      = rgb{0xF8, 0x71, 0x71} // 红：失败
)

// quiet suppresses every decorative block. -quiet sets it so that only
// WARN and above reaches the terminal.
var quiet atomic.Bool

// SetQuiet turns the card, status lines, QR block and success message off.
// Log output is unaffected; callers lower the logrus level separately.
func SetQuiet(on bool) { quiet.Store(on) }

var (
	ttyOnce     sync.Once
	stdoutIsTTY bool
)

// TTY reports whether stdout is an interactive terminal. Only a character
// device counts: a pipe or a redirected file is not a terminal.
func TTY() bool {
	ttyOnce.Do(func() {
		stdoutIsTTY = isCharDevice(os.Stdout)
		if stdoutIsTTY {
			// Windows consoles have to be told to interpret ANSI escapes.
			enableVirtualTerminal()
		}
	})
	return stdoutIsTTY
}

// Colors reports whether ANSI colour may be written to stdout.
func Colors() bool {
	if noColor() {
		return false
	}
	return TTY()
}

// noColor honours the NO_COLOR convention and its project-specific alias.
func noColor() bool {
	return os.Getenv("NO_COLOR") != "" || os.Getenv("SORARINBOT_NO_COLOR") != ""
}

// inElectron reports whether the desktop shell is running the backend. The
// dashboard is the interface there, so the terminal stays log-only.
func inElectron() bool {
	return os.Getenv("SORARINBOT_ELECTRON") != ""
}

func isCharDevice(f *os.File) bool {
	if f == nil {
		return false
	}
	fi, err := f.Stat()
	if err != nil {
		return false
	}
	return fi.Mode()&os.ModeCharDevice != 0
}

// outMu serialises writes so a status line can never interleave with a QR
// block printed from another goroutine.
var outMu sync.Mutex

func printLines(lines []string) {
	if len(lines) == 0 {
		return
	}
	var b strings.Builder
	for _, line := range lines {
		b.WriteString(line)
		b.WriteByte('\n')
	}
	outMu.Lock()
	defer outMu.Unlock()
	_, _ = os.Stdout.WriteString(b.String())
}

// paint wraps s in a 24-bit ANSI colour when coloured is true.
func paint(s string, c rgb, coloured bool) string {
	if !coloured || s == "" {
		return s
	}
	return fmt.Sprintf("\x1b[38;2;%d;%d;%dm%s\x1b[0m", c.r, c.g, c.b, s)
}

// textWidth returns the number of terminal columns s occupies. Wide (East
// Asian) runes take two columns and combining marks take none; everything
// else is one column per rune.
func textWidth(s string) int {
	w := 0
	for _, r := range s {
		w += runeWidth(r)
	}
	return w
}

func runeWidth(r rune) int {
	switch {
	case r == 0:
		return 0
	case unicode.Is(unicode.Mn, r) || unicode.Is(unicode.Me, r) || unicode.Is(unicode.Cf, r):
		return 0 // combining marks and format characters
	case r >= 0x1100 && (r <= 0x115F || // Hangul Jamo
		r == 0x2329 || r == 0x232A ||
		(r >= 0x2E80 && r <= 0xA4CF && r != 0x303F) || // CJK radicals, kana, Han
		(r >= 0xAC00 && r <= 0xD7A3) || // Hangul syllables
		(r >= 0xF900 && r <= 0xFAFF) || // CJK compatibility ideographs
		(r >= 0xFE10 && r <= 0xFE19) ||
		(r >= 0xFE30 && r <= 0xFE6F) ||
		(r >= 0xFF00 && r <= 0xFF60) || // fullwidth forms
		(r >= 0xFFE0 && r <= 0xFFE6) ||
		(r >= 0x1F300 && r <= 0x1F64F) || // emoji
		(r >= 0x1F900 && r <= 0x1F9FF) ||
		(r >= 0x20000 && r <= 0x3FFFD)):
		return 2
	}
	return 1
}

// padRight pads s with spaces up to the requested display width.
func padRight(s string, width int) string {
	if n := width - textWidth(s); n > 0 {
		return s + strings.Repeat(" ", n)
	}
	return s
}

// statusParts maps a login state to its dot, wording and colour, following
// docs/08-终端界面设计.md §4.
func statusParts(state, detail string) (dot, text string, c rgb) {
	switch state {
	case StateIdle:
		return "○", "启动中", darkGray
	case StateHotLoggingIn:
		if detail != "" {
			return "●", "正在使用已保存的登录态…（" + detail + "）", amber
		}
		return "●", "正在使用已保存的登录态…", amber
	case StateWaitingScan:
		return "●", "等待扫码", mint
	case StateScanned:
		return "●", "已扫码，请在手机上确认", amber
	case StateLoggedIn:
		if detail != "" {
			return "●", "已登录  " + detail, mint
		}
		return "●", "已登录", mint
	case StateFailed:
		if detail != "" {
			return "●", "登录失败：" + detail, red
		}
		return "●", "登录失败", red
	default:
		if detail != "" {
			return "●", state + "：" + detail, darkGray
		}
		return "●", state, darkGray
	}
}

// statusValue renders the dot plus its wording. The dot always carries the
// state colour; the text keeps the terminal's default colour so the line
// reads like part of the log, except for a failure where the reason matters.
func statusValue(state, detail string, coloured bool) string {
	dot, text, c := statusParts(state, detail)
	if state == StateFailed {
		return paint(dot, c, coloured) + " " + paint(text, c, coloured)
	}
	return paint(dot, c, coloured) + " " + text
}

var (
	statusMu   sync.Mutex
	lastStatus string
)

// Status prints one line for a login state change. Repeating an identical
// transition is suppressed, so the retry loop cannot flood the terminal.
func Status(state, detail string) {
	if quiet.Load() {
		return
	}
	key := state + "\x00" + detail
	statusMu.Lock()
	if key == lastStatus {
		statusMu.Unlock()
		return
	}
	lastStatus = key
	statusMu.Unlock()
	printLines([]string{"  " + statusValue(state, detail, Colors())})
}

// CardConfig is everything the start-up card shows. It is deliberately
// short: the terminal is not a control panel.
type CardConfig struct {
	Version     string // release tag, e.g. "v2.4.0"
	WebURL      string // dashboard address, e.g. "http://localhost:8080"
	Provider    string // provider name, e.g. "openaicompat"
	Model       string // model in use; empty means "未配置"
	DBPath      string // database file
	WeChatState string // login state; empty means waiting_scan
}

// Card prints the start-up card: a rounded mint box with the product name,
// then one short line per subsystem. It prints nothing under -quiet or in
// Electron mode, and falls back to plain text when stdout is redirected.
func Card(cfg CardConfig) {
	if quiet.Load() || inElectron() {
		return
	}
	coloured := Colors()
	lines := renderCard(cfg, coloured)
	if coloured {
		lines = append([]string{""}, lines...)
	}
	printLines(append(lines, ""))
}

// renderCard builds the card. coloured is a parameter rather than a call to
// Colors so the layout can be tested without a terminal.
func renderCard(cfg CardConfig, coloured bool) []string {
	version := cfg.Version
	if version == "" {
		version = "dev"
	}
	state := cfg.WeChatState
	if state == "" {
		state = StateWaitingScan
	}
	rows := [][2]string{
		{"管理后台", cfg.WebURL},
		{"AI 服务", aiValue(cfg.Provider, cfg.Model, coloured)},
		{"微信", statusValue(state, "", coloured)},
		{"数据", cfg.DBPath},
	}
	keyWidth := 0
	for _, row := range rows {
		if w := textWidth(row[0]); w > keyWidth {
			keyWidth = w
		}
	}
	keyWidth += 2

	var lines []string
	if coloured {
		titles := []string{"SorarinBot · " + version, "微信 × AI"}
		inner := 0
		for _, title := range titles {
			if w := textWidth(title); w > inner {
				inner = w
			}
		}
		inner += 4 // two spaces of breathing room on each side
		lines = append(lines, "  "+paint("╭"+strings.Repeat("─", inner)+"╮", mint, true))
		titleColours := [2]rgb{mint, gold}
		for i, title := range titles {
			padding := strings.Repeat(" ", inner-4-textWidth(title))
			lines = append(lines,
				"  "+paint("│", mint, true)+"  "+
					paint(title, titleColours[i], true)+padding+"  "+
					paint("│", mint, true))
		}
		lines = append(lines, "  "+paint("╰"+strings.Repeat("─", inner)+"╯", mint, true))
		lines = append(lines, "")
	} else {
		lines = append(lines, "  SorarinBot · "+version, "  微信 × AI")
	}
	for _, row := range rows {
		key := padRight(row[0], keyWidth)
		if coloured {
			key = paint(key, darkGray, true)
		}
		lines = append(lines, "  "+key+row[1])
	}
	return lines
}

// aiValue is the "AI 服务" row: provider plus the model actually in use, or
// a visible hint that nothing is configured yet.
func aiValue(provider, model string, coloured bool) string {
	if provider == "" {
		provider = "openaicompat"
	}
	if model == "" {
		return provider + " · " + paint("未配置", amber, coloured)
	}
	return provider + " · " + model
}

// Success is the small cat easter egg shown once WeChat is logged in.
func Success(nick string) {
	if quiet.Load() {
		return
	}
	msg := "ฅ^•ﻌ•^ฅ  已登录，可以开始聊天了。"
	if nick != "" {
		msg += "（" + nick + "）"
	}
	printLines([]string{"  " + paint(msg, mint, Colors()), ""})
}
