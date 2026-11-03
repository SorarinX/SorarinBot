import { useEffect, useState } from "react";

/** Mirrors the backend login state machine exposed by GET /api/login. */
export const LOGIN_STATES = [
  "idle",
  "hot_logging_in",
  "waiting_scan",
  "scanned",
  "logged_in",
  "failed",
] as const;

export type LoginState = (typeof LOGIN_STATES)[number];
export type LoginMode = "connecting" | "live" | "demo";

export type LoginSnapshot = {
  state: LoginState;
  attempts: number;
  qrUrl: string;
  lastError: string;
  /** live = backend answered; demo = unreachable/malformed, show the local fallback UI. */
  mode: LoginMode;
};

type LoginResponse = Omit<LoginSnapshot, "mode">;

const POLL_INTERVAL_MS = 2_000;
const REQUEST_TIMEOUT_MS = 4_000;

const INITIAL_SNAPSHOT: LoginSnapshot = {
  state: "idle",
  attempts: 0,
  qrUrl: "",
  lastError: "",
  mode: "connecting",
};

function isLoginState(value: unknown): value is LoginState {
  return (
    typeof value === "string" &&
    (LOGIN_STATES as readonly string[]).includes(value)
  );
}

function parseLoginResponse(payload: unknown): LoginResponse {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new Error("登录接口返回了无效数据");
  }

  const record = payload as Record<string, unknown>;
  if (!isLoginState(record.state)) {
    throw new Error("登录接口缺少有效的 state");
  }

  return {
    state: record.state,
    attempts:
      typeof record.attempts === "number" && Number.isFinite(record.attempts)
        ? Math.max(0, Math.trunc(record.attempts))
        : 0,
    qrUrl: typeof record.qr_url === "string" ? record.qr_url : "",
    lastError: typeof record.last_error === "string" ? record.last_error : "",
  };
}

async function fetchLoginStatus(signal: AbortSignal): Promise<LoginResponse> {
  const response = await fetch("/api/login", {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    throw new Error(`登录接口返回 HTTP ${response.status}`);
  }

  // Go's json.Encoder does not always set an application/json content type, so
  // parse the body instead of trusting the header. A Vite/SPA fallback returns
  // HTML here and naturally fails JSON.parse -> demo mode.
  const rawBody = await response.text();
  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    throw new Error("登录接口返回了非 JSON 内容");
  }

  return parseLoginResponse(payload);
}

/**
 * Reads /api/login immediately and every 2s afterwards.
 * Any network/parse/status failure downgrades to a quiet demo snapshot instead
 * of throwing, so the Welcome page never white-screens when the backend is down.
 */
export function useLoginStatus(): LoginSnapshot {
  const [snapshot, setSnapshot] = useState<LoginSnapshot>(INITIAL_SNAPSHOT);

  useEffect(() => {
    let active = true;
    let controller: AbortController | null = null;
    let nextPoll: ReturnType<typeof setTimeout> | undefined;
    let requestTimeout: ReturnType<typeof setTimeout> | undefined;

    function scheduleNextPoll() {
      if (!active) return;
      nextPoll = setTimeout(() => {
        void poll();
      }, POLL_INTERVAL_MS);
    }

    async function poll() {
      controller = new AbortController();
      requestTimeout = setTimeout(() => controller?.abort(), REQUEST_TIMEOUT_MS);

      try {
        const next = await fetchLoginStatus(controller.signal);
        if (!active) return;
        setSnapshot({ ...next, mode: "live" });
      } catch {
        if (!active) return;
        setSnapshot((current) => ({
          state: "waiting_scan",
          attempts: current.attempts,
          qrUrl: "",
          lastError: "",
          mode: "demo",
        }));
      } finally {
        if (requestTimeout) clearTimeout(requestTimeout);
        requestTimeout = undefined;
        scheduleNextPoll();
      }
    }

    void poll();

    return () => {
      active = false;
      if (nextPoll) clearTimeout(nextPoll);
      if (requestTimeout) clearTimeout(requestTimeout);
      controller?.abort();
    };
  }, []);

  return snapshot;
}
