// Auto-start composable — toggles system boot startup

export function useAutostart() {
  const { data, error, loading, refresh } = useApi<{ enabled: boolean }>('/api/autostart')

  const enabled = computed(() => data.value?.enabled ?? false)

  async function toggle(value: boolean) {
    const { data: result } = await useFetch('/api/autostart', {
      method: 'PUT',
      body: { enabled: value },
    })
    await refresh()
    return result.value
  }

  return { enabled, loading, error, toggle, refresh }
}
