import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEMO_LOGS,
  DEMO_SESSIONS,
  DEMO_TOTAL_MESSAGES,
  DEMO_UPTIME_MINUTES,
  describeProvider,
  describeWechat,
  fetchDashboardStatus,
  fetchHistoryTotal,
  fetchLogs,
  uptimeMinutesFrom,
  type DashboardLog,
  type DashboardMode,
  type DashboardSession,
  type DashboardStatus,
} from "./dashboard";
import { notifyUnauthorized } from "./http";

const POLL_INTERVAL_MS = 5_000;
const REQUEST_TIMEOUT_MS = 4_000;
const CLOCK_INTERVAL_MS = 30_000;

type Snapshot = {
  mode: DashboardMode;
  status: DashboardStatus | null;
  totalMessages: number | null;
  logs: DashboardLog[];
};

type FetchResult<T> = { ok: true; value: T } | { ok: false };

const INITIAL_SNAPSHOT: Snapshot = {
  mode: "connecting",
  status: null,
  totalMessages: null,
  logs: [],
};

async function settle<T>(promise: Promise<T>): Promise<FetchResult<T>> {
  try {
    return { ok: true, value: await promise };
  } catch {
    return { ok: false };
  }
}

/**
 * Dashboard data source.
 *
 * - Bootstrap: status + history + logs, in parallel.
 * - Afterwards: status + logs every 5s. History is a one-shot read; if it
 *   fails the KPI shows an em dash rather than inventing a number.
 * - A failed poll is silent: the last good snapshot stays on screen. Demo
 *   data is only used when the very first status read fails, so a transient
 *   hiccup can never replace live numbers with mock numbers.
 */
export function useDashboard() {
  const [snapshot, setSnapshot] = useState<Snapshot>(INITIAL_SNAPSHOT);
  const [now, setNow] = useState(() => Date.now());
  const [retrying, setRetrying] = useState(false);
  const retryingRef = useRef(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), CLOCK_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    let pollTimer: number | undefined;
    let requestTimer: number | undefined;
    let controller: AbortController | null = null;

    function scheduleNextPoll() {
      if (!active) return;
      pollTimer = window.setTimeout(() => {
        void poll(false);
      }, POLL_INTERVAL_MS);
    }

    async function poll(initial: boolean) {
      controller = new AbortController();
      const activeController = controller;
      requestTimer = window.setTimeout(
        () => activeController.abort(),
        REQUEST_TIMEOUT_MS,
      );

      const statusPromise = fetchDashboardStatus(activeController.signal);
      const logsPromise = fetchLogs(activeController.signal);
      // History total is read once on mount; the 5s poll is status + logs only.
      const historyPromise = initial
        ? fetchHistoryTotal(activeController.signal)
        : null;

      // Requests start together; awaiting them one by one only sequences the
      // result inspection, never the network round trips.
      const statusResult = await settle(statusPromise);
      const logsResult = await settle(logsPromise);
      const historyResult = historyPromise ? await settle(historyPromise) : null;

      if (requestTimer !== undefined) {
        window.clearTimeout(requestTimer);
        requestTimer = undefined;
      }
      if (!active) return;

      setSnapshot((current) => {
        if (!statusResult.ok) {
          // First boot with no backend: render the intentional demo snapshot.
          if (current.mode === "connecting") {
            return {
              mode: "demo",
              status: null,
              totalMessages: null,
              logs: [],
            };
          }
          // Later failures stay silent and keep the last live snapshot.
          return current;
        }

        const nextTotal = historyResult?.ok
          ? historyResult.value
          : current.totalMessages;

        return {
          mode: "live",
          status: statusResult.value,
          totalMessages: nextTotal,
          logs: logsResult.ok ? logsResult.value : initial ? [] : current.logs,
        };
      });
      setNow(Date.now());
      scheduleNextPoll();
    }

    void poll(true);

    return () => {
      active = false;
      if (pollTimer !== undefined) window.clearTimeout(pollTimer);
      if (requestTimer !== undefined) window.clearTimeout(requestTimer);
      controller?.abort();
    };
  }, []);

  /** POST /api/login/retry — deliberately silent on every failure. */
  const retryLogin = useCallback(async () => {
    if (retryingRef.current) return;
    retryingRef.current = true;
    setRetrying(true);

    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch("/api/login/retry", {
        method: "POST",
        headers: { Accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });
      if (response.status === 401) {
        notifyUnauthorized();
      }
    } catch {
      // Best-effort action: no toast, no inline error.
    } finally {
      window.clearTimeout(timeout);
      retryingRef.current = false;
      setRetrying(false);
    }
  }, []);

  const isDemo = snapshot.mode === "demo";
  const status = snapshot.status;

  const sessions: DashboardSession[] = isDemo
    ? DEMO_SESSIONS
    : status?.sessions ?? [];
  const totalMessages = isDemo ? DEMO_TOTAL_MESSAGES : snapshot.totalMessages;
  const logs = isDemo ? DEMO_LOGS : snapshot.logs;
  const uptimeMinutes = isDemo
    ? DEMO_UPTIME_MINUTES
    : status
      ? uptimeMinutesFrom(status.startupAt, now)
      : null;

  return {
    mode: snapshot.mode,
    sessions,
    totalMessages,
    logs,
    uptimeMinutes,
    wechat: describeWechat(status?.wechatState ?? "", snapshot.mode),
    provider: describeProvider(isDemo ? null : status),
    retrying,
    retryLogin,
  };
}
