// Dashboard authentication state.
//
// The backend is the single source of truth: this composable only reads
// /api/auth/status and forwards login/logout. When the server has no
// admin.password_hash configured, `required` is false and the dashboard
// behaves exactly as it did before authentication existed — no login screen,
// no redirect.

export interface AuthStatus {
  /** Whether the server is configured to require a password. */
  required: boolean
  /** Whether this browser already holds a valid session. */
  authenticated: boolean
}

// Module-level so the route middleware and every page share one answer.
const status = ref<AuthStatus | null>(null)
const pending = ref(false)
const lastError = ref<string | null>(null)

export function useAuth() {
  const required = computed(() => status.value?.required ?? false)
  const authenticated = computed(() => status.value?.authenticated ?? true)
  const loaded = computed(() => status.value !== null)

  async function refresh(): Promise<AuthStatus | null> {
    try {
      const res = await fetch('/api/auth/status')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      status.value = await res.json()
      lastError.value = null
    } catch (err) {
      // A failed status probe must not lock the operator out of a server that
      // has no password at all, so fall back to "no auth required".
      status.value = { required: false, authenticated: true }
      lastError.value = err instanceof Error ? err.message : String(err)
    }
    return status.value
  }

  async function login(password: string): Promise<boolean> {
    pending.value = true
    lastError.value = null
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.ok) {
        lastError.value = body?.error || `登录失败 (HTTP ${res.status})`
        return false
      }
      await refresh()
      return true
    } catch (err) {
      lastError.value = err instanceof Error ? err.message : String(err)
      return false
    } finally {
      pending.value = false
    }
  }

  async function logout(): Promise<void> {
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
    } catch {
      // Clearing the cookie is best-effort; the redirect below still applies.
    }
    status.value = { required: true, authenticated: false }
  }

  // Called when any API call comes back 401, so an expired session sends the
  // operator back to the login screen instead of filling the page with errors.
  function markUnauthenticated(): void {
    status.value = { required: true, authenticated: false }
  }

  return {
    status,
    required,
    authenticated,
    loaded,
    pending,
    lastError,
    refresh,
    login,
    logout,
    markUnauthenticated,
  }
}
