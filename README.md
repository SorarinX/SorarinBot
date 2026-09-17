<p align="center">
  <img src="logo.png" width="128" alt="SorarinBot">
</p>

<h1 align="center">SorarinBot</h1>

<p align="center">
  <strong>Your WeChat, wired to any LLM.</strong><br>
  A self-hosted AI assistant in a single Go binary — private-chat auto-reply,<br>
  group @mentions, vision, and memory that is isolated per conversation.
</p>

<p align="center">
  <a href="https://github.com/SorarinX/SorarinBot/releases/latest"><img alt="Latest release" src="https://img.shields.io/github/v/release/SorarinX/SorarinBot?style=flat-square&sort=semver&label=release&color=07C160"></a>
  <a href="https://github.com/SorarinX/SorarinBot/actions/workflows/ci.yml"><img alt="CI status" src="https://github.com/SorarinX/SorarinBot/actions/workflows/ci.yml/badge.svg?style=flat-square"></a>
  <a href="go.mod"><img alt="Go version" src="https://img.shields.io/github/go-mod/go-version/SorarinX/SorarinBot?style=flat-square&color=6E7E96&logo=go&logoColor=white"></a>
  <a href="LICENSE"><img alt="License" src="https://img.shields.io/badge/license-PolyForm%20Noncommercial%201.0.0-07C160?style=flat-square"></a>
  <br>
  <img alt="Platform" src="https://img.shields.io/badge/platform-Windows%20%7C%20Linux-6E7E96?style=flat-square">
  <a href="https://github.com/SorarinX/SorarinBot/releases"><img alt="Downloads" src="https://img.shields.io/github/downloads/SorarinX/SorarinBot/total?style=flat-square&color=6E7E96&label=downloads"></a>
  <a href="https://github.com/SorarinX/SorarinBot/stargazers"><img alt="Stars" src="https://img.shields.io/github/stars/SorarinX/SorarinBot?style=flat-square&color=6E7E96&label=stars"></a>
</p>

<p align="center">
  <strong>English</strong> · <a href="./README.zh-CN.md">简体中文</a>
</p>

---

## ✨ Features

- 💬 **Private & group chat** — answers every private message, and in groups replies to `@mentions` or to a configurable trigger prefix.
- 🤖 **Any OpenAI-compatible model** — DeepSeek, MiniMax, OpenAI, Claude, Gemini, Ollama or your own endpoint. Set `base_url` and `model`, nothing else.
- 🧠 **Memory isolated per conversation** — sessions are keyed by `private:<user>` and `group:<room>:<user>`, so the same person in two different groups keeps two independent contexts.
- ⚡ **Non-blocking dispatch** — an LLM call never stalls the WeChat sync loop. Each conversation gets one strict serial worker, and different conversations run in parallel under a global cap of 8.
- 🔐 **Observable login** — a six-state login machine (`idle` → `hot_logging_in` → `waiting_scan` → `scanned` → `logged_in` / `failed`) surfaced in the dashboard with a **Retry** button. A failed login no longer takes the process down.
- 🔑 **Dashboard password** — optional, off by default, and enforced on every API route and the heartbeat socket when enabled. Failed logins are throttled per address.
- 🖼️ **Vision** — send an image with a caption and it is handed to a vision-capable model.
- 👋 **Group welcome** — greets new members when they join a group.
- 📊 **Web dashboard** — live sessions, paginated chat history, system logs, a provider connection test, and a light/dark theme.
- ⚙️ **Hot reload** — change the API key, model or system prompt from the UI; it applies to the next message, no restart.
- 📌 **Tray & auto-start** — the Windows portable build adds a tray menu and a registry auto-start toggle.
- 🐧 **Runs on Linux** — the same source builds for `linux/amd64`; there is a [tutorial](linux/TUTORIAL.md) for running it headless on a server.
- 🎯 **Pat-pat** — WeChat "pat-pat" interactions get a random reply. Yes, really.

## 📸 Screenshots

