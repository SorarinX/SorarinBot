import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEMO_CHAT_ROWS,
  DEMO_CHAT_SESSIONS,
  DEMO_CHAT_TOTAL,
  fetchChatHistory,
  fetchChatSessions,
  type ChatHistory,
  type ChatMode,
  type ChatRow,
} from "./chat";
import type { DashboardSession } from "./dashboard";

const POLL_INTERVAL_MS = 10_000;
const REQUEST_TIMEOUT_MS = 4_000;
const NEW_HIGHLIGHT_MS = 260;
const PAGE_SIZE = 50;

type FetchResult<T> = { ok: true; value: T } | { ok: false };

async function settle<T>(promise: Promise<T>): Promise<FetchResult<T>> {
  try {
    return { ok: true, value: await promise };
  } catch {
    return { ok: false };
  }
}

function mergeRows(current: ChatRow[], incoming: ChatRow[]): ChatRow[] {
  const map = new Map<number, ChatRow>();
  for (const row of current) map.set(row.id, row);
  for (const row of incoming) map.set(row.id, row);
  // The API returns newest first; keep that global ordering. The page sorts the
  // selected conversation chronologically before rendering.
  return Array.from(map.values()).sort((left, right) => right.id - left.id);
}

/**
 * Chat data source.
 *
 * - Bootstrap: /api/status + one page of /api/history in parallel.
 * - Poll: every 10s, status plus the latest history page while a session is
 *   selected (or while recovering from demo mode).
 * - Demo snapshot (3 sessions / 10 rows) only when the first status read
 *   fails; later failures keep the last good data silently.
 * - New rows from a poll are highlighted once for the 160ms arrival animation.
 */
