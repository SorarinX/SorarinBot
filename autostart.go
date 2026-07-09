//go:build windows

package main

import (
	"os"
	"path/filepath"

	"golang.org/x/sys/windows/registry"
)

const autostartRegKey = `Software\Microsoft\Windows\CurrentVersion\Run`
const autostartRegName = "SorarinBot"

func getAutostart() bool {
	k, err := registry.OpenKey(registry.CURRENT_USER, autostartRegKey, registry.READ)
	if err != nil {
		return false
	}
	defer k.Close()
	_, _, err = k.GetStringValue(autostartRegName)
	return err == nil
}

func setAutostart(enabled bool) error {
	if enabled {
		exePath, err := currentExePath()
		if err != nil {
			return err
		}
		k, _, err := registry.CreateKey(registry.CURRENT_USER, autostartRegKey, registry.SET_VALUE)
		if err != nil {
			return err
		}
		defer k.Close()
		return k.SetStringValue(autostartRegName, exePath)
	}
	// Disable: delete the registry value
	k, err := registry.OpenKey(registry.CURRENT_USER, autostartRegKey, registry.SET_VALUE)
	if err != nil {
		return nil // already not set
	}
	defer k.Close()
	return k.DeleteValue(autostartRegName)
}

func currentExePath() (string, error) {
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.EvalSymlinks(exe)
}
