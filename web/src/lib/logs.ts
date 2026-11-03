/** Logs page parsing, demo snapshot and client-side filtering (P3). */

import { requestJson } from "./http";

export type LogTone = "info" | "warn" | "error" | "muted";
export type LogFilter = "all" | "info" | "warn" | "error";

export type LogEntry = {
  id: string;
  raw: string;
  level: string;
  levelLabel: string;
  tone: LogTone;
  message: string;
  time: string;
  rawTime: string;
};

function normalizeLevel(level: string): { tone: LogTone; label: string } {
  const normalized = level.trim().toLowerCase();
  if (normalized === "warning" || normalized === "warn") {
    return { tone: "warn", label: "WARN" };
  }
  if (
    normalized === "error" ||
    normalized === "fatal" ||
    normalized === "panic"
  ) {
    return { tone: "error", label: "ERROR" };
  }
  if (normalized === "info") {
    return { tone: "info", label: "INFO" };
  }
  return {
    tone: "muted",
    label: normalized ? normalized.toUpperCase() : "LOG",
  };
}

function extractTime(rawTime: string): string {
  const match = rawTime.match(/(\d{2}):(\d{2}):(\d{2})/);
  return match ? `${match[1]}:${match[2]}:${match[3]}` : "";
}

export function parseLogLine(raw: string): LogEntry {
  const parts = raw.split(" | ");
  const level = parts.length >= 3 ? parts[0].trim() : "";
  const message =
    parts.length >= 3 ? parts.slice(1, -1).join(" | ").trim() : raw;
  const rawTime = parts.length >= 3 ? parts[parts.length - 1].trim() : "";
  const normalized = normalizeLevel(level);

  return {
    id: raw,
    raw,
    level,
    levelLabel: normalized.label,
    tone: normalized.tone,
    message,
    time: extractTime(rawTime),
    rawTime,
  };
}

const DEMO_LOG_LINES = [
  "info | 服务启动完成，正在监听 127.0.0.1:8080 | 2026-11-03 21:14:08",
  "info | 已加载 12 个会话上下文 | 2026-11-03 21:12:41",
  "warning | 模型响应较慢（2.8s），已自动重试 | 2026-11-03 21:09:17",
  "info | 收到群消息：产品设计群 | 2026-11-03 21:05:52",
  "error | 图片下载超时，已跳过本次图片理解 | 2026-11-03 20:58:30",
  "warning | 微信登录态即将过期，将在 10 分钟后尝试续期 | 2026-11-03 20:51:09",
  "error | 模型调用失败：context deadline exceeded | 2026-11-03 20:47:12",
  "info | 配置热更新：provider · model | 2026-11-03 20:40:55",
];

export const DEMO_LOGS: LogEntry[] = DEMO_LOG_LINES.map(parseLogLine);

export function filterLogs(
  logs: LogEntry[],
  filter: LogFilter,
  query: string,
): LogEntry[] {
  const normalizedQuery = query.trim().toLowerCase();

  return logs.filter((log) => {
    if (filter !== "all" && log.tone !== filter) return false;
    if (!normalizedQuery) return true;

    return (
      log.message.toLowerCase().includes(normalizedQuery) ||
      log.levelLabel.toLowerCase().includes(normalizedQuery) ||
      log.rawTime.toLowerCase().includes(normalizedQuery) ||
      log.time.includes(normalizedQuery)
    );
  });
}

export async function fetchLogs(): Promise<LogEntry[]> {
  const payload = await requestJson("/api/logs?limit=500");
  if (!Array.isArray(payload)) {
    throw new Error("日志接口返回了无效数据");
  }
  return payload
    .filter((entry): entry is string => typeof entry === "string")
    .map(parseLogLine);
}

export async function deleteAllLogs(): Promise<void> {
  await requestJson("/api/logs", { method: "DELETE" });
}

