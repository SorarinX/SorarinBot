# SorarinBot Linux 安装教程

> 面向 Linux 初学者的完整安装指南

---

## 目录

1. [系统要求](#1-系统要求)
2. [下载安装](#2-下载安装)
3. [首次配置](#3-首次配置)
4. [启动运行](#4-启动运行)
5. [常见问题](#5-常见问题)
6. [进阶：从源码构建](#6-进阶从源码构建)

---

## 1. 系统要求

| 项目 | 要求 |
|------|------|
| 系统 | Ubuntu 20.04+ / Debian 11+ / Fedora 36+ / Arch Linux |
| 架构 | x86_64 (amd64) |
| 内存 | 512MB 以上 |
| 磁盘 | 200MB 可用空间 |
| 网络 | 需要访问微信和 LLM API |

---

## 2. 下载安装

### 步骤 1：下载 AppImage

打开终端（按 `Ctrl+Alt+T`），执行：

```bash
# 创建安装目录
mkdir -p ~/SorarinBot

# 下载 AppImage（替换为实际下载链接）
# 方式一：浏览器下载
# 打开 https://github.com/SorarinX/SorarinBot/releases
# 下载 SorarinBot-2.1.0.AppImage 到 ~/SorarinBot/

# 方式二：终端下载（需要安装 curl）
curl -L -o ~/SorarinBot/SorarinBot.AppImage "https://github.com/SorarinX/SorarinBot/releases/download/v2.1.0/SorarinBot-2.1.0.AppImage"
```

### 步骤 2：赋予执行权限

```bash
chmod +x ~/SorarinBot/SorarinBot.AppImage
```

> **什么是 chmod +x？**
> Linux 中文件默认没有执行权限。`+x` 表示"允许这个文件作为程序运行"。
> 相当于 Windows 中"以管理员身份运行"的权限设置。

### 步骤 3：安装 FUSE（如果提示缺少）

AppImage 需要 FUSE 才能运行。如果启动时报错 `fusermount: permission denied` 或 `AppImages require FUSE`：

```bash
# Ubuntu / Debian
sudo apt update && sudo apt install -y fuse libfuse2

# Fedora
sudo dnf install -y fuse fuse-libs

# Arch Linux
sudo pacman -S fuse2
```

> **什么是 sudo？**
> `sudo` 表示"以管理员权限执行"。会要求输入你的登录密码（输入时不会显示任何字符，这是正常的）。

---

## 3. 首次配置

### 步骤 1：创建配置文件

```bash
cat > ~/SorarinBot/config.yaml << 'EOF'
admin:
    password_hash: ""
wechat:
    strict_login: false
    token_file: ./token.json
    auto_login: true
    trigger_prefix: ""
web:
    listen: localhost:8080
chat:
    context_enabled: true
    max_context: 3
    image_ttl: 300
plugins:
    enabled: false
database:
    path: ./data.db
provider:
    name: deepseek
    base_url: https://api.deepseek.com
    model: deepseek-chat
    api_key: YOUR_API_KEY_HERE
prompt: "你是一个有用的 AI 助手。"
EOF
```

### 步骤 2：填入你的 API Key

用任意文本编辑器打开配置文件：

```bash
# 方式一：用系统默认编辑器
xdg-open ~/SorarinBot/config.yaml

# 方式二：用 nano（终端内编辑，按 Ctrl+X 保存退出）
nano ~/SorarinBot/config.yaml

# 方式三：用 gedit（图形界面）
gedit ~/SorarinBot/config.yaml
```

找到 `api_key: YOUR_API_KEY_HERE`，替换为你的真实 API Key。

**如何获取 API Key：**

| 平台 | 获取地址 |
|------|---------|
| DeepSeek | https://platform.deepseek.com/api_keys |
| MiniMax | https://platform.minimaxi.com/api_key |
| OpenAI | https://platform.openai.com/api-keys |

### 步骤 3：配置文件说明

```yaml
provider:
  name: deepseek              # 选择你的 AI 提供商
  base_url: https://api.deepseek.com  # API 地址
  model: deepseek-chat        # 使用的模型
  api_key: sk-xxxxxxxx        # 你的 API Key

prompt: "你是一个有用的 AI 助手。"  # AI 的角色设定

chat:
  context_enabled: true       # 是否记住对话上下文
  max_context: 3              # 记住最近几轮对话
```

---

## 4. 启动运行

### 步骤 1：启动 SorarinBot

```bash
cd ~/SorarinBot
./SorarinBot.AppImage
```

启动后你会看到：

```
███████╗ ██████╗ ██████╗  █████╗ ██████╗ ██╗███╗   ██╗
...
              ✦ SorarinBot AI Assistant ✦

provider: deepseek, model=deepseek-chat, vision=true
web UI at http://localhost:8080

█████████████████████████
████ ▄▄▄▄▄ █ ...  ████   ← 二维码
█████████████████████████

[scan] QR code displayed, scan with WeChat
```

### 步骤 2：扫码登录

用手机微信扫描终端中的二维码完成登录。

### 步骤 3：打开管理后台

在浏览器中访问：**http://localhost:8080**

你将看到 SorarinBot 管理后台，可以：
- 查看实时会话
- 浏览聊天记录
- 查看系统日志
- 修改配置（API Key、模型、提示词）

### 步骤 4：开始使用

在微信中给机器人发消息，它会自动回复！

**私聊：** 直接发消息即可

**群聊：** 需要 @机器人 或配置触发前缀

---

## 5. 常见问题

### Q1：启动报错 `address already in use`

```
listen tcp 127.0.0.1:8080: bind: address already in use
```

**原因：** 8080 端口被其他程序占用。

**解决：**

```bash
# 查看谁占用了 8080 端口
lsof -i :8080

# 如果是之前运行的 SorarinBot，杀掉它
kill $(lsof -t -i :8080)

# 或者修改配置文件使用其他端口
# 将 web.listen 改为 localhost:8081
```

### Q2：启动报错 `permission denied`

```
fork/exec ./SorarinBot.AppImage: permission denied
```

**解决：**

```bash
chmod +x ~/SorarinBot/SorarinBot.AppImage
```

### Q3：启动报错 `AppImages require FUSE`

```
AppImages require FUSE to run
```

**解决：**

```bash
sudo apt update && sudo apt install -y fuse libfuse2
```

### Q4：微信扫码后提示登录失败

**可能原因：**
- 微信 Web 协议已过期，需要重新扫码
- 网络不稳定

**解决：**
- 删除 `token.json` 文件后重新启动
- 检查网络连接

### Q5：AI 不回复消息

**检查清单：**
1. API Key 是否正确填写？
2. API Key 是否有余额？
3. 网络是否能访问 API 地址？

```bash
# 测试网络连通性
curl -s https://api.deepseek.com/v1/models -H "Authorization: Bearer YOUR_API_KEY"
```

### Q6：如何后台运行？

```bash
# 使用 nohup 后台运行
nohup ~/SorarinBot/SorarinBot.AppImage > ~/SorarinBot/sorarinbot.log 2>&1 &

# 查看日志
tail -f ~/SorarinBot/sorarinbot.log

# 停止运行
pkill -f SorarinBot
```

### Q7：如何开机自启动？

```bash
# 创建 systemd 服务文件
cat > ~/.config/systemd/user/sorarinbot.service << 'EOF'
[Unit]
Description=SorarinBot WeChat AI Assistant
After=network.target

[Service]
Type=simple
WorkingDirectory=%h/SorarinBot
ExecStart=%h/SorarinBot/SorarinBot.AppImage
Restart=on-failure
RestartSec=5

[Install]
WantedBy=default.target
EOF

# 启用并启动服务
systemctl --user daemon-reload
systemctl --user enable sorarinbot
systemctl --user start sorarinbot

# 查看状态
systemctl --user status sorarinbot
```

---

## 6. 进阶：从源码构建

如果你想自己编译而不是使用预编译的 AppImage：

### 前置条件

```bash
# 安装 Go
sudo apt update
sudo apt install -y golang-go

# 安装 Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 安装 pnpm
npm install -g pnpm
```

### 构建步骤

```bash
# 克隆项目
git clone https://github.com/SorarinX/SorarinBot.git
cd SorarinBot/linux/src

# 编译 Go 后端
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o SorarinBot .

# 复制到 electron 目录
cp SorarinBot electron/SorarinBot

# 构建 Electron AppImage
cd electron
cp package-linux.json package.json
npm install
npx electron-builder --linux

# 或者使用一键脚本
cd ../..
bash scripts/build.sh
```

输出文件：`electron/release/SorarinBot-2.1.0.AppImage`

---

## 目录结构

安装后 `~/SorarinBot/` 目录结构：

```
~/SorarinBot/
├── SorarinBot.AppImage    # 主程序（不要删除）
├── config.yaml            # 配置文件（包含 API Key，不要分享）
├── data.db                # 聊天记录数据库（自动生成）
├── token.json             # 微信登录态（自动生成，不要分享）
└── sorarinbot.log         # 运行日志（如果使用 nohup 后台运行）
```

> ⚠️ **安全提示：** `config.yaml` 包含你的 API Key，`token.json` 包含微信登录凭证。**不要分享这些文件给任何人。**

---

## 获取帮助

- 📖 [GitHub Issues](https://github.com/SorarinX/SorarinBot/issues) — 提交 Bug 或功能请求
- 📖 [README](https://github.com/SorarinX/SorarinBot) — 项目文档
- 📖 [Releases](https://github.com/SorarinX/SorarinBot/releases) — 下载最新版本
