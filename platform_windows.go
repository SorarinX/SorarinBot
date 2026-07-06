package main

import (
	"runtime"
	"syscall"
)

var (
	kernel32         = syscall.NewLazyDLL("kernel32.dll")
	user32           = syscall.NewLazyDLL("user32.dll")
	getConsoleWindow = kernel32.NewProc("GetConsoleWindow")
	showWindow       = user32.NewProc("ShowWindow")
)

const swHide = 0
const swShow = 5

func hideConsoleWindow() {
	if runtime.GOOS != "windows" {
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
