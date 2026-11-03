import { useMemo, useState } from "react";
import {
  RefreshIcon,
  SearchIcon,
  TrashIcon,
} from "../components/icons";
import { LogsSkeleton } from "../components/Skeletons";
import { filterLogs, type LogFilter } from "../lib/logs";
import { useLogsData } from "../lib/useLogsData";
import "../styles/admin-page.css";
import "../styles/logs.css";

const LEVEL_FILTERS: Array<{ value: LogFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "info", label: "Info" },
  { value: "warn", label: "Warn" },
  { value: "error", label: "Error" },
];

type ClearStatus = { tone: "success" | "error"; text: string };

export default function LogsPage() {
  const {
    logs,
    mode,
    loading,
    refreshing,
    clearing,
    refresh,
    clearLogs,
  } = useLogsData();

  const [filter, setFilter] = useState<LogFilter>("all");
  const [query, setQuery] = useState("");
  const [confirmingClear, setConfirmingClear] = useState(false);
  const [clearStatus, setClearStatus] = useState<ClearStatus | null>(null);

  const filteredLogs = useMemo(
    () => filterLogs(logs, filter, query),
    [logs, filter, query],
  );

  function requestClear() {
    if (logs.length === 0 || clearing) return;
    setClearStatus(null);
    setConfirmingClear(true);
  }

  async function confirmClear() {
    if (clearing) return;
    const result = await clearLogs();
    setConfirmingClear(false);

    if (result.ok) {
      setClearStatus({ tone: "success", text: "日志已清空" });
    } else {
      setClearStatus({
        tone: "error",
        text: `清空失败：${result.error ?? "本地服务不可用"}`,
      });
    }
  }

  return (
    <div className="logs-page">
      <header className="admin-head">
        <div className="admin-kicker-row">
          <p className="admin-kicker">LOGS</p>
          {mode === "demo" ? <span className="admin-chip">演示数据</span> : null}
        </div>
        <h1 className="admin-title">日志</h1>
        <p className="admin-subtitle">运行日志与错误追踪</p>
      </header>

      <section className="logs-panel admin-card" aria-label="运行日志">
        <div className="logs-toolbar">
          <div className="logs-levels" role="group" aria-label="日志级别">
            {LEVEL_FILTERS.map((item) => (
              <button
                key={item.value}
                type="button"
                className="logs-level-chip"
                data-active={filter === item.value}
                aria-pressed={filter === item.value}
                onClick={() => setFilter(item.value)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <label className="logs-search">
            <SearchIcon className="logs-search-icon size-3.5" />
            <input
              type="text"
              className="logs-search-input"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索日志"
              aria-label="搜索日志"
            />
          </label>

          <div className="logs-actions">
            <button
              type="button"
              className="admin-button"
              onClick={refresh}
              disabled={refreshing}
              aria-busy={refreshing}
            >
              <RefreshIcon
                className={
                  refreshing ? "admin-spin size-3.5" : "size-3.5"
                }
              />
              刷新
            </button>
            <button
              type="button"
              className="admin-button admin-button--danger"
              onClick={requestClear}
              disabled={logs.length === 0 || clearing}
            >
              <TrashIcon className="size-3.5" />
              清空
            </button>
          </div>
        </div>

        {confirmingClear ? (
          <div className="logs-confirm" role="alert">
            <span>确认清空全部日志？此操作不可撤销。</span>
            <div className="logs-confirm-actions">
              <button
                type="button"
                className="admin-button"
                onClick={() => setConfirmingClear(false)}
                disabled={clearing}
              >
                取消
              </button>
              <button
                type="button"
                className="admin-button admin-button--danger-solid"
                onClick={() => void confirmClear()}
                disabled={clearing}
              >
                {clearing ? "清空中…" : "确认清空"}
              </button>
            </div>
          </div>
        ) : null}

        {clearStatus ? (
          <div
            className="logs-status"
            data-tone={clearStatus.tone}
            role="status"
          >
            {clearStatus.text}
          </div>
        ) : null}

        {loading && logs.length === 0 ? (
          <LogsSkeleton />
        ) : loading ? (
          <div className="admin-empty">正在加载日志…</div>
        ) : filteredLogs.length === 0 ? (
          <div className="admin-empty">暂无日志</div>
        ) : (
          <ul className="logs-list">
            {filteredLogs.map((log) => (
              <li className="logs-row" key={log.id}>
                <span className="logs-time" title={log.rawTime}>
                  {log.time || "--:--:--"}
                </span>
                <span className="logs-level" data-tone={log.tone}>
                  {log.levelLabel}
                </span>
                <span className="logs-message" title={log.message}>
                  {log.message}
                </span>
              </li>
            ))}
          </ul>
        )}

        <footer className="logs-foot">
          <span>
            显示 {filteredLogs.length} / {logs.length} 条
          </span>
          <span>每 5 秒自动刷新</span>
        </footer>
      </section>
    </div>
  );
}
