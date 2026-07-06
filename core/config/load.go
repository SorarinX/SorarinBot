package config

import (
	"os"
	"path/filepath"
	"sync"

	"gopkg.in/yaml.v3"
)

var (
	mu   sync.RWMutex
	Cfg  = defaultConfig()
	Path = defaultConfigPath()
)

func defaultConfigPath() string {
	exe, _ := os.Executable()
	dir := filepath.Dir(exe)
	return filepath.Join(dir, "config.yaml")
}

func defaultConfig() Config {
	return Config{
		Admin:   AdminConfig{PasswordHash: ""},
		WeChat:  WeChatConfig{StrictLogin: false, TokenFile: filepath.Join(filepath.Dir(defaultConfigPath()), "token.json"), AutoLogin: true, TriggerPrefix: ""},
		Web:     WebConfig{Listen: "localhost:8080"},
		Chat:    ChatConfig{ContextEnabled: true, MaxContext: 3, ImageTTL: 300},
		Plugins: PluginConfig{Enabled: false},
		DB:      DatabaseConf{Path: filepath.Join(filepath.Dir(defaultConfigPath()), "data.db")},
		Provider: ProviderConf{
			Name:    "openaicompat",
			BaseURL: "",
			Model:   "",
			APIKey:  "",
		},
		Prompt: "You are a helpful AI assistant.",
	}
}

// Load reads the config file at cfg.Path, merging with defaults.
func Load() error {
	mu.Lock()
	defer mu.Unlock()

	data, err := os.ReadFile(Path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil // defaults are fine
		}
		return err
	}
	return yaml.Unmarshal(data, &Cfg)
}

// Snapshot returns a deep copy of the current Cfg for safe concurrent reads.
func Snapshot() Config {
	mu.RLock()
	defer mu.RUnlock()
	return Cfg
}

// Apply copies fields from `in` into the current Cfg under a write lock,
// so a PUT handler can mutate configuration without racing with Save or
// with other readers (e.g. the dashboard status endpoint).
func Apply(in Config) {
	mu.Lock()
	defer mu.Unlock()
	Cfg = in
}

// Save writes the current config to disk atomically.
// It writes to a sibling temp file first, fsync's the data, then
// renames over the real config path so a crash mid-write can never
// truncate the existing config.
func Save() error {
	mu.Lock()
	defer mu.Unlock()

	data, err := yaml.Marshal(&Cfg)
	if err != nil {
		return err
	}

	tmp := Path + ".tmp"
	if err := os.WriteFile(tmp, data, 0644); err != nil {
		return err
	}
	if err := os.Rename(tmp, Path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}
