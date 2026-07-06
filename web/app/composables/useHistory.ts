// Chat history composable — fetch paginated message history

interface HistoryResponse {
  rows: Record<string, unknown>[]
  total: number
}

export function useHistory(limit = 50) {
  const page = ref(1)

  const url = computed(() => {
    const offset = (page.value - 1) * limit
    return `/api/history?limit=${limit}&offset=${offset}`
  })

  const { data, error, loading, refresh } = useApi<HistoryResponse>(url)

  const messages = computed(() => data.value?.rows ?? [])
  const total = computed(() => data.value?.total ?? 0)

  function prevPage() {
    if (page.value > 1) {
      page.value--
    }
  }

  function nextPage() {
    if (page.value * limit < total.value) {
      page.value++
    }
  }

  return {
    messages,
    total,
    error,
    loading,
    refresh,
    page,
    prevPage,
    nextPage,
  }
}
