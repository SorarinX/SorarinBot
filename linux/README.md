# SorarinBot Linux Port

SorarinBot 的 Linux 桌面版本。基于 v2.1.0 源码移植，使用 Electron + AppImage 分发。

## 与 Windows 版的差异

| 项目 | Windows | Linux |
|------|---------|-------|
| 平台文件 | `platform_windows.go` | `platform_linux.go`（空操作） |
| 浏览器打开 | `cmd /c start` | `xdg-open` |
| 数据目录 | `%APPDATA%\SorarinBot` | `~/.local/share/SorarinBot` |
| Electron 启动 | `cmd.exe /c start SorarinBot.exe` | `spawn(./SorarinBot)` |
| 打包格式 | NSIS 安装包 | AppImage（免安装） |
| 二进制后缀 | `.exe` | 无后缀 |

## 新增文件

```
linux/
├── platform_linux.go                  # 控制台管理空操作
├── adapters/openwechat/
│   └── platform_linux.go              # xdg-open 浏览器
├── main.go                            # 含 defaultDataDir() 跨平台逻辑
├── electron/
│   ├── main-linux.js                  # Linux Electron 主进程
│   └── package-linux.json             # AppImage 构建配置
└── scripts/
    └── build.sh                       # 一键构建脚本
```

## 构建方法

### 前置条件

- Go 1.25+
- Node.js 20+
- npm

### 步骤

```bash
# 1. 交叉编译 Go 二进制
cd SorarinBot-Newest/linux/src
GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o SorarinBot .

# 2. 复制到 electron 目录
cp SorarinBot electron/SorarinBot

# 3. 切换到 Linux 配置
cd electron
cp package.json package.json.bak
cp package-linux.json package.json

# 4. 安装依赖并打包
npm install
npx electron-builder --linux

# 5. 恢复原始配置
mv package.json.bak package.json
```

输出：`electron/release/SorarinBot-2.1.0.AppImage`

### 或使用一键脚本

```bash
cd SorarinBot-Newest/linux/src
bash scripts/build.sh
```

## 测试状态

| 测试项 | 结果 |
|--------|------|
| Go 交叉编译 (linux/amd64) | ✅ 通过 |
| WSL 运行测试 | ✅ 通过 |
| Banner/QR 码显示 | ✅ 正常 |
| Web 服务器启动 | ✅ localhost:8080 |
| 信号处理 | ✅ 优雅关闭 |
