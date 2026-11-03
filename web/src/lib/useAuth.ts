import { useSyncExternalStore } from "react";

/** Shared authentication snapshot for the whole SPA. */
export type AuthState = {
  required: boolean;
  authenticated: boolean;
  loaded: boolean;
  /**
   * True when the initial /api/auth/status probe failed. The console stays
   * open in that case (A), but /login remains reachable so an operator can see
   * the login form and the "本地服务未启动" submit error (F).
   */
  probeFailed: boolean;
};

export type LoginResult = {
  ok: boolean;
  error?: string;
};

const INITIAL_STATE: AuthState = {
  required: false,
  authenticated: true,
  loaded: false,
  probeFailed: false,
};

let state: AuthState = INITIAL_STATE;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function setState(patch: Partial<AuthState>) {
  state = { ...state, ...patch };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AuthState {
  return state;
}

function readRecord(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null;
  }
  return payload as Record<string, unknown>;
}

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

async function fetchWithTimeout(
  path: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    return await fetch(path, {
      ...init,
      headers,
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    window.clearTimeout(timer);
  }
}

let statusPromise: Promise<void> | null = null;

/**
 * Reads the auth status exactly once per page load. A failure opens the console
 * (never locks the operator out of a no-password install) and marks the probe
 * as failed so /login can still be rendered for the backend-down demo.
 */
export function loadAuthStatus(): Promise<void> {
  if (statusPromise) return statusPromise;

  statusPromise = (async () => {
    try {
      const response = await fetchWithTimeout(
        "/api/auth/status",
        { method: "GET", headers: { Accept: "application/json" } },
        4_000,
      );
      const rawBody = await response.text();
      let payload: unknown = null;
      if (rawBody) {
        try {
          payload = JSON.parse(rawBody) as unknown;
        } catch {
          throw new Error("auth/status returned non-JSON");
        }
      }
      const record = readRecord(payload);
      if (
        !response.ok ||
        typeof record?.required !== "boolean" ||
        typeof record?.authenticated !== "boolean"
      ) {
        throw new Error("auth/status returned invalid data");
      }

      setState({
        required: record.required,
        authenticated: record.authenticated,
        loaded: true,
        probeFailed: false,
      });
    } catch {
      setState({
        required: false,
        authenticated: true,
        loaded: true,
        probeFailed: true,
      });
    }
  })();

  return statusPromise;
}

void loadAuthStatus();

/** POST /api/auth/login. Returns the server's error for the inline red text. */
export async function login(password: string): Promise<LoginResult> {
  try {
    const response = await fetchWithTimeout(
      "/api/auth/login",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      },
      10_000,
    );

    const rawBody = await response.text();
    let payload: unknown = null;
    if (rawBody) {
      try {
        payload = JSON.parse(rawBody) as unknown;
      } catch {
        payload = null;
      }
    }
    const record = readRecord(payload);

    if (!response.ok || record?.ok !== true) {
      const serverMessage = readString(record?.error);
      const fallback =
        response.status === 401
          ? "密码错误"
          : response.status >= 500
            ? "本地服务未启动"
            : "登录失败";
      return { ok: false, error: serverMessage || fallback };
    }

    setState({ authenticated: true, loaded: true, probeFailed: false });
    return { ok: true };
  } catch {
    return { ok: false, error: "本地服务未启动" };
  }
}

/** POST /api/auth/logout. Best effort: the local state is cleared regardless. */
export async function logout(): Promise<void> {
  try {
    await fetchWithTimeout(
      "/api/auth/logout",
      { method: "POST", headers: { Accept: "application/json" } },
      4_000,
    );
  } catch {
    /* The cookie clear is best effort; still leave the UI logged out. */
  }
  setState({ authenticated: false, loaded: true });
}

/** Called by the global 401 handler: an expired session must go to /login. */
export function markUnauthenticated(): void {
  setState({
    required: true,
    authenticated: false,
    loaded: true,
    probeFailed: false,
  });
}

export function useAuth() {
  return {
    ...useSyncExternalStore(subscribe, getSnapshot, getSnapshot),
    login,
    logout,
  };
}
