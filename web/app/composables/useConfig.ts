// Config composable — read and update SorarinBot configuration
import type { AppConfig } from '~/types'

export function useConfig() {
  const { data, error, loading, refresh } = useApi<AppConfig>('/api/config')

  const updateConfig = async (updates: {
    provider_name?: string
    base_url?: string
    model?: string
    prompt?: string
    api_key?: string
  }): Promise<boolean> => {
    try {
      const response = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      })
      const result = await response.json()
      if (result.status === 'ok') {
        await refresh()
        return true
      }
      return false
    } catch {
      return false
    }
  }

  const testConnection = async () => {
    try {
      const response = await fetch('/api/test', { method: 'POST' })
      return await response.json()
    } catch (err) {
      return { ok: false, error: String(err) }
    }
  }

  const fetchModels = async (): Promise<string[]> => {
    try {
      const response = await fetch('/api/models')
      const result = await response.json()
      if (result.ok && result.models) {
        return result.models
      }
      return []
    } catch {
      return []
    }
  }

  return {
    config: data,
    error,
    loading,
    refresh,
    updateConfig,
    testConnection,
    fetchModels,
  }
}
