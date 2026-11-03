/* Dashboard data access, demo fallback and formatting (P1b).
 *
 * Backend contract (unchanged from the Vue console):
 *   GET  /api/status          -> { sessions[], provider, model, startup_at,
 *                                  api_key_configured, wechat_state }
 *   GET  /api/history?limit=1 -> { rows[], total }
 *   GET  /api/logs?limit=12   -> string[]  ("level | message | timestamp")
 *
 * Every parser rejects malformed payloads instead of guessing; the hook turns
 * that rejection into the quiet demo snapshot, never a white screen.
 */

import { notifyUnauthorized } from "./http";

export type DashboardMode = "connecting" | "live" | "demo";

export type SessionKind = "private" | "group" | "other";

export type DashboardSession = {
  key: string;
  display: string;
  kind: SessionKind;
  room: string;
  pairs: number;
  /** Demo-only: the API does not expose a last-activity timestamp. */
  relative?: string;
};

export type DashboardStatus = {
  provider: string;
  model: string;
  startupAt: string;
  apiKeyConfigured: boolean;
  wechatState: string;
  sessions: DashboardSession[];
};

export type LogTone = "info" | "warn" | "error" | "muted";

export type DashboardLog = {
  id: string;
  level: string;
  message: string;
  /** HH:MM extracted from the backend timestamp. */
  time: string;
  /** Full timestamp for the native tooltip. */
  rawTime: string;
};

export type StatusTone = "brand" | "warn" | "error" | "muted";

export type WechatSummary = {
  label: string;
  tone: StatusTone;
};

export type ProviderSummary = {
  configured: boolean;
  text: string;
};

export type UptimePart = {
  value: number;
  unit: "天" | "小时" | "分";
};

/* ── Demo snapshot ────────────────────────────────────────────────────── */

export const DEMO_TOTAL_MESSAGES = 1287;
/** 2 小时 13 分. */
export const DEMO_UPTIME_MINUTES = 133;

export const DEMO_SESSIONS: DashboardSession[] = [
  { key: "private:linxiaoman", display: "林小满", kind: "private", room: "", pairs: 24, relative: "刚刚" },
  { key: "group:design", display: "产品设计群", kind: "group", room: "design", pairs: 8, relative: "3 分钟前" },
  { key: "private:azhe", display: "阿哲", kind: "private", room: "", pairs: 15, relative: "12 分钟前" },
  { key: "group:hiking", display: "周末爬山群", kind: "group", room: "hiking", pairs: 6, relative: "28 分钟前" },
  { key: "private:chenyining", display: "陈以宁", kind: "private", room: "", pairs: 9, relative: "1 小时前" },
  { key: "group:frontend", display: "前端技术交流", kind: "group", room: "frontend", pairs: 12, relative: "2 小时前" },
  { key: "private:wangye", display: "王野", kind: "private", room: "", pairs: 5, relative: "3 小时前" },
  { key: "group:family", display: "家庭群", kind: "group", room: "family", pairs: 31, relative: "5 小时前" },
  { key: "private:liuxing", display: "刘星", kind: "private", room: "", pairs: 7, relative: "昨天" },
  { key: "group:reading", display: "读书会", kind: "group", room: "reading", pairs: 4, relative: "昨天" },
  { key: "private:laozhou", display: "老周", kind: "private", room: "", pairs: 2, relative: "2 天前" },
  { key: "group:support", display: "客户支持群", kind: "group", room: "support", pairs: 18, relative: "2 天前" },
];

export const DEMO_LOGS: DashboardLog[] = [
  {
    id: "demo-1",
    level: "info",
    message: "微信登录成功，会话上下文已就绪",
    time: "21:14",
    rawTime: "2026-11-03 21:14:08",
  },
  {
    id: "demo-2",
    level: "info",
    message: "已加载 12 个会话上下文",
    time: "21:12",
    rawTime: "2026-11-03 21:12:41",
  },
  {
    id: "demo-3",
    level: "warning",
    message: "模型响应较慢（2.8s），已自动重试",
    time: "21:09",
    rawTime: "2026-11-03 21:09:17",
  },
  {
    id: "demo-4",
    level: "info",
    message: "收到群消息：产品设计群",
    time: "21:05",
    rawTime: "2026-11-03 21:05:52",
  },
  {
    id: "demo-5",
    level: "error",
    message: "图片下载超时，已跳过本次图片理解",
    time: "20:58",
    rawTime: "2026-11-03 20:58:30",
  },
  {
    id: "demo-6",
    level: "info",
    message: "服务启动完成，正在监听 127.0.0.1:8080",
    time: "20:47",
    rawTime: "2026-11-03 20:47:12",
  },
];

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

  // Go's json.Encoder does not always set application/json, so parse the body
  // rather than trusting the header. An SPA fallback returns index.html here
  // and fails JSON.parse, which is exactly how demo mode is detected.
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

function readSession(value: unknown): DashboardSession | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const key = readString(record.key);
  if (!key) return null;

  const kind = readString(record.kind);
  return {
    key,
    display: readString(record.display),
    kind: kind === "group" ? "group" : kind === "private" ? "private" : "other",
    room: readString(record.room),
    pairs: readCount(record.pairs),
  };
}

