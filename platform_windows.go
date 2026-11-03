package main

import (
	"runtime"
	"syscall"
	"unsafe"
)

var (
	kernel32              = syscall.NewLazyDLL("kernel32.dll")
	user32                = syscall.NewLazyDLL("user32.dll")
	getConsoleWindow      = kernel32.NewProc("GetConsoleWindow")
	getConsoleProcessList = kernel32.NewProc("GetConsoleProcessList")
	showWindow            = user32.NewProc("ShowWindow")
)

const swHide = 0
const swShow = 5

// isDedicatedConsole reports whether this process is the only one attached to
// the console. A double-click gets its own console (one process); a terminal
// that launched the bot with .\SorarinBot.exe has a shell attached too, and
// hiding that window would hide the user's shell as well.
func isDedicatedConsole() bool {
	hwnd, _, _ := getConsoleWindow.Call()
	if hwnd == 0 {
		return false
	}
	var pids [2]uint32
	n, _, _ := getConsoleProcessList.Call(uintptr(unsafe.Pointer(&pids[0])), uintptr(len(pids)))
	return n == 1
}

func hideConsoleWindow() {
	if runtime.GOOS != "windows" || !isDedicatedConsole() {
		return
	}
	hwnd, _, _ := getConsoleWindow.Call()
	if hwnd != 0 {
		showWindow.Call(hwnd, swHide)
	}
}

func showConsoleWindow() {
	if runtime.GOOS != "windows" {
		return
	}
	hwnd, _, _ := getConsoleWindow.Call()
	if hwnd != 0 {
		showWindow.Call(hwnd, swShow)
	}
}
