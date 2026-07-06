<p align="center">
  <img src="web/public/logo.png" width="120" alt="SorarinBot Logo">
</p>

<h1 align="center">SorarinBot</h1>

<p align="center">
  <strong>微信 AI 助手 · 多模型 · Web 管理后台</strong><br>
  <em>WeChat AI Assistant · Multi-Model · Web Dashboard</em>
</p>

<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg?style=flat-square" alt="MIT License"></a>
  <img src="https://img.shields.io/badge/Go-1.25+-00ADD8?style=flat-square&logo=go" alt="Go">
  <img src="https://img.shields.io/badge/Nuxt-4-00DC82?style=flat-square&logo=nuxt.js" alt="Nuxt 4">
  <img src="https://img.shields.io/badge/TypeScript-6-3178C6?style=flat-square&logo=typescript" alt="TypeScript">
</p>

---

<p align="center">
  <a href="#features">Features</a> ·
  <a href="#quick-start">Quick Start</a> ·
  <a href="#configuration">Configuration</a> ·
  <a href="#architecture">Architecture</a> ·
  <a href="#api">API</a> ·
  <a href="#contributing">Contributing</a> ·
  <a href="#license">License</a>
</p>

<p align="center">
  <a href="#功能">中文文档</a>
</p>

---

## Features

- **WeChat Integration** — Private & group chat AI replies, @mention support
- **Multi-Model Support** — OpenAI-compatible API, works with OpenAI / DeepSeek / MiniMax / Claude / Ollama and more
- **Modern Web Dashboard** — Built with Nuxt UI, hot-reload config, no restart required
- **Session Management** — Per-user conversation context with configurable history depth
- **Data Persistence** — SQLite storage for message history and system logs
- **Image Recognition** — Vision model support for image understanding
- **Dark Mode** — Built-in theme switching with custom color schemes
- **Responsive Layout** — Desktop and mobile friendly

## Quick Start

### Download

Download the latest installer from [Releases](../../releases) and run it.

### Build from Source

```bash
# Clone
git clone https://github.com/SorarinX/SorarinBot.git
cd SorarinBot

# Build frontend
cd web
pnpm install
pnpm nuxt generate
cp -r .output/public/* dist/
cd ..

# Build backend
go build -o SorarinBot.exe .

# Run
./SorarinBot.exe
```

Open `http://localhost:8080` in your browser.

### First-time Setup

1. Configure your AI provider in the **Settings** page
2. Click **Test Connection** to verify
3. Scan QR code to login WeChat
4. Start chatting

## Configuration

Edit `config.yaml`:

```yaml
provider:
    name: openaicompat          # Provider name
    base_url: ""                # API endpoint
    model: ""                   # Model identifier
    api_key: ""                 # API key

prompt: "You are a helpful AI assistant."

chat:
    context_enabled: true       # Enable context
    max_context: 3              # Context turns
    image_ttl: 300              # Image cache TTL (seconds)

wechat:
    trigger_prefix: ""          # Trigger prefix (empty = all messages)

web:
    listen: localhost:8080      # Web listen address
```

## Architecture

```
SorarinBot/
├── main.go                    # Entry point, routes, SPA serving
├── config.yaml                # Configuration
├── go.mod / go.sum            # Go dependencies
├── core/
│   ├── config/                # Config management
│   ├── message/               # Message handling
│   └── session/               # Session management
├── database/                  # SQLite database
├── providers/                 # LLM Provider interface
├── adapters/                  # WeChat adapter
├── internal/                  # Internal libraries
└── web/                       # Frontend
    ├── app/                   # Nuxt source
    │   ├── pages/             # Pages
    │   ├── components/        # Components
    │   ├── composables/       # Composables
    │   └── assets/            # Static assets
    └── dist/                  # Build output
```

## API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | System status |
| `/api/config` | GET/PUT | Config read/write |
| `/api/history` | GET | Message history (paginated) |
| `/api/logs` | GET | System logs |
| `/api/sessions` | GET | Active sessions |
| `/api/test` | POST | Test provider connection |
| `/api/models` | GET | List available models |

## Supported Providers

| Provider | Base URL |
|----------|----------|
| OpenAI | `https://api.openai.com/v1` |
| DeepSeek | `https://api.deepseek.com` |
| MiniMax | `https://api.minimaxi.com/v1` |
| Claude | `https://api.anthropic.com/v1` |
| Ollama | `http://localhost:11434/v1` |
| SiliconFlow | `https://api.siliconflow.cn/v1` |
| Moonshot | `https://api.moonshot.cn/v1` |
| Qwen | `https://dashscope.aliyuncs.com/compatible-mode/v1` |

