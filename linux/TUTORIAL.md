<div align="center">

# SorarinBot — Linux Installation Guide

**SorarinBot — Linux 安装教程**

[![Version](https://img.shields.io/badge/version-2.1.0-3B82F6?style=flat-square)](https://github.com/SorarinX/SorarinBot/releases)
[![Platform](https://img.shields.io/badge/platform-Linux-FCC624?style=flat-square&logo=linux&logoColor=black)]()

</div>

---

<a id="english"></a>

## System Requirements

| Item | Requirement |
|------|-------------|
| OS | Ubuntu 20.04+, Debian 11+, Fedora 36+, Arch Linux |
| Architecture | x86_64 (amd64) |
| Memory | 512 MB+ |
| Disk | 50 MB free |
| Network | Access to WeChat and LLM API |

## Quick Start

### Step 1 — Download & Extract

```bash
mkdir -p ~/SorarinBot && cd ~/SorarinBot
curl -L -o sorarinbot.tar.gz \
  https://github.com/SorarinX/SorarinBot/releases/download/v2.1.0/sorarinbot-v2.1.0-linux-amd64.tar.gz
tar -xzf sorarinbot.tar.gz --strip-components=1
rm sorarinbot.tar.gz
```

### Step 2 — Configure

```bash
nano config.yaml
```

Edit the `provider` section:

```yaml
provider:
  name: deepseek
  base_url: https://api.deepseek.com
  model: deepseek-chat
  api_key: YOUR_API_KEY_HERE

prompt: "You are a helpful AI assistant."
```

Save: `Ctrl+O` → `Enter` → `Ctrl+X`

### Step 3 — Run

```bash
chmod +x SorarinBot
./SorarinBot
```

You will see the startup banner and a QR code. Scan it with WeChat to log in.

Open **http://localhost:8080** in your browser to access the dashboard.

## Supported Providers

| Provider | base_url | model |
|----------|----------|-------|
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` |
| MiniMax | `https://api.minimaxi.com/v1` | `MiniMax-M3` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o` |
| Any OpenAI-compatible | Custom URL | Custom model |

## Run in Background

```bash
# Start in background
nohup ./SorarinBot > sorarinbot.log 2>&1 &

# View logs
tail -f sorarinbot.log

# Stop
pkill -f SorarinBot
```

## Auto-start on Boot (systemd)

```bash
mkdir -p ~/.config/systemd/user

cat > ~/.config/systemd/user/sorarinbot.service << 'EOF'
[Unit]
Description=SorarinBot WeChat AI Assistant
After=network.target

[Service]
Type=simple
WorkingDirectory=%h/SorarinBot
ExecStart=%h/SorarinBot/SorarinBot
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable sorarinbot
systemctl --user start sorarinbot

# Check status
systemctl --user status sorarinbot
```

## Build from Source

```bash
# Prerequisites
sudo apt install -y golang-go

# Clone and build
git clone https://github.com/SorarinX/SorarinBot.git
cd SorarinBot/linux/src
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o SorarinBot .

# Run
cp SorarinBot ~/SorarinBot/
cd ~/SorarinBot && ./SorarinBot
```

## Troubleshooting

| Problem | Cause | Solution |
|---------|-------|----------|
| `address already in use` | Port 8080 occupied | `kill $(lsof -t -i :8080)` or change port in config |
| `permission denied` | Binary not executable | `chmod +x SorarinBot` |
| QR code not scanning | WeChat Web protocol expired | Delete `token.json` and restart |
| AI not replying | Invalid API key or no balance | Check API key in config.yaml |
| `No such file` | Wrong directory | `cd ~/SorarinBot` before running |

## File Structure

```
~/SorarinBot/
├── SorarinBot          # Main binary (keep this)
├── config.yaml         # Configuration (contains API key — do not share)
├── data.db             # Chat database (auto-created)
├── token.json          # WeChat login token (auto-created — do not share)
└── sorarinbot.log      # Runtime log (if using nohup)
```

> ⚠️ **Security:** `config.yaml` contains your API key and `token.json` contains your WeChat login credential. **Never share these files.**

## Help

- [GitHub Issues](https://github.com/SorarinX/SorarinBot/issues) — Report bugs or request features
- [README](https://github.com/SorarinX/SorarinBot) — Project documentation
- [Releases](https://github.com/SorarinX/SorarinBot/releases) — Download latest version

---

<a id="中文"></a>

## 系统要求

| 项目 | 要求 |
|------|------|
| 系统 | Ubuntu 20.04+ / Debian 11+ / Fedora 36+ / Arch Linux |
| 架构 | x86_64 (amd64) |
| 内存 | 512MB 以上 |
| 磁盘 | 50MB 可用空间 |
| 网络 | 需要访问微信和 LLM API |

## 快速开始

### 第一步 — 下载解压

```bash
mkdir -p ~/SorarinBot && cd ~/SorarinBot
curl -L -o sorarinbot.tar.gz \
  https://github.com/SorarinX/SorarinBot/releases/download/v2.1.0/sorarinbot-v2.1.0-linux-amd64.tar.gz
tar -xzf sorarinbot.tar.gz --strip-components=1
rm sorarinbot.tar.gz
```

### 第二步 — 配置

```bash
nano config.yaml
```

编辑 `provider` 部分：

```yaml
provider:
  name: deepseek
  base_url: https://api.deepseek.com
  model: deepseek-chat
  api_key: YOUR_API_KEY_HERE

prompt: "You are a helpful AI 助手。"
```

保存：`Ctrl+O` → `Enter` → `Ctrl+X`

### 第三步 — 启动

```bash
chmod +x SorarinBot
./SorarinBot
```

启动后会看到启动横幅和二维码，用微信扫码登录。

在浏览器打开 **http://localhost:8080** 访问管理后台。

## 支持的 AI 提供商

| 提供商 | base_url | model |
|--------|----------|-------|
| DeepSeek | `https://api.deepseek.com` | `deepseek-chat` |
| MiniMax | `https://api.minimaxi.com/v1` | `MiniMax-M3` |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o` |
| 任意 OpenAI 兼容 | 自定义 URL | 自定义模型 |

## 后台运行

```bash
# 后台启动
nohup ./SorarinBot > sorarinbot.log 2>&1 &

# 查看日志
tail -f sorarinbot.log

# 停止运行
pkill -f SorarinBot
```

## 开机自启动（systemd）

```bash
mkdir -p ~/.config/systemd/user

cat > ~/.config/systemd/user/sorarinbot.service << 'EOF'
[Unit]
Description=SorarinBot 微信 AI 助手
After=network.target

[Service]
Type=simple
WorkingDirectory=%h/SorarinBot
ExecStart=%h/SorarinBot/SorarinBot
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF

systemctl --user daemon-reload
systemctl --user enable sorarinbot
systemctl --user start sorarinbot

# 查看状态
systemctl --user status sorarinbot
```

## 从源码构建

```bash
# 前置条件
sudo apt install -y golang-go

# 克隆并构建
git clone https://github.com/SorarinX/SorarinBot.git
cd SorarinBot/linux/src
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o SorarinBot .

# 运行
cp SorarinBot ~/SorarinBot/
cd ~/SorarinBot && ./SorarinBot
```

## 常见问题

| 问题 | 原因 | 解决方案 |
|------|------|---------|
| `address already in use` | 8080 端口被占用 | `kill $(lsof -t -i :8080)` 或修改配置中的端口 |
| `permission denied` | 二进制无执行权限 | `chmod +x SorarinBot` |
| 二维码扫不了 | 微信 Web 协议过期 | 删除 `token.json` 后重启 |
| AI 不回复 | API Key 无效或余额不足 | 检查 config.yaml 中的 API Key |
| `No such file` | 目录不对 | 先 `cd ~/SorarinBot` 再运行 |

## 文件结构

```
~/SorarinBot/
├── SorarinBot          # 主程序（不要删除）
├── config.yaml         # 配置文件（含 API Key，不要分享）
├── data.db             # 聊天记录数据库（自动生成）
├── token.json          # 微信登录态（自动生成，不要分享）
└── sorarinbot.log      # 运行日志（后台运行时生成）
```

> ⚠️ **安全提示：** `config.yaml` 包含你的 API Key，`token.json` 包含微信登录凭证。**不要把这些文件分享给任何人。**

## 获取帮助

- [GitHub Issues](https://github.com/SorarinX/SorarinBot/issues) — 提交 Bug 或功能请求
- [README](https://github.com/SorarinX/SorarinBot) — 项目文档
- [Releases](https://github.com/SorarinX/SorarinBot/releases) — 下载最新版本
