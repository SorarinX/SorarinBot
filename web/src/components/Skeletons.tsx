import "../styles/skeleton.css";

const FOUR = [0, 1, 2, 3];

export function DashboardSkeleton() {
  return (
    <div
      className="skeleton-dash"
      role="status"
      aria-busy="true"
      aria-label="正在加载仪表盘"
    >
      <div className="skeleton-kpis">
        {[0, 1, 2].map((item) => (
          <div className="skeleton-kpi skeleton-block" key={item} />
        ))}
      </div>

      <section className="skeleton-panel admin-card">
        {FOUR.map((item) => (
          <div className="skeleton-row" key={item}>
            <span className="skeleton-avatar skeleton-block" />
            <span className="skeleton-line skeleton-line--name skeleton-block" />
            <span className="skeleton-line skeleton-line--meta skeleton-block" />
          </div>
        ))}
      </section>
    </div>
  );
}

export function ChatSessionSkeleton() {
  return (
    <div
      className="chat-skeleton"
      role="status"
      aria-busy="true"
      aria-label="正在加载会话"
    >
      {FOUR.map((item) => (
        <div className="chat-skeleton-row" key={item}>
          <span className="chat-skeleton-avatar skeleton-block" />
          <span className="chat-skeleton-copy">
            <span className="chat-skeleton-line skeleton-block" />
            <span className="chat-skeleton-line chat-skeleton-line--short skeleton-block" />
          </span>
          <span className="chat-skeleton-time skeleton-block" />
        </div>
      ))}
    </div>
  );
}

export function LogsSkeleton() {
  return (
    <div
      className="logs-skeleton"
      role="status"
      aria-busy="true"
      aria-label="正在加载日志"
    >
      {FOUR.map((item) => (
        <div className="logs-skeleton-row" key={item}>
          <span className="logs-skeleton-time skeleton-block" />
          <span className="logs-skeleton-level skeleton-block" />
          <span
            className={
              item === 2
                ? "logs-skeleton-message logs-skeleton-message--short skeleton-block"
                : "logs-skeleton-message skeleton-block"
            }
          />
        </div>
      ))}
    </div>
  );
}
