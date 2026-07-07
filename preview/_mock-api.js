// ============================================================
// SorarinBot GitHub Pages Preview — Mock API Interceptor
// This file intercepts fetch() calls to /api/* and returns
// simulated data so the real Nuxt SPA runs without a backend.
// ============================================================
(function() {
  'use strict';

  const NOW = new Date().toISOString();
  const HOUR_AGO = new Date(Date.now() - 3600000).toISOString();

  // --- Mock Data ---
  const MOCK_STATUS = {
    status: 'running',
    sessions: ['小明', 'Alice', '张伟', 'Bob', '李华'],
    provider: 'deepseek',
    model: 'deepseek-chat',
    startup_at: HOUR_AGO,
    api_key_configured: true
  };

  const MOCK_SESSIONS = ['小明', 'Alice', '张伟', 'Bob', '李华'];

  const MOCK_HISTORY = {
    rows: [
      { id: 105, sender: '张伟', room: '', user_message: '帮我写一首关于春天的五言绝句', bot_reply: '春风拂柳岸，\n细雨润花田。\n燕子归来早，\n人间四月天。\n\n这首诗描绘了春天的典型意象：春风、细雨、燕子，最后一句化用林徽因名句，点出四月春光之美。', model: 'deepseek-chat', prompt_tokens: 856, completion_tokens: 124, total_tokens: 980, created_at: '2026-07-07 22:19:55' },
      { id: 104, sender: 'Bob', room: '', user_message: 'Go 1.25 有什么新特性？', bot_reply: 'Go 1.25 的主要新特性包括：\n\n1. **泛型改进** — 更灵活的类型约束\n2. **标准库增强** — 新增 iter 包支持迭代器\n3. **工具链优化** — go build 性能提升约 15%\n4. **WASM 支持** — 改进 WebAssembly 编译目标\n\n详细信息可以查看 Go 官方博客。', model: 'deepseek-chat', prompt_tokens: 1200, completion_tokens: 280, total_tokens: 1480, created_at: '2026-07-07 22:20:03' },
      { id: 103, sender: 'Alice', room: '', user_message: '[图片] 这是什么品种的猫？', bot_reply: '这是一只英国短毛猫（British Shorthair），特征是：\n\n🐱 圆润的脸庞和大眼睛\n🔵 蓝灰色的毛发（最经典的颜色）\n🐾 短而密的被毛\n\n英短性格温顺、安静，是非常受欢迎的家养猫品种。', model: 'deepseek-chat', prompt_tokens: 2048, completion_tokens: 195, total_tokens: 2243, created_at: '2026-07-07 22:16:48' },
      { id: 102, sender: '小明', room: '', user_message: '你好，你能做什么？', bot_reply: '你好！我是 SorarinBot，一个 AI 助手。我可以帮你：\n\n💬 回答各种问题\n🖼️ 识别图片内容\n📝 翻译和写作\n💡 提供建议和想法\n\n有什么需要帮忙的吗？', model: 'deepseek-chat', prompt_tokens: 512, completion_tokens: 168, total_tokens: 680, created_at: '2026-07-07 22:15:06' },
      { id: 101, sender: 'Alice', room: '', user_message: '你好小绒！', bot_reply: '你好 Alice！😊 今天有什么可以帮你的吗？', model: 'deepseek-chat', prompt_tokens: 320, completion_tokens: 42, total_tokens: 362, created_at: '2026-07-07 22:14:30' },
    ],
    total: 105
  };

  const MOCK_LOGS = [
    'info | [text] reply to 张伟: 春风拂柳岸，细雨润花田... | 2026-07-07 22:19:55',
    'info | [text] reply to Bob: Go 1.25 的主要新特性包括... | 2026-07-07 22:20:03',
    'info | [tickle] detected in group=AI测试群, replying | 2026-07-07 22:18:11',
    'warn | [text] slow response: 3.2s (provider latency) | 2026-07-07 22:17:30',
    'info | [text] reply to Alice: 这张图片显示的是一只英国短毛猫... | 2026-07-07 22:16:48',
    'debug | [check] group @mention, reply | 2026-07-07 22:16:45',
    'info | [image] cached for Alice, no @, no reply | 2026-07-07 22:16:22',
    'info | [text] reply to 小明: 你好！有什么我可以帮你的吗... | 2026-07-07 22:15:06',
    'debug | [check] private chat from 小明, reply | 2026-07-07 22:15:03',
    'info | web UI at http://localhost:8080 | 2026-07-07 22:14:16',
    'info | provider: deepseek, model=deepseek-chat, vision=true | 2026-07-07 22:14:15',
    'debug | [ws] browser connected, total: 1 | 2026-07-07 22:13:42',
    'info | [login] WeChat login successful | 2026-07-07 22:13:41',
    'info | [scan] QR code displayed, scan with WeChat | 2026-07-07 22:12:05',
    'info | config loaded from config.yaml | 2026-07-07 22:12:00',
  ];

  const MOCK_CONFIG = {
    provider: { name: 'deepseek', base_url: 'https://api.deepseek.com', model: 'deepseek-chat', api_key: 'sk-••••••••' },
    prompt: '你是一个有用的 AI 助手，名叫小绒。你的性格活泼可爱，喜欢用表情符号。回答问题时要简洁明了，必要时使用 Markdown 格式化内容。',
    chat: { context_enabled: true, max_context: 3, image_ttl: 300 },
    wechat: { strict_login: false, token_file: './token.json', auto_login: true, trigger_prefix: '' },
    web: { listen: 'localhost:8080' },
    database: { path: './data.db' }
  };

  const MOCK_MODELS = { ok: true, models: ['deepseek-chat', 'deepseek-reasoner', 'gpt-4o', 'gpt-4o-mini', 'claude-sonnet-4-20250514', 'MiniMax-M3'] };

  // --- Router ---
  function mockResponse(url, method) {
    if (url === '/api/status') return MOCK_STATUS;
    if (url === '/api/sessions') return MOCK_SESSIONS;
    if (url.startsWith('/api/history')) return MOCK_HISTORY;
    if (url.startsWith('/api/logs')) return MOCK_LOGS;
    if (url === '/api/config' && method === 'GET') return MOCK_CONFIG;
    if (url === '/api/models') return MOCK_MODELS;
    if (url === '/api/test') return { ok: true, latency_ms: 245, model: 'deepseek-chat' };
    return null;
  }

  // --- Interceptor ---
  const origFetch = window.fetch;
  window.fetch = function(input, init) {
    const url = typeof input === 'string' ? input : input.url;
    const method = (init?.method || 'GET').toUpperCase();

    // Match both /api/* and /SorarinBot/api/* (baseURL may inject prefix)
    const apiPrefixes = ['/api/', '/SorarinBot/api/'];
    const isApi = apiPrefixes.some(p => url.startsWith(p));
    const isHeartbeat = url === '/_heartbeat.js' || url === '/SorarinBot/_heartbeat.js';

    if (isApi || isHeartbeat) {
      // Normalize: strip /SorarinBot prefix for routing
      const normalized = url.replace(/^\/SorarinBot/, '');
      const mock = mockResponse(normalized, method);
      if (mock !== null) {
        return Promise.resolve(new Response(JSON.stringify(mock), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        }));
      }
    }
    return origFetch.apply(this, arguments);
  };

  console.log('[SorarinBot Preview] Mock API layer active — all data is simulated');
})();
