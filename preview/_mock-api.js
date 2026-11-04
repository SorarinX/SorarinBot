(function () {
  "use strict";

  var now = Date.now();
  function iso(minutesAgo) {
    return new Date(now - minutesAgo * 60000).toISOString();
  }

  var sessions = [
    { key: "wxid_linxiaoman", display: "林小满", kind: "private", room: "", pairs: 24 },
    { key: "4521@chatroom", display: "产品设计群", kind: "group", room: "4521@chatroom", pairs: 18 },
    { key: "wxid_azhe", display: "阿哲", kind: "private", room: "", pairs: 9 },
    { key: "3188@chatroom", display: "周末爬山群", kind: "group", room: "3188@chatroom", pairs: 6 },
    { key: "wxid_chenyining", display: "陈以宁", kind: "private", room: "", pairs: 15 },
    { key: "7720@chatroom", display: "前端技术交流", kind: "group", room: "7720@chatroom", pairs: 12 },
    { key: "wxid_zhoumo", display: "周墨", kind: "private", room: "", pairs: 7 },
    { key: "9051@chatroom", display: "AI 产品观察", kind: "group", room: "9051@chatroom", pairs: 21 },
    { key: "wxid_susu", display: "苏苏", kind: "private", room: "", pairs: 4 },
    { key: "6612@chatroom", display: "读书会", kind: "group", room: "6612@chatroom", pairs: 8 },
    { key: "wxid_laowang", display: "老王", kind: "private", room: "", pairs: 3 },
    { key: "4409@chatroom", display: "摄影同好", kind: "group", room: "4409@chatroom", pairs: 5 }
  ];

  var rows = [];
  var nextId = 1;
  function push(minutesAgo, sender, room, user, bot, model, tokens) {
    rows.push({
      id: nextId++,
      sender: sender,
      room: room,
      user_message: user,
      bot_reply: bot,
      model: model,
      total_tokens: tokens,
      created_at: iso(minutesAgo)
    });
  }

  push(2880, "陈以宁", "4521@chatroom", "二维码登录失败时要不要加个重试？", "建议加。失败后展示「重新登录」，并把错误写进日志。", "deepseek-chat", 412);
  push(2870, "林小满", "", "帮我记一下：周五前把登录文案再过一遍。", "记下了，周五上午提醒你。", "deepseek-chat", 286);
  push(1440, "陈以宁", "4521@chatroom", "群公告里的版本号记得改成 v3.0.0。", "改好了，发布说明里的日期也一起更新了。", "deepseek-chat", 286);
  push(1435, "林小满", "", "明天下午的评审还是三点吗？", "对，三点开始，我把会议链接发你。", "deepseek-chat", 367);
  push(60, "陈以宁", "4521@chatroom", "这版首页的间距是不是可以再松一点？", "可以，我把主标题到副标题的间距调到 16，再看一版。", "deepseek-chat", 518);
  push(55, "陈以宁", "4521@chatroom", "顺手把移动端的按钮统一成 44 高。", "已统一，点击区域也补到了 44×44。", "gpt-4o-mini", 203);
  push(10, "林小满", "", "好的，谢谢。", "不客气，随时叫我。", "deepseek-chat", 128);
  push(5, "阿哲", "", "如果模型超时了会怎么样？", "会重试两次，还不行就回一句「稍后再试」，并写日志。", "deepseek-chat", 198);

  var logs = [
    "info | 服务启动完成，正在监听 127.0.0.1:8080 | " + iso(16).slice(0, 19).replace("T", " "),
    "info | 微信登录成功，会话上下文已就绪 | " + iso(15).slice(0, 19).replace("T", " "),
    "info | 已加载 12 个会话上下文 | " + iso(14).slice(0, 19).replace("T", " "),
    "info | 收到群消息：产品设计群 | " + iso(10).slice(0, 19).replace("T", " "),
    "warn | 模型响应较慢（2.8s），已自动重试 | " + iso(8).slice(0, 19).replace("T", " "),
    "info | 图片理解完成，用时 1.2s | " + iso(6).slice(0, 19).replace("T", " "),
    "error | 图片下载超时，已跳过本次图片理解 | " + iso(5).slice(0, 19).replace("T", " "),
    "warn | 微信登录态即将过期，将在 10 分钟后尝试续期 | " + iso(4).slice(0, 19).replace("T", " "),
    "info | 配置热更新：provider · model | " + iso(3).slice(0, 19).replace("T", " "),
    "error | 模型调用失败：context deadline exceeded | " + iso(2).slice(0, 19).replace("T", " "),
    "info | 收到私聊消息：林小满 | " + iso(1).slice(0, 19).replace("T", " "),
    "info | 已写入 1 条聊天记录到 data.db | " + iso(0).slice(0, 19).replace("T", " ")
  ];

  var prompt = "你是 SorarinBot，一位耐心、可靠的中文 AI 助手，服务于 SorarinBot 控制台。请优先理解用户的真实意图，用清晰、自然、礼貌的中文回答；不确定的信息要明确说明，不编造事实，不假装执行无法完成的操作。回答技术问题时先给结论，再给必要的步骤、命令和示例；涉及隐私、安全、账号或高风险操作时，先提醒风险。保持简洁，避免空洞的套话。";

  var config = {
    provider: {
      name: "deepseek",
      base_url: "https://api.deepseek.com",
      model: "deepseek-chat",
      api_key: "sk-****abcd"
    },
    prompt: prompt,
    database: { path: "./data.db" }
  };

  function json(obj, status) {
    return new Response(JSON.stringify(obj), {
      status: status || 200,
      headers: { "Content-Type": "application/json; charset=utf-8" }
    });
  }

  var realFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    var raw = typeof input === "string" ? input : (input && input.url) || "";
    var url;
    try {
      url = new URL(raw, window.location.href);
    } catch (error) {
      return realFetch(input, init);
    }
    if (url.pathname.indexOf("/api/") !== 0) {
      return realFetch(input, init);
    }

    var path = url.pathname;
    var method = ((init && init.method) || (input && input.method) || "GET").toUpperCase();

    if (path === "/api/auth/status") return Promise.resolve(json({ required: false, authenticated: true }));
    if (path === "/api/auth/login") return Promise.resolve(json({ ok: true }));
    if (path === "/api/auth/logout") return Promise.resolve(json({ ok: true }));

    if (path === "/api/login") return Promise.resolve(json({ state: "logged_in", attempts: 0, qr_url: "", last_error: "" }));
    if (path === "/api/login/retry") return Promise.resolve(json({ ok: true, state: "waiting_scan" }, 202));

    if (path === "/api/status") {
      return Promise.resolve(json({
        provider: "deepseek",
        model: "deepseek-chat",
        startup_at: iso(16),
        api_key_configured: true,
        wechat_state: "logged_in",
        sessions: sessions
      }));
    }

    if (path === "/api/history") {
      var limit = Number(url.searchParams.get("limit") || 50);
      var offset = Number(url.searchParams.get("offset") || 0);
      var total = limit === 1 ? 1287 : rows.length;
      return Promise.resolve(json({ rows: rows.slice(offset, offset + limit), total: total }));
    }

    if (path === "/api/logs") {
      if (method === "DELETE") return Promise.resolve(json({ status: "ok" }));
      return Promise.resolve(json(logs));
    }

    if (path === "/api/config") {
      if (method === "PUT") return Promise.resolve(json({ status: "ok" }));
      return Promise.resolve(json(config));
    }

    if (path === "/api/sessions") return Promise.resolve(json([]));
    if (path === "/api/models") return Promise.resolve(json({ ok: true, models: ["deepseek-chat", "deepseek-reasoner", "gpt-4o", "gpt-4o-mini"] }));
    if (path === "/api/test") return Promise.resolve(json({ ok: true, latency_ms: 842, model: "deepseek-chat", error: "" }));
    if (path === "/api/autostart") {
      if (method === "PUT") return Promise.resolve(json({ ok: true, enabled: true }));
      return Promise.resolve(json({ enabled: true }));
    }

    return Promise.resolve(json({ error: "not found" }, 404));
  };
})();
