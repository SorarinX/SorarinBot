//go:build linux

package openwechat

import "os/exec"

// openBrowser opens a URL in the default browser on Linux.
func openBrowser(url string) {
	cmd := exec.Command("xdg-open", url)
	_ = cmd.Start()
}
