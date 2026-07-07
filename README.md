# SorarinBot

微信 AI 助手，支持多模型、Web 管理后台、Electron 桌面应用。

## 功能

- 微信私聊/群聊 AI 回复
- 多模型支持（OpenAI Compatible 接口）
- Web 管理后台（Nuxt 4 + Nuxt UI）
- Electron 桌面应用
- 会话上下文管理
- SQLite 数据持久化
- 暗色模式 + 主题定制
- 拍一拍互动回复

## 快速开始

### Web 版

```bash
./SorarinBot.exe
```

浏览器打开 `http://localhost:8080`

### Electron 桌面版

```bash
cd electron
build.bat
```

或开发模式：

```bash
cd electron
npm install
npx electron .
```

## 配置

编辑 `config.yaml`：

```yaml
provider:
    name: openaicompat
    base_url: "https://api.example.com/v1"
    model: "your-model"
    api_key: "your-api-key"
prompt: "You are a helpful AI assistant."
```

## 项目结构

```
SorarinBot/
├── main.go                    # 入口
├── config.yaml                # 配置
├── core/                      # 核心逻辑
├── adapters/                  # 微信适配器
├── providers/                 # LLM 接口
├── database/                  # SQLite
├── web/                       # Nuxt 前端
├── electron/                  # Electron 桌面应用
│   ├── main.js                # Electron 主进程
│   ├── build.bat              # 自动打包脚本
│   └── package.json
└── docs/                      # 项目文档
```

## API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/status` | GET | 系统状态 |
| `/api/config` | GET/PUT | 配置读写 |
| `/api/history` | GET | 消息历史 |
| `/api/logs` | GET/DELETE | 日志查询/清空 |
| `/api/sessions` | GET | 活跃会话 |
| `/api/test` | POST | 测试连接 |
| `/api/models` | GET | 模型列表 |

## 许可证

MIT License
