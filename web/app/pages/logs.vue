<script setup lang="ts">
const { logs, loading, refresh: fetchLogs } = useLogs(500)
const toast = useToast()

async function handleRefresh() {
  await fetchLogs()
}

async function handleClear() {
  try {
    await $fetch('/api/logs', { method: 'DELETE' })
    await fetchLogs()
    toast.add({ title: '日志已清空', color: 'success' })
  } catch {
    toast.add({ title: '清空失败', color: 'error' })
  }
}

// Parse log string "level | message | timestamp"
function parseLog(raw: string) {
  const parts = raw.split(' | ')
  if (parts.length >= 3) {
    return {
      level: parts[0],
      message: parts.slice(1, -1).join(' | '),
      time: parts[parts.length - 1],
    }
  }
  return { level: '', message: raw, time: '' }
}

function levelColor(level: string) {
  switch (level) {
    case 'error': return 'text-error'
    case 'warn': return 'text-warning'
    case 'info': return 'text-primary'
    case 'debug': return 'text-muted'
    default: return 'text-muted'
  }
}
</script>

<template>
  <UDashboardPanel id="logs">
    <template #header>
      <UDashboardNavbar title="系统日志" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-trash-2"
            variant="outline"
            color="error"
            size="sm"
            @click="handleClear"
          >
            清空
          </UButton>
          <UButton
            icon="i-lucide-refresh-cw"
            variant="outline"
            color="neutral"
            size="sm"
            :loading="loading"
            @click="handleRefresh"
          >
            刷新
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UCard>
        <div v-if="loading" class="space-y-2 py-4">
          <USkeleton v-for="i in 10" :key="i" class="h-4 w-full" />
        </div>

        <div v-else-if="(logs ?? []).length === 0" class="py-12 text-center">
          <UIcon name="i-lucide-file-text" class="size-12 text-muted mx-auto mb-3" />
          <p class="text-sm text-muted">暂无日志</p>
        </div>

        <div v-else class="font-mono text-xs space-y-0.5 max-h-[calc(100vh-200px)] overflow-y-auto">
          <div
            v-for="(l, i) in logs"
            :key="i"
            class="flex gap-2 py-1 px-2 rounded hover:bg-elevated transition-colors"
          >
            <span class="text-muted shrink-0 w-20 text-right">{{ parseLog(l).time?.slice(11, 19) }}</span>
            <span class="shrink-0 w-10 uppercase font-medium" :class="levelColor(parseLog(l).level ?? '')">
              {{ parseLog(l).level }}
            </span>
            <span class="break-all">{{ parseLog(l).message }}</span>
          </div>
        </div>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
