//go:build windows

package console

import (
	"os"

	"golang.org/x/sys/windows"
)

const (
	// enableVirtualTerminalProcessing tells conhost.exe to interpret ANSI
	// escape sequences instead of printing them literally.
	enableVirtualTerminalProcessing = 0x0004

	// utf8CodePage renders the box drawing and the Chinese labels correctly
	// in cmd.exe, whose default code page is a legacy one on zh-CN systems.
	utf8CodePage = 65001
)

// enableVirtualTerminal turns on ANSI handling for the console stdout is
// attached to. It is a no-op when that handle is not a console.
func enableVirtualTerminal() {
	handle := windows.Handle(os.Stdout.Fd())
	var mode uint32
	if err := windows.GetConsoleMode(handle, &mode); err != nil {
		return
	}
	if mode&enableVirtualTerminalProcessing == 0 {
		_ = windows.SetConsoleMode(handle, mode|enableVirtualTerminalProcessing)
	}
	_ = windows.SetConsoleOutputCP(utf8CodePage)
}
