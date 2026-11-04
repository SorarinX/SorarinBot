/* Chat page data access, demo snapshot and formatting (P2).
 *
 * Backend contract:
 *   GET /api/status                       -> sessions[]
 *   GET /api/history?limit=50&offset=0    -> { rows[], total }
 *
 * Each history row is a user message + bot reply pair. The page groups the
 * rows into a chronological conversation and renders both bubbles.
 */

import {
  fetchDashboardStatus,
  type DashboardSession,
} from "./dashboard";
import { notifyUnauthorized } from "./http";

export type ChatMode = "connecting" | "live" | "demo";

export type ChatRow = {
  id: number;
  sender: string;
  room: string;
  userMessage: string;
  botReply: string;
  model: string;
  totalTokens: number;
  createdAt: string;
};

export type ChatHistory = {
  rows: ChatRow[];
  total: number;
};

/* ── Demo snapshot ────────────────────────────────────────────────────── */

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function demoStamp(daysAgo: number, hour: number, minute: number): string {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(hour)}:${pad2(minute)}:00`;
}

export const DEMO_CHAT_SESSIONS: DashboardSession[] = [
  {
    key: "private:linxiaoman",
    display: "林小满",
    kind: "private",
    room: "",
    pairs: 24,
    relative: "刚刚",
  },
  {
    key: "group:4521@chatroom",
    display: "产品设计群",
    kind: "group",
    room: "4521@chatroom",
    pairs: 18,
    relative: "3 分钟前",
  },
  {
    key: "private:azhe",
    display: "阿哲",
    kind: "private",
    room: "",
    pairs: 9,
    relative: "昨天",
  },
];

export const DEMO_CHAT_ROWS: ChatRow[] = [
  {
    id: 1,
    sender: "陈以宁",
    room: "4521@chatroom",
    userMessage: "二维码登录失败时要不要加个重试？",
    botReply: "建议加。失败后展示「重新登录」，并把错误写进日志。",
    model: "deepseek-chat",
    totalTokens: 412,
    createdAt: demoStamp(3, 9, 15),
  },
  {
    id: 2,
    sender: "陈以宁",
    room: "4521@chatroom",
    userMessage: "群公告里的版本号记得改成 v3.0.0。",
    botReply: "改好了，发布说明里的日期也一起更新了。",
    model: "deepseek-chat",
    totalTokens: 286,
    createdAt: demoStamp(1, 18, 2),
  },
  {
    id: 3,
    sender: "林小满",
    room: "4521@chatroom",
    userMessage: "这版首页的间距是不是可以再松一点？",
    botReply: "可以，我把主标题到副标题的间距调到 16，再看一版。",
    model: "deepseek-chat",
    totalTokens: 518,
    createdAt: demoStamp(0, 10, 24),
  },
  {
    id: 4,
    sender: "阿哲",
    room: "4521@chatroom",
    userMessage: "顺手把移动端的按钮统一成 44 高。",
    botReply: "已统一，点击区域也补到了 44×44。",
    model: "gpt-4o-mini",
    totalTokens: 203,
    createdAt: demoStamp(0, 10, 31),
  },
  {
    id: 5,
    sender: "林小满",
    room: "",
    userMessage: "明天下午的评审还是三点吗？",
    botReply: "对，三点开始，我把会议链接发你。",
    model: "deepseek-chat",
    totalTokens: 367,
    createdAt: demoStamp(1, 21, 15),
  },
  {
    id: 6,
    sender: "林小满",
    room: "",
    userMessage: "帮我记一下：周五前把登录文案再过一遍。",
    botReply: "记下了，周五上午提醒你。",
    model: "deepseek-chat",
    totalTokens: 441,
    createdAt: demoStamp(0, 9, 40),
  },
  {
    id: 7,
    sender: "林小满",
    room: "",
    userMessage: "好的，谢谢。",
    botReply: "不客气，随时叫我。",
    model: "deepseek-chat",
    totalTokens: 128,
    createdAt: demoStamp(0, 9, 42),
  },
  {
    id: 8,
    sender: "阿哲",
    room: "",
    userMessage: "模型换了吗？感觉今天回得更快了。",
    botReply: "换了 deepseek-chat，延迟确实低了一些。",
    model: "deepseek-chat",
    totalTokens: 392,
    createdAt: demoStamp(2, 11, 30),
  },
  {
    id: 9,
    sender: "阿哲",
    room: "",
    userMessage: "那 token 计费也变了吗？",
    botReply: "单价更低，账单里能看到新的模型名称。",
    model: "deepseek-chat",
    totalTokens: 275,
    createdAt: demoStamp(2, 11, 35),
  },
  {
    id: 10,
    sender: "阿哲",
    room: "",
    userMessage: "收到，我晚点看下。",
    botReply: "好，有问题随时说。",
    model: "deepseek-chat",
    totalTokens: 96,
    createdAt: demoStamp(1, 20, 10),
  },
];

export const DEMO_CHAT_TOTAL = DEMO_CHAT_ROWS.length;

/* ── Fetching ─────────────────────────────────────────────────────────── */

async function fetchJson(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(path, {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });

  if (response.status === 401) {
    notifyUnauthorized();
  }

  if (!response.ok) {
    throw new Error(`${path} 返回 HTTP ${response.status}`);
  }

  const rawBody = await response.text();
  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new Error(`${path} 返回了非 JSON 内容`);
  }
}

function readRecord(payload: unknown): Record<string, unknown> {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("接口返回了无效数据");
  }
  return payload as Record<string, unknown>;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.trunc(value))
    : 0;
}

function readRow(value: unknown): ChatRow | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "number" || !Number.isFinite(record.id)) {
    return null;
  }

  const userMessage =
    typeof record.user_message === "string" ? record.user_message : "";
  const botReply =
    typeof record.bot_reply === "string" ? record.bot_reply : "";
  if (!userMessage.trim() && !botReply.trim()) return null;

  return {
    id: Math.trunc(record.id),
    sender: readString(record.sender),
    room: readString(record.room),
    userMessage,
    botReply,
    model: readString(record.model),
    totalTokens: readCount(record.total_tokens),
    createdAt: readString(record.created_at),
  };
}

export async function fetchChatSessions(
  signal: AbortSignal,
): Promise<DashboardSession[]> {
  const status = await fetchDashboardStatus(signal);
  return status.sessions;
}

export async function fetchChatHistory(
  signal: AbortSignal,
  limit = 50,
  offset = 0,
): Promise<ChatHistory> {
  const payload = readRecord(
    await fetchJson(`/api/history?limit=${limit}&offset=${offset}`, signal),
  );
  const rawRows = Array.isArray(payload.rows) ? payload.rows : [];
  const rows = rawRows
    .map(readRow)
    .filter((row): row is ChatRow => row !== null);
  const reportedTotal =
    typeof payload.total === "number" && Number.isFinite(payload.total)
      ? Math.max(0, Math.trunc(payload.total))
      : rows.length;

  return {
    rows,
    total: Math.max(reportedTotal, rows.length),
  };
}

/* ── Matching / ordering ──────────────────────────────────────────────── */

/** Group sessions match by room; private sessions match sender by display. */
export function sessionMatchesRow(
  session: DashboardSession,
  row: ChatRow,
): boolean {
  return session.room ? row.room === session.room : row.sender === session.display;
}

export function sortChatRowsChronologically(rows: ChatRow[]): ChatRow[] {
  return [...rows].sort((left, right) => {
    const leftTime = parseChatTimestamp(left.createdAt)?.getTime() ?? 0;
    const rightTime = parseChatTimestamp(right.createdAt)?.getTime() ?? 0;
    return leftTime - rightTime || left.id - right.id;
  });
}

/* ── Dates ────────────────────────────────────────────────────────────── */

export function parseChatTimestamp(value: string): Date | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const normalized = trimmed.includes("T")
    ? trimmed
    : trimmed.replace(" ", "T");
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function dayKeyFromDate(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

export function chatDayKey(value: string): string {
  const date = parseChatTimestamp(value);
  return date ? dayKeyFromDate(date) : "unknown";
}

export function formatChatDay(value: string, now = new Date()): string {
  const date = parseChatTimestamp(value);
  if (!date) return "未知日期";

  const key = dayKeyFromDate(date);
  if (key === dayKeyFromDate(now)) return "今天";

  const yesterday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - 1,
  );
  if (key === dayKeyFromDate(yesterday)) return "昨天";
  return key;
}

export function formatChatTime(value: string): string {
  const date = parseChatTimestamp(value);
  if (!date) {
    const fallback = value.match(/(\d{1,2}):(\d{2})/);
    return fallback
      ? `${pad2(Number(fallback[1]))}:${fallback[2]}`
      : "";
  }
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/* ── Clipboard ────────────────────────────────────────────────────────── */

export async function copyText(text: string): Promise<boolean> {
  try {
    window.focus();
  } catch {
    /* Focus is best-effort; the clipboard API may still work. */
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* Fall through to the legacy path below. */
  }

  try {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.top = "0";
    area.style.left = "-9999px";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.focus();
    area.select();
    area.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
