//go:build linux

package main

// On Linux there is no Windows-style console window to hide/show.
// These are intentional no-ops.

func hideConsoleWindow() {}

func showConsoleWindow() {}
