import type { CSSProperties } from "react";
import { Link } from "react-router-dom";
import {
  formatInteger,
  formatUptime,
  logLevelLabel,
  logTone,
  sessionInitial,
  sessionKindLabel,
  sessionLabel,
} from "../lib/dashboard";
import { DashboardSkeleton } from "../components/Skeletons";
import { useCountUp } from "../lib/useCountUp";
import { useDashboard } from "../lib/useDashboard";
import "../styles/dashboard.css";

type RevealStyle = CSSProperties & { "--dash-delay": string };

function reveal(delayMs: number): RevealStyle {
  return { "--dash-delay": `${delayMs}ms` };
}

function KpiValue({ value, unit }: { value: number | null; unit: string }) {
  if (value === null) {
    return <span className="dash-kpi-empty">—</span>;
  }

  return (
    <span className="dash-kpi-part">
      <span className="dash-kpi-num">{formatInteger(value)}</span>
      <span className="dash-kpi-unit">{unit}</span>
    </span>
  );
}

export default function DashboardPage() {
  const {
    mode,
    sessions,
    totalMessages,
    logs,
    uptimeMinutes,
    wechat,
    provider,
    retrying,
    retryLogin,
  } = useDashboard();

  const connecting = mode === "connecting";
  const isDemo = mode === "demo";

  const sessionTarget = connecting ? null : sessions.length;
  const messageTarget = connecting ? null : totalMessages;
  const groupTarget = connecting
    ? null
    : sessions.filter((session) => session.kind === "group").length;

  const sessionValue = useCountUp(sessionTarget);
  const messageValue = useCountUp(messageTarget);
  const groupValue = useCountUp(groupTarget);

  const recentSessions = sessions.slice(0, 6);

  return (
    <div className="dash">
      <header className="dash-head dash-reveal" style={reveal(0)}>
        <div className="dash-kicker-row">
          <p className="dash-kicker">DASHBOARD</p>
          {isDemo ? <span className="dash-demo-chip">演示数据</span> : null}
          {connecting ? <span className="dash-demo-chip">正在连接</span> : null}
        </div>
        <h1 className="dash-title">仪表盘</h1>
        <p className="dash-subtitle">微信连接、模型与会话的实时状态</p>
      </header>

      {connecting ? (
        <DashboardSkeleton />
      ) : (
        <>
          <section
            className="dash-status dash-card dash-glass dash-reveal"
        style={reveal(60)}
        aria-label="运行状态"
      >
        <div className="dash-status-seg dash-status-seg--wechat">
          <div className="dash-status-meta">
            <span className="dash-status-label">微信</span>
            <span className="dash-status-value">
              <span
                className="dash-dot"
                data-tone={wechat.tone}
                aria-hidden="true"
              />
              <span className="dash-status-text">{wechat.label}</span>
            </span>
          </div>
          <button
            type="button"
            className="dash-retry"
            onClick={() => void retryLogin()}
            disabled={retrying}
            aria-busy={retrying}
            title="重新发起微信登录"
          >
            重新登录
          </button>
        </div>

        <span className="dash-status-divider" aria-hidden="true" />

        <div className="dash-status-seg">
          <span className="dash-status-label">AI 服务</span>
          <span className="dash-status-value">
            {connecting ? (
              <span className="dash-status-text dash-status-text--muted">
                读取中…
              </span>
            ) : provider.configured ? (
              <span className="dash-status-text" title={provider.text}>
                {provider.text}
              </span>
            ) : (
              <>
                <span className="dash-status-text dash-status-text--muted">
                  未配置
                </span>
                <Link to="/settings" className="dash-link">
                  去设置
                </Link>
              </>
            )}
          </span>
        </div>

        <span className="dash-status-divider" aria-hidden="true" />

        <div className="dash-status-seg">
          <span className="dash-status-label">运行时长</span>
          <span className="dash-status-value dash-status-value--uptime">
            {formatUptime(uptimeMinutes)}
          </span>
        </div>
      </section>

      <section className="dash-kpis" aria-label="关键指标">
        <article
          className="dash-kpi dash-card dash-glass dash-reveal"
          style={reveal(120)}
        >
          <p className="dash-kpi-label">活跃会话</p>
          <p className="dash-kpi-value">
            <KpiValue value={sessionValue} unit="个" />
          </p>
          <p className="dash-kpi-note">当前保持的对话</p>
        </article>

        <article
          className="dash-kpi dash-card dash-glass dash-reveal"
          style={reveal(160)}
        >
          <p className="dash-kpi-label">历史消息</p>
          <p className="dash-kpi-value">
            <KpiValue value={messageValue} unit="条" />
          </p>
          <p className="dash-kpi-note">本地数据库累计</p>
        </article>

        <article
          className="dash-kpi dash-card dash-glass dash-reveal"
          style={reveal(200)}
        >
          <p className="dash-kpi-label">群聊会话</p>
          <p className="dash-kpi-value">
            <KpiValue value={groupValue} unit="个" />
          </p>
          <p className="dash-kpi-note">当前群聊上下文</p>
        </article>
      </section>

      <div className="dash-columns">
        <section
          className="dash-panel dash-card dash-reveal"
          style={reveal(180)}
          aria-labelledby="dash-sessions-title"
        >
          <header className="dash-panel-head">
            <h2 id="dash-sessions-title" className="dash-panel-title">
              最近会话
            </h2>
            <Link to="/chat" className="dash-link">
              查看全部
            </Link>
          </header>

          {recentSessions.length > 0 ? (
            <ul className="dash-sessions">
              {recentSessions.map((session) => (
                <li className="dash-session" key={session.key}>
                  <span
                    className={`dash-avatar${
                      session.kind === "group" ? " dash-avatar--group" : ""
                    }`}
                    aria-hidden="true"
                  >
                    {sessionInitial(session)}
                  </span>
                  <span
                    className="dash-session-name"
                    title={sessionLabel(session)}
                  >
                    {sessionLabel(session)}
                  </span>
                  <span className="dash-pill">
                    {sessionKindLabel(session.kind)}
                  </span>
                  <span className="dash-session-meta">
                    <span className="dash-session-pairs">
                      {session.pairs} 轮
                    </span>
                    <span
                      className="dash-session-when"
                      title={
                        session.relative
                          ? undefined
                          : "会话接口暂未提供最近活动时间"
                      }
                    >
                      {session.relative ?? "—"}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="dash-empty">还没有会话，给机器人发条消息试试</p>
          )}
        </section>

        <section
          className="dash-panel dash-card dash-reveal"
          style={reveal(220)}
          aria-labelledby="dash-activity-title"
        >
          <header className="dash-panel-head">
            <h2 id="dash-activity-title" className="dash-panel-title">
              最近活动
            </h2>
            <Link to="/logs" className="dash-link">
              查看全部
            </Link>
          </header>

          {logs.length > 0 ? (
            <ol className="dash-timeline">
              {logs.map((log) => (
                <li className="dash-timeline-item" key={log.id}>
                  <span
                    className="dash-timeline-dot"
                    data-tone={logTone(log.level)}
                    aria-hidden="true"
                  />
                  <span className="dash-timeline-time">{log.time}</span>
                  <p
                    className="dash-timeline-msg"
                    title={`${log.level.toUpperCase()} · ${log.rawTime || "时间未知"}`}
                  >
                    <span className="dash-visually-hidden">
                      {logLevelLabel(log.level)}：
                    </span>
                    {log.message}
                  </p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="dash-empty">暂无日志</p>
          )}
        </section>
      </div>
        </>
      )}
    </div>
  );
}