> 🔗 **[Live preview](https://sorarinx.github.io/SorarinBot/)** — click through the whole dashboard with simulated data, no install required.

<p align="center">
  <a href="https://sorarinx.github.io/SorarinBot/"><img src=".github/images/dashboard.png" width="880" alt="SorarinBot dashboard"></a>
  <br>
  <sub>The dashboard — provider status, live WeChat login state and per-conversation sessions.</sub>
</p>

|                                            Chat history                                            |                                          System logs                                           |
| :-----------------------------------------------------------------------------------------------: | :--------------------------------------------------------------------------------------------: |
| ![Chat history](.github/images/chat.png) | ![System logs](.github/images/logs.png) |

|                                       Settings                                        |                                     System prompt                                      |
| :-----------------------------------------------------------------------------------: | :------------------------------------------------------------------------------------: |
| ![Settings](.github/images/settings.png) | ![System prompt](.github/images/prompt.png) |

## 🚀 Quick Start

> **Requirements** — Windows 10+ or Linux x64, roughly 25 MB of disk. Nothing else: the binary is statically linked, stores data with a pure-Go SQLite driver (no CGO), and carries the web UI inside it.

1. **Download.** Grab the latest `SorarinBot-v*-win64-portable.zip` from [**Releases**](https://github.com/SorarinX/SorarinBot/releases) and extract it anywhere.
2. **Run it.** Double-click `SorarinBot.exe`. A tray icon appears and the dashboard opens in your browser at **http://localhost:8080**.
3. **Connect a model.** Open **Settings**, paste an API key, pick a model, and save — the change is live immediately, no restart.
4. **Log in to WeChat.** Back on the dashboard home, scan the QR code with WeChat. The same QR code is also printed in the console. The status badge turns green once you are in.

Now send yourself a message on WeChat and the bot will answer.

> ⚠️ **Read [Security](#-security) before you let anyone else reach this.** Out of
> the box the dashboard has no password: whoever can open the port can read your
> chat history and change your API key. And the client speaks an unofficial
> WeChat protocol, which puts the account you log in with at risk.

<details>
<summary><b>Other ways to run it</b> — Linux, one-click installer, build from source</summary>

### Linux

Build it from source with the commands below — it is one `go build` once the frontend is generated. Older releases also carry a ready-made `sorarinbot-*-linux-amd64.tar.gz` tarball if you would rather not build.

### Windows — one-click installer

Some releases also publish an NSIS installer (`SorarinBot.Setup.*.exe`, ~110 MB, includes the Electron desktop shell). The latest release ships the much smaller portable build instead; the two share the same backend.

### Build from source

```bash
git clone https://github.com/SorarinX/SorarinBot.git
cd SorarinBot

# 1. Frontend — generate the static SPA into web/dist, where go:embed picks it up
cd web
pnpm install
pnpm exec nuxt generate
cp -r .output/public/* dist/
cd ..

# 2. Backend — Windows
go build -ldflags="-s -w" -o SorarinBot.exe .

# 2. Backend — Linux
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o SorarinBot .
```

Requires **Go 1.25+** and **Node.js 20+** with **pnpm**.

</details>

## ⚙️ Configuration

Everything lives in `config.yaml`, created next to the binary on first run. All of it can also be edited from the dashboard, and `data.db` / `token.json` are kept beside it — or in `%APPDATA%\SorarinBot` (Windows) and `~/.local/share/SorarinBot` (Linux) when the install directory is read-only.

```yaml
admin:
  password_hash: ""           # empty means no password; set it with `SorarinBot -set-password`

provider:
  name: openaicompat          # any OpenAI-compatible endpoint
  base_url: https://api.deepseek.com
  model: deepseek-chat
  api_key: ""

prompt: "You are a helpful AI assistant."

chat:
  max_context: 3              # previous turns replayed as context; 0 disables history
  image_ttl: 300              # seconds an uploaded image stays usable

wechat:
  auto_login: true            # reuse the saved token before asking for a QR scan
  trigger_prefix: ""          # extra group trigger, e.g. "/ai"

web:
  listen: localhost:8080
```

Keys worth knowing:

| Key | Default | Description |
| --- | --- | --- |
| `admin.password_hash` | – | Protects the dashboard. Empty means anyone who can reach the port gets in. |
| `provider.name` | `openaicompat` | Provider implementation. |
| `provider.base_url` | – | Base URL of the OpenAI-compatible API. |
| `provider.model` | – | Model name sent with every request. |
| `provider.api_key` | – | Falls back to `DEEPSEEK_API_KEY`, `MINIMAX_API_KEY` or `OPENAI_API_KEY` when left empty. |
| `prompt` | – | System prompt. |
| `chat.max_context` | `3` | Previous user/assistant pairs replayed to the model. `0` turns memory off. |
| `chat.image_ttl` | `300` | Seconds an uploaded image stays eligible for the next message. |
| `wechat.auto_login` | `true` | Reuse `token.json` before falling back to a QR scan. Set to `false` to always scan, which is the way to replace a saved session. |
| `wechat.trigger_prefix` | – | A prefix that also triggers a group reply, in addition to `@mention`. |
| `web.listen` | `localhost:8080` | Dashboard address. Use `0.0.0.0:8080` to reach it from another machine. If the port is taken, the next one is tried automatically. |

## 🔒 Security

**There is no password until you set one.** With `admin.password_hash` empty the
dashboard is open to anyone who can reach the port — they can read your chat
history and system logs, and change your provider API key. That is fine on
`localhost`. It is not fine the moment the port is reachable by anything else.

```bash
SorarinBot -set-password      # stores a PBKDF2-SHA256 hash in config.yaml
```

Restart afterwards. Once set, every `/api` route and the heartbeat socket require
a session cookie; failed logins are throttled per client address; the session
lasts seven days and is invalidated by a restart. Run the same command with an
empty answer to turn the password back off.

**The dashboard is plain HTTP.** The session cookie is not encrypted in transit,
so a password stops a stranger on your network but not someone who can capture
the traffic. Do not forward this port to the internet — put it behind a reverse
proxy with TLS if you need remote access.

**Your WeChat account is at risk.** This speaks the WeChat Web protocol through
an unofficial client, which is against WeChat's terms of service. Accounts have
been restricted for doing exactly this. Use an account you can afford to lose.

**Secrets on disk.** `config.yaml` holds your API key and `token.json` holds your
WeChat session. They sit next to the binary, and both are git-ignored — keep it
that way, and never paste either into an issue.

## 🏗️ Architecture

One process, no external services. WeChat and the dashboard meet inside the same Go binary; the only outbound call is the LLM request.

<p align="center">
  <img src=".github/images/architecture.svg" width="920" alt="SorarinBot architecture">
</p>

Three ideas explain most of the design:

- **Dispatch is asynchronous.** The WeChat sync loop only parses and enqueues; the model call happens on a per-session worker, so a slow provider can no longer freeze every conversation for up to a minute.
- **Sessions are strict and bounded.** One worker per conversation keeps a conversation in order, a bounded queue (16) drops with a warning instead of growing without limit, and a panic in one conversation is contained.
- **Login is a state machine, not a loop.** The saved token is retried five times with backoff, then a single QR scan is offered, then the machine parks in `failed` — visible in the UI, retryable with one click, and never fatal to the process.

### Tech Stack

| Layer | Technology |
| --- | --- |
| Backend | Go 1.25 · `net/http` · `gorilla/websocket` · `logrus` · `modernc.org/sqlite` (pure Go) |
| Frontend | Nuxt 4 · Vue 3 · Nuxt UI 4 · Tailwind CSS 4 · TypeScript |
| Desktop | Electron 43 · electron-builder (NSIS installer / AppImage) |
| Database | SQLite — `data.db`, chat history and system logs |
| WeChat | [openwechat](https://github.com/eatmoreapple/openwechat) v1.4.10, vendored under `internal/` |
| LLM        | Any OpenAI-compatible HTTP API, via `providers/openaicompat`                                |

## 📡 API Reference

Every endpoint is served by the same binary as the dashboard. When `admin.password_hash`
is set, everything except the three `auth` routes returns `401` until you sign in.

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/auth/status` | Whether a password is required and whether this browser is signed in. Always public. |
| `POST` | `/api/auth/login` | Exchange a password for a session cookie. Always public. |
| `POST` | `/api/auth/logout` | Clear the session cookie. Always public. |
| `GET` | `/api/status` | Uptime, provider, model, `wechat_state` and the structured session list. |
| `GET` | `/api/login` | Login state machine snapshot — `state`, `attempts`, `qr_url`, `last_error`. |
| `POST` | `/api/login/retry` | Start a fresh login cycle. Returns `202` when accepted. |
| `GET` | `/api/sessions` | Rendered session list. |
| `GET` | `/api/session?user=<key>` | Detail for one session. |
| `GET` | `/api/history?limit=50&offset=0` | Paginated chat history. |
| `GET` | `/api/logs?limit=100` | System logs. `DELETE` clears them. |
| `POST` | `/api/test` | Test the configured provider with a live request. |
| `GET` | `/api/models` | Models offered by the configured provider. |
| `GET` / `PUT` | `/api/config` | Read or update configuration (applied immediately). |
| `GET` / `PUT` | `/api/autostart` | Read or set the auto-start toggle. |
| `WebSocket` | `/ws` | Dashboard heartbeat. |

## 🛠️ Development

```bash
# Backend — run directly (the frontend must already be built into web/dist)
go run .

# Frontend — dev server with /api proxied to :8080
cd web && pnpm install && pnpm dev

# Electron shell around a locally running backend
cd electron && npm install && npm start
```

> Build the root package — `go build .` — rather than `go build ./...`. The
> `linux/` directory is a legacy duplicate of the root files; its `main.go` is
> behind `//go:build ignore` and the rest has no `main`, so a recursive build
> stops with `function main is undeclared`. Linux builds come from the root
> package: `GOOS=linux go build .`.

**Debugging**

- Backend: set `SORARINBOT_DEBUG=1` for verbose logs.
- Electron main process: `console.log` lands in the terminal that started it.
- Renderer: call `mainWindow.webContents.openDevTools()` in `electron/main.js`.

**Tests** — CI runs `go vet ./...`, `go test ./...` and `gofmt -l .` on every push; the race detector is worth running locally too.

```bash
go vet ./...
go test ./... -race
gofmt -l .
```

## 🤝 Contributing

Issues, ideas and pull requests are all welcome. For anything larger than a bug fix, please open an issue first so we can agree on the approach — and read [CONTRIBUTING.md](CONTRIBUTING.md) before you send a patch.

Release-by-release notes live in [CHANGELOG.md](CHANGELOG.md).

## ☕ Support

If SorarinBot is useful to you, a coffee is appreciated — it goes straight into API credits.

<p align="center">
  <a href="https://afdian.com/a/sorarinbot"><img alt="爱发电" src="https://img.shields.io/badge/%E7%88%B1%E5%8F%91%E7%94%B5-SorarinBot-946CE6?style=flat-square"></a>
  <br><br>
  <img src=".github/images/donate.jpg" width="200" alt="WeChat Pay">
  <br>
  <sub>WeChat Pay · 微信支付</sub>
</p>

## 🙏 Acknowledgements

- [openwechat](https://github.com/eatmoreapple/openwechat) — the WeChat Web protocol this project builds on. A fork of it lives in `internal/openwechat/` under the Apache License 2.0; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) for exactly how it differs.
- [Nuxt UI](https://ui.nuxt.com) — component library behind the dashboard.
- [electron-builder](https://www.electron.build) — desktop packaging.
- And everyone who filed an issue or sent a pull request.

## 📄 License

SorarinBot is released under the [PolyForm Noncommercial License 1.0.0](LICENSE) — free to use for personal, educational, research, charity and government purposes.

**Commercial use requires a separate license.** Write to **zyc2597376118@gmail.com** to arrange one.

Third-party components keep their own licenses. `internal/openwechat/` in particular stays under the Apache License 2.0 and ships with its license text at [`internal/openwechat/LICENSE`](internal/openwechat/LICENSE); the full inventory is in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

> This project is not affiliated with, endorsed by or connected to Tencent. "WeChat" and "微信" are trademarks of Tencent Holdings Ltd.
