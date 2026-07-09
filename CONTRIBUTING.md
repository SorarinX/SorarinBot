# Contributing to SorarinBot / 贡献指南

Thank you for your interest in contributing! / 感谢你对 SorarinBot 的关注！

## Getting Started / 快速开始

1. Fork the repository / Fork 仓库
2. Clone your fork / 克隆你的 Fork：
   ```bash
   git clone https://github.com/YOUR_USERNAME/SorarinBot.git
   cd SorarinBot
   ```
3. Create a branch / 创建分支：
   ```bash
   git checkout -b feat/your-feature
   ```
4. Make your changes / 进行修改
5. Run tests / 运行测试：
   ```bash
   go test ./...
   ```
6. Push and create a Pull Request / 推送并创建 PR

## Development Setup / 开发环境

### Prerequisites / 前置条件

- Go 1.25+
- Node.js 20+
- pnpm

### Backend / 后端

```bash
go mod tidy
go run .
```

### Frontend / 前端

```bash
cd web && pnpm install && pnpm dev
```

### Electron / 桌面客户端

```bash
cd electron && npm install && npm start
```

## Commit Convention / 提交规范

We use [Conventional Commits](https://www.conventionalcommits.org/). / 使用约定式提交规范。

| Prefix | Meaning / 含义 |
|--------|---------------|
| `feat:` | New feature / 新功能 |
| `fix:` | Bug fix / 修复 |
| `docs:` | Documentation / 文档 |
| `chore:` | Maintenance / 维护 |
| `refactor:` | Code restructuring / 重构 |
| `perf:` | Performance improvement / 性能优化 |
| `test:` | Add or update tests / 测试 |
| `style:` | Code formatting / 格式化 |

Examples / 示例：
```
feat: add voice message support
fix(web): correct history pagination offset
docs: update API reference table
chore(deps): update go dependencies
test: add session module unit tests
style: format all Go files with gofmt
```

## Pull Request Guidelines / PR 规范

- Keep PRs focused — one feature or fix per PR / 一个 PR 只做一件事
- Write a clear description / 写清楚改了什么、为什么改
- Reference related issues / 关联 Issue：`Fixes #123`
- Ensure tests pass / 确保测试通过：`go test ./...`
- Ensure code is formatted / 确保格式正确：`gofmt -w .`
- CI must pass (test + lint + build) / CI 必须全部通过

## Testing / 测试

```bash
# Run all tests / 运行全部测试
go test ./...

# Run with verbose output / 详细输出
go test ./... -v

# Run specific package / 指定模块
go test ./core/session/...
```

Test files are located next to the source code they test. / 测试文件与被测源码放在同一目录。

```
core/session/session.go      → core/session/session_test.go
core/message/handler.go      → core/message/handler_test.go
core/config/config.go        → core/config/config_test.go
```

## Project Structure / 项目结构

```
main.go                          → Go backend entry point
heartbeat.go                     → Browser heartbeat (WebSocket)
platform_windows.go              → Windows console management
platform_linux.go                → Linux stub (no-ops)
systray.go                       → System tray (cross-platform)
autostart.go                     → Windows auto-start (registry)
autostart_linux.go               → Linux auto-start stub
core/config/                     → Configuration (YAML load/save)
core/message/                    → Message handling (LLM call, image cache)
core/session/                    → Session management (context window)
providers/                       → LLM provider interfaces
providers/openaicompat/          → OpenAI-compatible API client
adapters/openwechat/             → WeChat message adapter
database/                        → SQLite storage layer
internal/openwechat/             → WeChat protocol (fork)
web/                             → Nuxt 4 frontend (SPA)
web/dist/                        → Built frontend (go:embed)
electron/                        → Electron desktop shell (Windows)
linux/                           → Linux port reference
.github/workflows/ci.yml         → CI pipeline (test + lint + build)
```

## Reporting Issues / 报告问题

- Use GitHub Issues / 使用 GitHub Issues
- Include steps to reproduce / 包含复现步骤
- Include Go version, OS, and relevant logs / 包含 Go 版本、操作系统和相关日志
- For security issues, see [SECURITY.md](SECURITY.md) / 安全问题请查看安全策略

## License / 许可证

By contributing, you agree that your contributions will be licensed under the [PolyForm Noncommercial License 1.0.0](LICENSE). / 贡献代码即表示你同意在 PolyForm Noncommercial License 1.0.0 下授权。

Commercial use requires a separate license. / 商业使用需取得单独授权。
