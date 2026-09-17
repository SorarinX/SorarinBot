package config

// Config is the top-level project configuration.
// All user‑facing settings live here; it is persisted as YAML.
//
// Every field in this struct is read by the running program. Keys that only
// round-tripped through the file were removed, because a setting that silently
// does nothing is worse than no setting at all.
type Config struct {
	Admin    AdminConfig  `yaml:"admin"`
	WeChat   WeChatConfig `yaml:"wechat"`
	Web      WebConfig    `yaml:"web"`
	Chat     ChatConfig   `yaml:"chat"`
	DB       DatabaseConf `yaml:"database"`
	Provider ProviderConf `yaml:"provider"`
	Prompt   string       `yaml:"prompt"` // system prompt
}

type AdminConfig struct {
	// PasswordHash protects the web dashboard. Empty means authentication is
	// off and the port is open to anyone who can reach it. Set it with
	// `SorarinBot -set-password`.
	PasswordHash string `yaml:"password_hash" json:"password_hash"`
}

type WeChatConfig struct {
	TokenFile string `yaml:"token_file" json:"token_file"`
	// AutoLogin reuses token_file before falling back to a QR scan. Turn it
	// off to always scan, which is the way to replace a saved session.
	AutoLogin bool `yaml:"auto_login" json:"auto_login"`
	// TriggerPrefix is an extra way to trigger a group reply, on top of
	// @mentioning the bot.
	TriggerPrefix string `yaml:"trigger_prefix" json:"trigger_prefix"`
}

type WebConfig struct {
	Listen string `yaml:"listen" json:"listen"`
}

type ChatConfig struct {
	// MaxContext is the number of previous user/assistant pairs replayed to
	// the model. Zero disables conversation memory entirely.
	MaxContext int `yaml:"max_context" json:"max_context"`
	// ImageTTL is how long an uploaded image stays eligible for the next
	// message, in seconds.
	ImageTTL int `yaml:"image_ttl" json:"image_ttl"`
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
