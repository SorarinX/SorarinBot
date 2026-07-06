<script setup lang="ts">
const { logs, loading, refresh: fetchLogs } = useLogs(500)

async function handleRefresh() {
  await fetchLogs()
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
            class="py-1 px-2 rounded hover:bg-elevated transition-colors"
          >
            {{ l }}
          </div>
        </div>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
