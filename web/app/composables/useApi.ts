// Base API composable — shared fetch wrapper for all API calls

interface UseApiOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  immediate?: boolean
}

interface UseApiReturn<T> {
  data: Ref<T | null>
  error: Ref<string | null>
  loading: Ref<boolean>
  execute: () => Promise<T | null>
  refresh: () => Promise<T | null>
}

export function useApi<T>(
  url: string | Ref<string> | (() => string),
  options: UseApiOptions = {}
): UseApiReturn<T> {
  const { method = 'GET', body, immediate = true } = options

  const data = ref<T | null>(null) as Ref<T | null>
  const error = ref<string | null>(null)
  const loading = ref(false)

  const resolveUrl = (): string => {
    if (typeof url === 'function') return url()
    if (isRef(url)) return url.value
    return url
  }

  const execute = async (): Promise<T | null> => {
    loading.value = true
    error.value = null

    try {
      const resolvedUrl = resolveUrl()
      const fetchOptions: RequestInit = { method }

      if (body && method !== 'GET') {
        fetchOptions.headers = { 'Content-Type': 'application/json' }
        fetchOptions.body = JSON.stringify(body)
      }

      const response = await fetch(resolvedUrl, fetchOptions)

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const result = await response.json()
      data.value = result
      return result
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      return null
    } finally {
      loading.value = false
    }
  }

  const refresh = () => execute()

  if (immediate) {
    execute()
  }

  return { data, error, loading, execute, refresh }
}
