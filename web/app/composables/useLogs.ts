// Logs composable — fetch system logs
// Go backend returns []string, not objects

export function useLogs(limit = 100) {
  const url = computed(() => `/api/logs?limit=${limit}`)
  const { data, error, loading, refresh } = useApi<string[]>(url)

  const logs = computed(() => data.value ?? [])

  return {
    logs,
    error,
    loading,
    refresh,
  }
}
