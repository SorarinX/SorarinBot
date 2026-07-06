// System status composable
import type { SystemStatus } from '~/types'

export function useStatus() {
  const { data, error, loading, refresh } = useApi<SystemStatus>('/api/status')

  const isRunning = computed(() => data.value?.status === 'running')
  const uptime = computed(() => {
    if (!data.value?.startup_at) return ''
    const start = new Date(data.value.startup_at)
    const now = new Date()
    const diff = now.getTime() - start.getTime()
    const hours = Math.floor(diff / 3600000)
    const minutes = Math.floor((diff % 3600000) / 60000)
    if (hours > 0) return `${hours}h ${minutes}m`
    return `${minutes}m`
  })

  return {
    status: data,
    error,
    loading,
    isRunning,
    uptime,
    refresh,
  }
}
