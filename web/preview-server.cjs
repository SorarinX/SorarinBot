const http = require('http')
const fs = require('fs')
const path = require('path')

const PORT = 3456
const DIST = path.join(__dirname, 'dist')

// Mock API data
const mockData = {
  '/api/status': {
    status: 'running',
    provider: 'openaicompat',
    model: 'mimo-v2.5-pro',
    startup_at: '2026-07-06T12:00:00+08:00',
    api_key_configured: true,
    sessions: ['张三', '李四', '王五', '赵六']
  },
  '/api/config': {
    provider: { name: 'openaicompat', base_url: 'https://api.example.com/v1', model: 'mimo-v2.5-pro', api_key: 'sk-••••••••' },
    prompt: 'You are a helpful AI assistant.',
    chat: { context_enabled: true, max_context: 3, image_ttl: 300 },
    wechat: { strict_login: false, token_file: './token.json', auto_login: true, trigger_prefix: '' },
    web: { listen: 'localhost:8080' },
    database: { path: './data.db' }
  },
  '/api/history': {
    rows: [
      { id: 1, sender: '张三', user_message: '你好', bot_reply: '你好！有什么我可以帮你的吗？', model: 'mimo-v2.5-pro', total_tokens: 156, created_at: '2026-07-06 12:01:30' },
      { id: 2, sender: '李四', user_message: '帮我写首诗', bot_reply: '春风拂面暖阳斜，桃花枝头笑语哗...', model: 'mimo-v2.5-pro', total_tokens: 342, created_at: '2026-07-06 12:05:15' },
      { id: 3, sender: '王五', user_message: '今天天气怎么样', bot_reply: '抱歉，我无法获取实时天气信息...', model: 'mimo-v2.5-pro', total_tokens: 89, created_at: '2026-07-06 12:10:22' },
      { id: 4, sender: '张三', user_message: '推荐一本书', bot_reply: '我推荐《百年孤独》...', model: 'mimo-v2.5-pro', total_tokens: 234, created_at: '2026-07-06 12:15:45' },
      { id: 5, sender: '李四', user_message: '翻译成英文', bot_reply: 'Spring breeze caresses the face...', model: 'mimo-v2.5-pro', total_tokens: 178, created_at: '2026-07-06 12:20:30' },
      { id: 6, sender: '赵六', user_message: '解释量子计算', bot_reply: '量子计算是一种利用量子力学原理...', model: 'mimo-v2.5-pro', total_tokens: 456, created_at: '2026-07-06 12:25:10' },
      { id: 7, sender: '张三', user_message: '写个Python脚本', bot_reply: '好的，这是一个简单的Python脚本...', model: 'mimo-v2.5-pro', total_tokens: 567, created_at: '2026-07-06 12:30:55' }
    ],
    total: 1287
  },
  '/api/logs': [
    '2026-07-06 12:00:01 INFO provider: openaicompat, model=mimo-v2.5-pro, vision=false',
    '2026-07-06 12:00:02 INFO web UI at http://localhost:8080',
    '2026-07-06 12:00:03 INFO database opened: ./data.db',
    '2026-07-06 12:00:05 INFO [scan] QR code displayed, scan with WeChat',
    '2026-07-06 12:01:28 INFO [login] WeChat login successful',
    '2026-07-06 12:01:30 INFO [text] 张三: 你好',
    '2026-07-06 12:01:32 INFO [text] reply to 张三 (1.2s, 156 tokens)',
    '2026-07-06 12:05:15 INFO [text] 李四: 帮我写首诗',
    '2026-07-06 12:05:18 INFO [text] reply to 李四 (2.8s, 342 tokens)',
    '2026-07-06 12:10:22 INFO [text] 王五: 今天天气怎么样',
    '2026-07-06 12:10:23 INFO [text] reply to 王五 (0.9s, 89 tokens)',
    '2026-07-06 12:15:45 INFO [text] 张三: 推荐一本书',
    '2026-07-06 12:15:47 INFO [text] reply to 张三 (2.1s, 234 tokens)',
    '2026-07-06 12:20:30 INFO [text] 李四: 翻译成英文',
    '2026-07-06 12:20:32 INFO [text] reply to 李四 (1.5s, 178 tokens)',
    '2026-07-06 12:25:10 INFO [text] 赵六: 解释量子计算',
    '2026-07-06 12:25:14 INFO [text] reply to 赵六 (3.6s, 456 tokens)',
    '2026-07-06 12:30:55 INFO [text] 张三: 写个Python脚本',
    '2026-07-06 12:30:59 INFO [text] reply to 张三 (4.2s, 567 tokens)',
    '2026-07-06 12:35:20 INFO [image] cached for 王五, no @, no reply',
    '2026-07-06 12:40:00 INFO session cleanup: 0 expired'
  ],
  '/api/sessions': ['张三', '李四', '王五', '赵六'],
  '/api/models': { ok: true, models: ['mimo-v2.5-pro', 'gpt-4o', 'deepseek-chat', 'claude-sonnet-4-20250514', 'MiniMax-M3'] },
  '/api/test': { ok: true, latency_ms: 214, model: 'mimo-v2.5-pro' }
}

const server = http.createServer((req, res) => {
  const urlPath = req.url.split('?')[0]

  // API routes → mock data
  const apiPath = Object.keys(mockData).find(k => urlPath.startsWith(k))
  if (apiPath) {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(mockData[apiPath]))
    return
  }

  // Static files
  let filePath = path.join(DIST, urlPath === '/' ? 'index.html' : urlPath)
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST, 'index.html') // SPA fallback
  }

  const ext = path.extname(filePath)
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' }
  const contentType = types[ext] || 'application/octet-stream'

  try {
    const content = fs.readFileSync(filePath)
    res.writeHead(200, { 'Content-Type': contentType })
    res.end(content)
  } catch {
    res.writeHead(404)
    res.end('Not found')
  }
})

server.listen(PORT, () => {
  console.log(`Preview server: http://localhost:${PORT}`)
  console.log('Open in browser to see the real Nuxt UI frontend with mock data')
})
