package console

import (
	"errors"
	"fmt"
	"strings"
	"sync/atomic"
	"time"

	"github.com/skip2/go-qrcode"
)

// qrShown records whether a QR block is currently on screen, so ClearQR only
// prints a separator when there is something to clear.
var qrShown atomic.Bool

// qrEnabled controls the terminal QR block. It defaults to on for tests and
// direct users of the package; main turns it off unless -console-qr is given,
// because the web dashboard is the primary place to scan.
var qrEnabled atomic.Bool

func init() { qrEnabled.Store(true) }

// SetQR enables or disables the terminal QR block.
func SetQR(enabled bool) { qrEnabled.Store(enabled) }

// ShowQR prints the WeChat login QR code. The code itself is never coloured:
// a phone camera needs the plain pattern, so only the frame and the captions
// carry the palette. Nothing is printed in Electron mode or under -quiet.
func ShowQR(url string, ttl time.Duration) {
	if url == "" || !qrEnabled.Load() || quiet.Load() || inElectron() {
		return
	}
	coloured := Colors()
	lines, err := renderQR(url, ttl, coloured)
	if err != nil {
		return
	}
	qrShown.Store(true)
	if coloured {
		lines = append([]string{""}, lines...)
	}
	printLines(lines)
}

// renderQR builds the block: a thin frame around the QR, then the one-line
// instruction and the URL as a fallback. coloured is a parameter rather than
// a call to Colors so the layout can be tested without a terminal.
func renderQR(url string, ttl time.Duration, coloured bool) ([]string, error) {
	code, err := qrcode.New(url, qrcode.Medium)
	if err != nil {
		return nil, err
	}
	art := strings.Split(strings.TrimRight(code.ToSmallString(false), "\n"), "\n")
	if len(art) == 0 {
		return nil, errors.New("console: empty QR code")
	}
	width := 0
	for _, line := range art {
		if w := textWidth(line); w > width {
			width = w
		}
	}

	var lines []string
	if coloured {
		inner := width + 4 // two columns of quiet zone on each side
		frame := func(left, right string) string {
			return "  " + paint(left+strings.Repeat("─", inner)+right, darkGray, true)
		}
		bar := paint("│", darkGray, true)
		blank := "  " + bar + strings.Repeat(" ", inner) + bar
		lines = append(lines, frame("┌", "┐"), blank)
		for _, line := range art {
			lines = append(lines,
				"  "+bar+"  "+line+strings.Repeat(" ", width-textWidth(line))+"  "+bar)
		}
		lines = append(lines, blank, frame("└", "┘"))
	} else {
		for _, line := range art {
			lines = append(lines, "  "+line)
		}
	}
	lines = append(lines,
		"  "+paint(qrHint(ttl), mint, coloured),
		"  "+paint(url, darkGray, coloured),
	)
	return lines, nil
}

// qrHint describes how long the code can be scanned for, without turning the
// terminal into a countdown timer.
func qrHint(ttl time.Duration) string {
	if ttl <= 0 {
		return "用微信扫一扫"
	}
	minutes := (ttl + time.Minute - 1) / time.Minute
	return fmt.Sprintf("用微信扫一扫 · %d 分钟内有效", minutes)
}

// ClearQR marks the end of a QR block. A terminal cannot remove lines that
// were already printed, so a dim rule stands in for the cleared block.
func ClearQR() {
	if !qrShown.Swap(false) {
		return
	}
	printLines([]string{"  " + paint(strings.Repeat("─", 28), darkGray, Colors())})
}
