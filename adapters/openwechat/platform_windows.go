package openwechat

import (
	"os"
	"runtime"
)

// openBrowser opens a URL in the default browser.
func openBrowser(url string) {
	if runtime.GOOS != "windows" {
		return
	}
	cmd := "cmd"
	args := []string{"/c", "start", url}
	_, _ = os.StartProcess(cmd, append([]string{cmd}, args...), &os.ProcAttr{})
}
