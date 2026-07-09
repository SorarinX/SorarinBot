//go:build linux

package main

// Auto-start via .desktop file is not yet implemented on Linux.
// These are intentional no-ops.

func getAutostart() bool { return false }

func setAutostart(enabled bool) error { return nil }