export function useChatData(selectedKey: string | null) {
  const [sessions, setSessions] = useState<DashboardSession[]>([]);
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [total, setTotal] = useState(0);
  const [mode, setMode] = useState<ChatMode>("connecting");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [newIds, setNewIds] = useState<ReadonlySet<number>>(
    () => new Set<number>(),
  );
  const [refreshToken, setRefreshToken] = useState(0);

  const selectedKeyRef = useRef<string | null>(selectedKey);
  selectedKeyRef.current = selectedKey;

  const rowsRef = useRef<ChatRow[]>([]);
  const totalRef = useRef(0);
  const modeRef = useRef<ChatMode>("connecting");
  const loadedOnceRef = useRef(false);
  const refreshingRef = useRef(false);
  const loadingMoreRef = useRef(false);
  const highlightTimerRef = useRef<number | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (highlightTimerRef.current !== null) {
        window.clearTimeout(highlightTimerRef.current);
      }
    };
  }, []);

  const applyMode = useCallback((nextMode: ChatMode) => {
    modeRef.current = nextMode;
    setMode(nextMode);
  }, []);

  const applyRows = useCallback((nextRows: ChatRow[], nextTotal: number) => {
    rowsRef.current = nextRows;
    totalRef.current = nextTotal;
    setRows(nextRows);
    setTotal(nextTotal);
  }, []);

  const highlightRows = useCallback((ids: number[]) => {
    if (ids.length === 0) return;
    if (highlightTimerRef.current !== null) {
      window.clearTimeout(highlightTimerRef.current);
    }
    setNewIds(new Set(ids));
    highlightTimerRef.current = window.setTimeout(() => {
      highlightTimerRef.current = null;
      setNewIds(new Set<number>());
    }, NEW_HIGHLIGHT_MS);
  }, []);

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    let requestTimer: number | undefined;
    let pollTimer: number | undefined;

    function schedulePoll() {
      if (!active) return;
      pollTimer = window.setTimeout(() => {
        void poll();
      }, POLL_INTERVAL_MS);
    }

    function mergeIncoming(history: ChatHistory, animate: boolean) {
      const previousIds = new Set(rowsRef.current.map((row) => row.id));
      const next = mergeRows(rowsRef.current, history.rows);
      applyRows(next, history.total);
      if (animate) {
        const fresh = history.rows
          .filter((row) => !previousIds.has(row.id))
          .map((row) => row.id);
        highlightRows(Array.from(new Set(fresh)));
      }
    }

    async function loadSnapshot() {
      controller = new AbortController();
      const current = controller;
      requestTimer = window.setTimeout(
        () => current.abort(),
        REQUEST_TIMEOUT_MS,
      );

      const statusPromise = fetchChatSessions(current.signal);
      const historyPromise = fetchChatHistory(current.signal, PAGE_SIZE, 0);
      const statusResult = await settle(statusPromise);
      const historyResult = await settle(historyPromise);

      if (requestTimer !== undefined) {
        window.clearTimeout(requestTimer);
        requestTimer = undefined;
      }
      if (!active) return;

      const wasDemo = modeRef.current === "demo";
      const firstLoad = !loadedOnceRef.current;

      if (!statusResult.ok) {
        if (firstLoad || wasDemo) {
          setSessions(DEMO_CHAT_SESSIONS);
          applyMode("demo");
          applyRows(DEMO_CHAT_ROWS, DEMO_CHAT_TOTAL);
        }
        // A failed manual refresh keeps the previous live snapshot.
      } else {
        setSessions(statusResult.value);
        applyMode("live");

        if (historyResult.ok) {
          if (firstLoad || wasDemo) {
            applyRows(historyResult.value.rows, historyResult.value.total);
          } else {
            patchRows(historyResult.value);
          }
        } else if (wasDemo) {
          applyRows([], 0);
        }
      }

      loadedOnceRef.current = true;
      setLoading(false);
      refreshingRef.current = false;
      setRefreshing(false);
      schedulePoll();
    }

    function patchRows(history: ChatHistory) {
      const next = mergeRows(rowsRef.current, history.rows);
      applyRows(next, history.total);
    }

    async function poll() {
      controller = new AbortController();
      const current = controller;
      requestTimer = window.setTimeout(
        () => current.abort(),
        REQUEST_TIMEOUT_MS,
      );

      const statusPromise = fetchChatSessions(current.signal);
      const wantHistory =
        selectedKeyRef.current !== null ||
        modeRef.current === "demo" ||
        rowsRef.current.length === 0;
      const historyPromise = wantHistory
        ? fetchChatHistory(current.signal, PAGE_SIZE, 0)
        : null;

      const statusResult = await settle(statusPromise);
      const historyResult = historyPromise
        ? await settle(historyPromise)
        : null;

      if (requestTimer !== undefined) {
        window.clearTimeout(requestTimer);
        requestTimer = undefined;
      }
      if (!active) return;

      if (statusResult.ok) {
        const wasDemo = modeRef.current === "demo";
        setSessions(statusResult.value);

        if (wasDemo) {
          applyMode("live");
          if (historyResult?.ok) {
            applyRows(historyResult.value.rows, historyResult.value.total);
          } else {
            applyRows([], 0);
          }
        } else if (historyResult?.ok) {
          mergeIncoming(historyResult.value, true);
        }
      }

      schedulePoll();
    }

    void loadSnapshot();

    return () => {
      active = false;
      if (pollTimer !== undefined) window.clearTimeout(pollTimer);
      if (requestTimer !== undefined) window.clearTimeout(requestTimer);
      controller?.abort();
    };
  }, [refreshToken, applyMode, applyRows, highlightRows]);

  /** Manual refresh: re-runs the bootstrap cycle and updates the spin state. */
  const refresh = useCallback(() => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setRefreshToken((value) => value + 1);
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current) return;
    if (rowsRef.current.length >= totalRef.current) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(
      () => controller.abort(),
      REQUEST_TIMEOUT_MS,
    );

    try {
      const history = await fetchChatHistory(
        controller.signal,
        PAGE_SIZE,
        rowsRef.current.length,
      );
      if (!mountedRef.current) return;
      applyRows(mergeRows(rowsRef.current, history.rows), history.total);
    } catch {
      // Loading older messages is best-effort; keep the current page visible.
    } finally {
      window.clearTimeout(timeout);
      loadingMoreRef.current = false;
      if (mountedRef.current) setLoadingMore(false);
    }
  }, [applyRows]);

  const isDemo = mode === "demo";

  return {
    mode,
    loading,
    sessions: isDemo ? DEMO_CHAT_SESSIONS : sessions,
    rows: isDemo ? DEMO_CHAT_ROWS : rows,
    total: isDemo ? DEMO_CHAT_TOTAL : total,
    newIds,
    refresh,
    refreshing,
    loadMore,
    loadingMore,
  };
}
