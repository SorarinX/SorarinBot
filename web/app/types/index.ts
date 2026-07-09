// SorarinBot TypeScript type definitions

// === System ===

export interface SystemStatus {
  status: string
  provider: string
  model: string
  startup_at: string
  api_key_configured: boolean
  sessions: string[]
  electron?: boolean
}

// === Provider ===

export interface ProviderConfig {
  name: string
  base_url: string
  model: string
  api_key?: string
}

// === Chat ===

export interface ChatConfig {
  context_enabled: boolean
  max_context: number
  image_ttl: number
}

// === WeChat ===

export interface WeChatConfig {
  strict_login: boolean
  token_file: string
  auto_login: boolean
  trigger_prefix: string
}

// === Web ===

export interface WebConfig {
  listen: string
}

// === Database ===

export interface DatabaseConfig {
  path: string
}

// === Full Config ===

export interface AppConfig {
  provider: ProviderConfig
  prompt: string
  chat: ChatConfig
  wechat: WeChatConfig
  web: WebConfig
  database: DatabaseConfig
}

// === Messages (matches Go database.Row) ===

export interface MessageRow {
  id: number
  sender: string
  room: string
  user_message: string
  bot_reply: string
  model: string
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
}

// === Logs (Go returns []string) ===
// API returns plain strings, not objects
