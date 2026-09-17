//go:build windows

package openwechat

import (
	"syscall"
	"testing"
	"unsafe"
)

// winHandleCount returns the process's open handle count (Windows only).
//
// This lives behind a build tag so the probe file stays compilable on
// Linux, where syscall.NewLazyDLL does not exist. Windows-only by
// construction, so the returned bool reports availability for callers
// that must skip the assertion elsewhere.
func winHandleCount(t *testing.T) (uint32, bool) {
	t.Helper()
	kernel32 := syscall.NewLazyDLL("kernel32.dll")
	getProcessHandleCount := kernel32.NewProc("GetProcessHandleCount")
	var count uint32
	const currentProcess = ^uintptr(0) // pseudo-handle for this process
	r, _, err := getProcessHandleCount.Call(
		currentProcess,
		uintptr(unsafe.Pointer(&count)),
	)
	if r == 0 {
		t.Logf("GetProcessHandleCount failed: %v", err)
		return 0, false
	}
	return count, true
}