## Tech Stack

- **Backend:** Go + SQLite + openwechat
- **Frontend:** Nuxt 4 + Nuxt UI 4 + Tailwind CSS v4 + TypeScript

## Contributing

Contributions are welcome! Please read the [Contributing Guide](CONTRIBUTING.md) before submitting a PR.

## License

[MIT License](LICENSE) — Copyright (c) 2026 Sorarin

---

# 中文文档

## 功能

- **微信集成** — 私聊/群聊 AI 回复，支持 @机器人
- **多模型支持** — OpenAI Compatible 接口，兼容 OpenAI / DeepSeek / MiniMax / Claude / Ollama 等
- **现代化管理后台** — 基于 Nuxt UI 构建，配置热更新，无需重启
- **会话管理** — 多用户独立上下文，可配置上下文轮数
- **数据持久化** — SQLite 存储消息历史和系统日志
- **图片识别** — 支持视觉模型的图片理解
- **暗色模式** — 内置主题切换，支持自定义配色
- **响应式布局** — 适配桌面和移动端

## 快速开始

### 下载安装

从 [Releases](../../releases) 下载最新版安装程序，双击运行即可。

### 从源码构建

```bash
# 克隆项目
git clone https://github.com/SorarinX/SorarinBot.git
cd SorarinBot

# 构建前端
cd web
pnpm install
pnpm nuxt generate
cp -r .output/public/* dist/
cd ..

# 构建后端
go build -o SorarinBot.exe .

# 运行
./SorarinBot.exe
```

浏览器打开 `http://localhost:8080` 访问管理后台。

### 首次配置

1. 在管理后台 **配置** 页面填写 Provider 信息
2. 点击 **测试连接** 验证配置
3. 扫码登录微信
4. 开始对话

## 配置说明

编辑 `config.yaml`：

```yaml
provider:
    name: openaicompat          # Provider 名称
    base_url: ""                # API 地址
    model: ""                   # 模型名称
    api_key: ""                 # API Key

prompt: "You are a helpful AI assistant."

chat:
    context_enabled: true       # 启用上下文
    max_context: 3              # 上下文轮数
    image_ttl: 300              # 图片缓存时间（秒）

wechat:
    trigger_prefix: ""          # 触发前缀（空=回复所有消息）

web:
    listen: localhost:8080      # Web 监听地址
```

## 项目结构

```
SorarinBot/
├── main.go                    # 入口，路由，SPA 服务
├── config.yaml                # 配置文件
├── go.mod / go.sum            # Go 依赖
├── core/
│   ├── config/                # 配置管理
│   ├── message/               # 消息处理
│   └── session/               # 会话管理
├── database/                  # SQLite 数据库
├── providers/                 # LLM Provider 接口
├── adapters/                  # 微信适配器
├── internal/                  # 内部库
└── web/                       # 前端
    ├── app/                   # Nuxt 源码
    │   ├── pages/             # 页面
    │   ├── components/        # 组件
    │   ├── composables/       # 组合函数
    │   └── assets/            # 静态资源
    └── dist/                  # 构建产物
```

## API 接口

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/status` | GET | 系统状态 |
| `/api/config` | GET/PUT | 配置读写 |
| `/api/history` | GET | 消息历史（分页） |
| `/api/logs` | GET | 系统日志 |
| `/api/sessions` | GET | 活跃会话 |
| `/api/test` | POST | 测试 Provider 连接 |
| `/api/models` | GET | 获取模型列表 |

## 支持的 Provider

| Provider | Base URL |
|----------|----------|
| OpenAI | `https://api.openai.com/v1` |
| DeepSeek | `https://api.deepseek.com` |
| MiniMax | `https://api.minimaxi.com/v1` |
| Claude | `https://api.anthropic.com/v1` |
| Ollama | `http://localhost:11434/v1` |
| SiliconFlow | `https://api.siliconflow.cn/v1` |
| Moonshot | `https://api.moonshot.cn/v1` |
| 通义千问 | `https://dashscope.aliyuncs.com/compatible-mode/v1` |

## 技术栈

- **后端：** Go + SQLite + openwechat
- **前端：** Nuxt 4 + Nuxt UI 4 + Tailwind CSS v4 + TypeScript

## 参与贡献

欢迎贡献！请在提交 PR 前阅读[贡献指南](CONTRIBUTING.md)。

## 许可证

[MIT License](LICENSE) — Copyright (c) 2026 Sorarin
