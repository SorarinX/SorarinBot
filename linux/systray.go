package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"github.com/energye/systray"
	"github.com/sirupsen/logrus"
)

// TrayConfig holds the configuration for the system tray.
type TrayConfig struct {
	WebURL      string      // e.g. "http://localhost:8080"
	IconPath    string      // path to icon.ico or logo.png
	OnExit      func()      // called when user clicks "Quit"
	OnAutoStart func(bool)  // called when user toggles auto-start
	IsAutoStart func() bool // returns current auto-start state
}

// InitTray initializes the system tray icon and menu.
// Blocks — must be called from a dedicated goroutine.
func InitTray(cfg TrayConfig) {
	iconData := loadIcon(cfg.IconPath)

	systray.Run(func() {
		// onReady
		logrus.Info("[tray] onReady called")
		if iconData != nil {
			systray.SetIcon(iconData)
			logrus.Info("[tray] icon set")
		}
		systray.SetTitle("SorarinBot")
		systray.SetTooltip("SorarinBot — WeChat AI Assistant")

		// Menu items
		mOpen := systray.AddMenuItem("打开管理后台", "Open web management UI")
		systray.AddSeparator()
		autoStartChecked := cfg.IsAutoStart != nil && cfg.IsAutoStart()
		mAutoStart := systray.AddMenuItemCheckbox("开机自启动", "系统启动时自动运行", autoStartChecked)
		systray.AddSeparator()
		mQuit := systray.AddMenuItem("退出", "Exit SorarinBot")

		logrus.Info("[tray] menu items created")

		// Tray icon click — use SetOnClick for left-click
		systray.SetOnClick(func(menu systray.IMenu) {
			logrus.Infof("[tray] icon clicked, opening %s", cfg.WebURL)
			openURL(cfg.WebURL)
		})

		// Menu item handlers
		mOpen.Click(func() {
			logrus.Infof("[tray] Open Dashboard clicked")
			openURL(cfg.WebURL)
		})

		mAutoStart.Click(func() {
			newState := !mAutoStart.Checked()
			logrus.Infof("[tray] Auto Start toggled: %v", newState)
			// Update UI immediately
			if newState {
				mAutoStart.Check()
			} else {
				mAutoStart.Uncheck()
			}
			// Do registry write in background to avoid blocking event loop
			if cfg.OnAutoStart != nil {
				go cfg.OnAutoStart(newState)
			}
		})

		mQuit.Click(func() {
			logrus.Info("[tray] Quit clicked")
			// Send exit signal in background to avoid blocking event loop
			if cfg.OnExit != nil {
				go cfg.OnExit()
			}
			systray.Quit()
		})

		logrus.Info("[tray] system tray fully initialized")

	}, func() {
		// onExit
		logrus.Info("[tray] system tray exited")
	})
}

func loadIcon(iconPath string) []byte {
	// Try specified path first
	if iconPath != "" {
		if data, err := os.ReadFile(iconPath); err == nil {
			return data
		}
	}

	// Try multiple base directories
	exe, _ := os.Executable()
	exeDir := filepath.Dir(exe)
	cwd, _ := os.Getwd()

	bases := []string{exeDir, cwd}
	names := []string{"icon.ico", "logo.png"}

	for _, base := range bases {
		for _, name := range names {
			p := filepath.Join(base, name)
			if data, err := os.ReadFile(p); err == nil {
				logrus.Infof("[tray] icon loaded from %s", p)
				return data
			}
		}
	}

	logrus.Warn("[tray] no icon found, tray will use default")
	return nil
}

func openURL(rawURL string) {
	var cmd *exec.Cmd
	switch {
	case runtime.GOOS == "windows":
		cmd = exec.Command("cmd", "/c", "start", rawURL)
	case runtime.GOOS == "darwin":
		cmd = exec.Command("open", rawURL)
	default:
		cmd = exec.Command("xdg-open", rawURL)
	}
	if err := cmd.Start(); err != nil {
		logrus.Debugf("[tray] open URL failed: %v", err)
	}
	fmt.Printf("[tray] opened %s\n", rawURL)
}
