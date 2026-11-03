//go:build !windows

package console

// enableVirtualTerminal is a no-op outside Windows: POSIX terminals already
// understand ANSI escape sequences.
func enableVirtualTerminal() {}
