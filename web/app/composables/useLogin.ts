// Login state machine composable (P5-3).
//
// Mirrors the backend states exactly. The backend is the single source of
// truth: this composable only reads /api/login and requests retries.
import type { LoginStatus, LoginState } from '~/types'

export function useLogin() {
  const { data, error, loading, refresh } = useApi<LoginStatus>('/api/login')

  const state = computed<LoginState>(() => data.value?.state ?? 'idle')
  const isLoggedIn = computed(() => state.value === 'logged_in')
  const isBusy = computed(() =>
    state.value === 'hot_logging_in' || state.value === 'scanned',
  )
  const needsScan = computed(() =>
    state.value === 'waiting_scan' || state.value === 'scanned',
  )
  const hasFailed = computed(() => state.value === 'failed')
  const qrUrl = computed(() => data.value?.qr_url ?? '')
  const lastError = computed(() => data.value?.last_error ?? '')
  const attempts = computed(() => data.value?.attempts ?? 0)

  // Human-readable label and badge colour for the current state.
  const label = computed(() => {
    switch (state.value) {
      case 'logged_in': return '已登录'
      case 'hot_logging_in': return '登录中'
      case 'waiting_scan': return '等待扫码'
      case 'scanned': return '已扫码，请确认'
      case 'failed': return '登录失败'
      default: return '未开始'
    }
  })

  const color = computed(() => {
    switch (state.value) {
      case 'logged_in': return 'success'
      case 'failed': return 'error'
      case 'waiting_scan':
      case 'scanned': return 'warning'
      default: return 'neutral'
    }
  })

  const retrying = ref(false)

  // requestRetry asks the backend to re-run the login flow. It never
  // triggers a QR side effect by itself; the state machine decides.
  //
  // Returns void so it can be bound directly to a UI click handler.
  // Failures are surfaced through the existing `error` ref, which the
  // previous boolean return value never reached.
  async function requestRetry(): Promise<void> {
    retrying.value = true
    try {
      const res = await fetch('/api/login/retry', { method: 'POST' })
      const body = await res.json().catch(() => null)
      if (!body?.ok) {
        error.value = body?.error || `重试请求失败 (HTTP ${res.status})`
      }
      await refresh()
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
    } finally {
      retrying.value = false
    }
  }

  return {
    login: data,
    error,
    loading,
    state,
    label,
    color,
    isLoggedIn,
    isBusy,
    needsScan,
    hasFailed,
    qrUrl,
    lastError,
    attempts,
    retrying,
    requestRetry,
    refresh,
  }
}
