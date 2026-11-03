/** Small JSON request helper for the P3 admin pages.
 *
 * The Go handlers use json.Encoder without always setting a content type, so
 * parse the body instead of trusting headers. A timeout keeps the UI from
 * hanging when the local service is unreachable.
 */

const DEFAULT_TIMEOUT_MS = 15_000;

type UnauthorizedHandler = () => void;

let unauthorizedHandler: UnauthorizedHandler | null = null;

/** Registered by AuthGate; clears auth state and redirects to /login. */
export function setUnauthorizedHandler(handler: UnauthorizedHandler | null) {
  unauthorizedHandler = handler;
}

/**
 * Tells the app that the session expired. Safe to call from any fetch helper;
 * it does nothing until AuthGate has mounted and is idempotent at the route
 * level (the handler refuses to re-navigate when already on /login).
 */
export function notifyUnauthorized(): void {
  unauthorizedHandler?.();
}

export async function requestJson(
  path: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");

    const response = await fetch(path, {
      ...init,
      headers,
      cache: "no-store",
      signal: controller.signal,
    });

    if (response.status === 401) {
      notifyUnauthorized();
    }

    const rawBody = await response.text();
    let payload: unknown = null;

    if (rawBody) {
      try {
        payload = JSON.parse(rawBody) as unknown;
      } catch {
        if (response.ok) {
          throw new Error(`${path} 返回了非 JSON 内容`);
        }
      }
    }

    if (!response.ok) {
      throw new Error(`${path} 返回 HTTP ${response.status}`);
    }

    return payload;
  } finally {
    window.clearTimeout(timer);
  }
}

export function readRecord(payload: unknown): Record<string, unknown> | null {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    return null;
  }
  return payload as Record<string, unknown>;
}

export function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function errorText(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "请求失败";
}
