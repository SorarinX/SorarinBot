<script setup lang="ts">
const { status, isRunning, uptime, refresh: refreshStatus } = useStatus()
const { config, refresh: refreshConfig } = useConfig()
const { messages, total, refresh: refreshHistory } = useHistory(50)
const { logs, refresh: refreshLogs } = useLogs(50)

const sessions = computed(() => status.value?.sessions ?? [])

const todayCount = computed(() => {
  const rows = messages.value as Record<string, unknown>[]
  if (!rows.length) return 0
  const d = new Date()
  const ymd = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return rows.filter(r => String(r.created_at || '').startsWith(ymd)).length
})

const totalTokens = computed(() => {
  const rows = messages.value as Record<string, unknown>[]
  return rows.reduce((s, r) => s + (Number(r.total_tokens) || 0), 0)
})

const startupAt = computed(() => {
  if (!status.value?.startup_at) return '—'
  return status.value.startup_at.slice(0, 19).replace('T', ' ')
})

onMounted(() => {
  setInterval(() => {
    refreshStatus()
    refreshHistory()
    refreshLogs()
  }, 5000)
})
</script>

<template>
  <UDashboardPanel id="home">
    <template #header>
      <UDashboardNavbar title="仪表盘" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <!-- 6 Stat Cards -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          <!-- 运行状态 -->
          <UCard>
            <div class="flex items-start justify-between">
              <div class="space-y-1">
                <p class="text-sm text-muted font-medium flex items-center gap-1.5">
                  <span class="size-2 rounded-full" :class="isRunning ? 'bg-success' : 'bg-error'" />
                  运行状态
                </p>
                <p class="text-2xl font-semibold tracking-tight">
                  {{ isRunning ? '运行中' : '离线' }}
                </p>
                <p class="text-xs text-muted">启动于 {{ startupAt }}</p>
              </div>
              <div class="flex items-center justify-center size-10 rounded-lg bg-success/10 text-success">
                <UIcon name="i-lucide-activity" class="size-5" />
              </div>
            </div>
          </UCard>

          <!-- 当前 Provider -->
          <UCard>
            <div class="flex items-start justify-between">
              <div class="space-y-1">
                <p class="text-sm text-muted font-medium flex items-center gap-1.5">
                  <UIcon name="i-lucide-server" class="size-3.5" />
                  当前 Provider
                </p>
                <p class="text-lg font-semibold">{{ status?.provider || '—' }}</p>
                <p class="text-xs text-muted truncate max-w-48" :title="status?.model">{{ status?.model || '—' }}</p>
              </div>
              <div class="flex items-center justify-center size-10 rounded-lg bg-primary/10 text-primary">
                <UIcon name="i-lucide-cpu" class="size-5" />
              </div>
            </div>
          </UCard>

          <!-- 今日消息 -->
          <UCard>
            <div class="flex items-start justify-between">
              <div class="space-y-1">
                <p class="text-sm text-muted font-medium flex items-center gap-1.5">
                  <UIcon name="i-lucide-trending-up" class="size-3.5" />
                  今日消息
                </p>
                <p class="text-2xl font-semibold tracking-tight">{{ todayCount }}</p>
                <p class="text-xs text-muted">总计 {{ total }} 条记录</p>
              </div>
              <div class="flex items-center justify-center size-10 rounded-lg bg-primary/10 text-primary">
                <UIcon name="i-lucide-message-square" class="size-5" />
              </div>
            </div>
          </UCard>

          <!-- Token 消耗 -->
          <UCard>
            <div class="flex items-start justify-between">
              <div class="space-y-1">
                <p class="text-sm text-muted font-medium flex items-center gap-1.5">
                  <UIcon name="i-lucide-coins" class="size-3.5" />
                  Token 消耗
                </p>
                <p class="text-2xl font-semibold tracking-tight">{{ totalTokens }}</p>
                <p class="text-xs text-muted">包含 prompt + completion</p>
              </div>
              <div class="flex items-center justify-center size-10 rounded-lg bg-warning/10 text-warning">
                <UIcon name="i-lucide-bar-chart" class="size-5" />
              </div>
            </div>
          </UCard>

          <!-- 响应成功率 -->
          <UCard>
            <div class="flex items-start justify-between">
              <div class="space-y-1">
                <p class="text-sm text-muted font-medium flex items-center gap-1.5">
                  <UIcon name="i-lucide-check-circle" class="size-3.5" />
                  响应成功率
                </p>
                <p class="text-lg font-semibold">{{ total ? '100%' : '—' }}</p>
                <p class="text-xs text-muted">基于 {{ total }} 次对话</p>
              </div>
              <div class="flex items-center justify-center size-10 rounded-lg bg-success/10 text-success">
                <UIcon name="i-lucide-shield-check" class="size-5" />
              </div>
            </div>
          </UCard>

          <!-- 最近日志 -->
          <UCard>
            <div class="flex items-start justify-between">
              <div class="space-y-1">
                <p class="text-sm text-muted font-medium flex items-center gap-1.5">
                  <UIcon name="i-lucide-file-text" class="size-3.5" />
                  最近日志
                </p>
                <p class="text-lg font-semibold">{{ (logs ?? []).length }} 条</p>
                <p class="text-xs text-muted">切换至日志页查看详情</p>
              </div>
              <div class="flex items-center justify-center size-10 rounded-lg bg-primary/10 text-primary">
                <UIcon name="i-lucide-terminal" class="size-5" />
              </div>
            </div>
          </UCard>
        </div>

        <!-- 活跃会话 + 最近日志 -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-3">
          <!-- 活跃会话 -->
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">活跃会话</span>
                <UBadge variant="subtle" size="sm">{{ sessions.length }} 个</UBadge>
              </div>
            </template>
            <div v-if="sessions.length === 0" class="py-4 text-center text-sm text-muted">
              暂无活跃会话
            </div>
            <div v-else class="space-y-1">
              <div
                v-for="s in sessions"
                :key="s"
                class="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-elevated transition-colors"
              >
                <span class="size-1.5 rounded-full bg-success shrink-0" />
                <span class="text-sm">{{ s }}</span>
              </div>
            </div>
          </UCard>

          <!-- 最近日志 -->
          <UCard>
            <template #header>
              <div class="flex items-center justify-between">
                <span class="text-sm font-medium">最近日志</span>
                <UBadge variant="subtle" size="sm">{{ (logs ?? []).length }} 条</UBadge>
              </div>
            </template>
            <div class="font-mono text-xs space-y-0.5 max-h-[280px] overflow-y-auto">
              <div
                v-for="(l, i) in (logs ?? []).slice(0, 20)"
                :key="i"
                class="text-muted"
              >
                {{ l }}
              </div>
              <div v-if="!(logs ?? []).length" class="text-muted py-4 text-center">
                暂无日志
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
