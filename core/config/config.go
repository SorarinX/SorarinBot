package config

// Config is the top-level project configuration.
// All user‑facing settings live here; it is persisted as YAML.
type Config struct {
	Admin    AdminConfig  `yaml:"admin"`
	WeChat   WeChatConfig `yaml:"wechat"`
	Web      WebConfig    `yaml:"web"`
	Chat     ChatConfig   `yaml:"chat"`
	Plugins  PluginConfig `yaml:"plugins"`
	DB       DatabaseConf `yaml:"database"`
	Provider ProviderConf `yaml:"provider"`
	Prompt   string       `yaml:"prompt"` // system prompt
}

type AdminConfig struct {
	PasswordHash string `yaml:"password_hash" json:"password_hash"`
}

type WeChatConfig struct {
	StrictLogin   bool   `yaml:"strict_login" json:"strict_login"`
	TokenFile     string `yaml:"token_file" json:"token_file"`
	AutoLogin     bool   `yaml:"auto_login" json:"auto_login"`
	TriggerPrefix string `yaml:"trigger_prefix" json:"trigger_prefix"`
}

type WebConfig struct {
	Listen string `yaml:"listen" json:"listen"`
}

type ChatConfig struct {
	ContextEnabled bool `yaml:"context_enabled" json:"context_enabled"`
	MaxContext     int  `yaml:"max_context" json:"max_context"`
	ImageTTL       int  `yaml:"image_ttl" json:"image_ttl"`
}

type PluginConfig struct {
	Enabled bool `yaml:"enabled" json:"enabled"`
}

type DatabaseConf struct {
	Path string `yaml:"path" json:"path"`
}

type ProviderConf struct {
	Name    string `yaml:"name" json:"name"`
	BaseURL string `yaml:"base_url" json:"base_url"`
	Model   string `yaml:"model" json:"model"`
	APIKey  string `yaml:"api_key" json:"api_key"`
}
