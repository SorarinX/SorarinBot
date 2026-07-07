# Contributing to SorarinBot

Thank you for your interest in contributing! This guide will help you get started.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/SorarinBot.git`
3. Create a branch: `git checkout -b feat/your-feature`
4. Make your changes
5. Push and create a Pull Request

## Development Setup

```bash
# Prerequisites: Go 1.25+, Node.js 20+, pnpm

# Backend
go mod tidy
go run .

# Frontend (in another terminal)
cd web && pnpm install && pnpm dev

# Electron (optional, requires Go backend running)
cd electron && npm install && npm start
```

## Commit Convention

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new feature
fix: resolve a bug
docs: update documentation
chore: maintenance tasks
refactor: code restructuring
perf: performance improvement
test: add or update tests
```

Examples:
```
feat: add voice message support
fix(web): correct history pagination offset
docs: update API reference table
chore(deps): update go dependencies
```

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR
- Write a clear description of what changed and why
- Reference related issues: `Fixes #123`
- Ensure the project builds: `go build -o SorarinBot.exe .`
- Test your changes locally before submitting

## Project Structure

```
main.go              → Go backend entry point
core/                → Business logic (config, message, session)
providers/           → LLM provider interfaces
adapters/            → WeChat adapter
database/            → SQLite storage
internal/openwechat/ → WeChat protocol (fork)
web/                 → Nuxt 4 frontend
electron/            → Electron desktop shell
```

## Reporting Issues

- Use GitHub Issues
- Include steps to reproduce
- Include Go version, OS, and relevant logs
- For security issues, please email directly instead of opening a public issue

## License

By contributing, you agree that your contributions will be licensed under the [MIT License](LICENSE).
