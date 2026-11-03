import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEMO_LOGS,
  deleteAllLogs,
  fetchLogs,
  type LogEntry,
} from "./logs";

const POLL_INTERVAL_MS = 5_000;

export type LogsMode = "connecting" | "live" | "demo";

function errorText(error: unknown): string {
  return error instanceof Error && error.message
    ? error.message
    : "本地服务不可用";
}

/**
 * Logs data source: first load plus a silent 5s poll. A failed first load
 * falls back to the 8-line demo snapshot; later failures keep the last list.
 */
export function useLogsData() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [mode, setMode] = useState<LogsMode>("connecting");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

  const modeRef = useRef<LogsMode>("connecting");
  const loadedOnceRef = useRef(false);
  const refreshingRef = useRef(false);
  const clearingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    let pollTimer: number | undefined;

    function schedulePoll() {
      if (!active) return;
      pollTimer = window.setTimeout(() => {
        void load(false);
      }, POLL_INTERVAL_MS);
    }

    async function load(initial: boolean) {
      const firstLoad = !loadedOnceRef.current;

      try {
        const next = await fetchLogs();
        if (!active) return;
        setLogs(next);
        setMode("live");
        modeRef.current = "live";
      } catch {
        if (!active) return;
        if (firstLoad && modeRef.current === "connecting") {
          setLogs(DEMO_LOGS);
          setMode("demo");
          modeRef.current = "demo";
        }
      } finally {
        if (!active) return;
        loadedOnceRef.current = true;
        if (initial) setLoading(false);
        refreshingRef.current = false;
        setRefreshing(false);
        schedulePoll();
      }
    }

    void load(true);

    return () => {
      active = false;
      if (pollTimer !== undefined) window.clearTimeout(pollTimer);
    };
  }, [refreshToken]);

  const refresh = useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setRefreshToken((value) => value + 1);
  }, []);

  const clearLogs = useCallback(async (): Promise<{
    ok: boolean;
    error?: string;
  }> => {
    if (clearingRef.current) return { ok: false, error: "正在清空日志" };
    clearingRef.current = true;
    setClearing(true);

    try {
      await deleteAllLogs();
      if (mountedRef.current) {
        setLogs([]);
        setMode("live");
        modeRef.current = "live";
      }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: errorText(error) };
    } finally {
      clearingRef.current = false;
      if (mountedRef.current) setClearing(false);
    }
  }, []);

  return {
    logs,
    mode,
    loading,
    refreshing,
    clearing,
    refresh,
    clearLogs,
  };
}