export async function fetchDashboardStatus(signal: AbortSignal): Promise<DashboardStatus> {
  const payload = readRecord(await fetchJson("/api/status", signal));
  const sessions = Array.isArray(payload.sessions)
    ? payload.sessions
        .map(readSession)
        .filter((session): session is DashboardSession => session !== null)
    : [];

  return {
    provider: readString(payload.provider),
    model: readString(payload.model),
    startupAt: readString(payload.startup_at),
    apiKeyConfigured: payload.api_key_configured === true,
    wechatState: readString(payload.wechat_state) || "idle",
    sessions,
  };
}

export async function fetchHistoryTotal(signal: AbortSignal): Promise<number> {
  const payload = readRecord(await fetchJson("/api/history?limit=1", signal));
  if (typeof payload.total !== "number" || !Number.isFinite(payload.total)) {
    throw new Error("历史消息接口缺少 total");
  }
  return Math.max(0, Math.trunc(payload.total));
}

function extractClock(value: string): string {
  const match = value.match(/(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!match) return "";
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return "";
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

export function parseLogLine(line: string, index: number): DashboardLog {
  const segments = line.split(" | ");
  let level = "info";
  let message = line;
  let rawTime = "";

  if (segments.length >= 3) {
    level = segments[0].trim() || "info";
    rawTime = segments[segments.length - 1].trim();
    message = segments.slice(1, -1).join(" | ").trim() || line;
  } else if (segments.length === 2) {
    level = segments[0].trim() || "info";
    message = segments[1].trim() || line;
  }

  return {
    id: `${index}:${line}`,
    level: level.toLowerCase(),
    message,
    time: extractClock(rawTime) || extractClock(line) || "--:--",
    rawTime,
  };
}

export async function fetchLogs(signal: AbortSignal): Promise<DashboardLog[]> {
  const payload = await fetchJson("/api/logs?limit=12", signal);
  // database.QueryLogs returns a nil slice when the table is empty -> null.
  if (payload === null) return [];
  if (!Array.isArray(payload)) {
    throw new Error("日志接口返回了无效数据");
  }
  return payload
    .filter((line): line is string => typeof line === "string")
    .map((line, index) => parseLogLine(line, index));
}

/* ── Derived copy / formatting ────────────────────────────────────────── */

export function describeWechat(state: string, mode: DashboardMode): WechatSummary {
  if (mode === "demo") return { label: "等待连接", tone: "muted" };
  if (mode === "connecting") return { label: "正在连接", tone: "muted" };
  if (state === "logged_in") return { label: "已登录", tone: "brand" };
  if (state === "failed") return { label: "登录失败", tone: "error" };
  return { label: "等待扫码", tone: "warn" };
}

export function describeProvider(status: DashboardStatus | null): ProviderSummary {
  const provider = status?.provider ?? "";
  const model = status?.model ?? "";
  return {
    configured: Boolean(status?.apiKeyConfigured && provider && model),
    text: provider && model ? `${provider} · ${model}` : "",
  };
}

export function logTone(level: string): LogTone {
  const normalized = level.toLowerCase();
  if (normalized === "error" || normalized === "fatal" || normalized === "panic") {
    return "error";
  }
  if (normalized === "warning" || normalized === "warn") return "warn";
  if (normalized === "info") return "info";
  return "muted";
}

export function logLevelLabel(level: string): string {
  switch (logTone(level)) {
    case "error":
      return "错误";
    case "warn":
      return "警告";
    case "info":
      return "信息";
    default:
      return "调试";
  }
}

export function sessionLabel(session: DashboardSession): string {
  return session.display.trim() || session.key;
}

export function sessionKindLabel(kind: SessionKind): string {
  if (kind === "group") return "群聊";
  if (kind === "private") return "私聊";
  return "会话";
}

export function sessionInitial(session: DashboardSession): string {
  const label = sessionLabel(session);
  if (!label) return "?";
  if (!session.display && session.kind === "group") return "群";
  const first = Array.from(label)[0] ?? "?";
  return /^[a-z]$/i.test(first) ? first.toUpperCase() : first;
}

export function uptimeMinutesFrom(startupAt: string, now: number): number | null {
  if (!startupAt) return null;
  const startedAt = Date.parse(startupAt);
  if (!Number.isFinite(startedAt)) return null;
  return Math.max(0, Math.floor((now - startedAt) / 60_000));
}

export function uptimeParts(minutes: number): UptimePart[] {
  const total = Math.max(0, Math.round(minutes));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const rest = total % 60;

  if (days > 0) {
    return hours > 0
      ? [
          { value: days, unit: "天" },
          { value: hours, unit: "小时" },
        ]
      : [{ value: days, unit: "天" }];
  }

  if (hours > 0) {
    return rest > 0
      ? [
          { value: hours, unit: "小时" },
          { value: rest, unit: "分" },
        ]
      : [{ value: hours, unit: "小时" }];
  }

  return [{ value: rest, unit: "分" }];
}

export function formatUptime(minutes: number | null): string {
  if (minutes === null) return "—";
  return uptimeParts(minutes)
    .map((part) => `${part.value} ${part.unit}`)
    .join(" ");
}

const integerFormatter = new Intl.NumberFormat("en-US");

export function formatInteger(value: number): string {
  return integerFormatter.format(Math.max(0, Math.round(value)));
}
