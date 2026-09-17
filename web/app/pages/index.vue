<script setup lang="ts">
const { status, isRunning, uptime, refresh: refreshStatus } = useStatus()
const { logs, refresh: refreshLogs } = useLogs(50)
const {
  state: loginState,
  label: loginLabel,
  color: loginColor,
  needsScan,
  hasFailed,
  qrUrl,
  lastError,
  attempts,
  retrying,
  requestRetry,
  refresh: refreshLogin,
} = useLogin()

// P5-5: sessions are structured objects; the stable key drives identity
// and `display` is the human-readable label.
const sessions = computed(() => status.value?.sessions ?? [])

const startupAt = computed(() => {
  if (!status.value?.startup_at) return '—'
  return status.value.startup_at.slice(0, 19).replace('T', ' ')
})

const isLoggedIn = computed(() => loginState.value === 'logged_in')

onMounted(() => {
  const timer = setInterval(() => {
    refreshStatus()
    refreshLogs()
    refreshLogin()
  }, 5000)
  onUnmounted(() => clearInterval(timer))
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
        <!-- Login attention banner (P5-9): shown only when the operator
             needs to act — scan required or login has failed. -->
        <UAlert
          v-if="needsScan"
          color="warning"
          variant="subtle"
          icon="i-lucide-qr-code"
          title="需要扫码登录微信"
          :description="qrUrl
            ? '请在微信中扫描二维码完成登录。二维码也可在程序控制台查看。'
            : '正在获取二维码，请稍候…'"
        >
          <template #actions>
            <UButton
              v-if="qrUrl"
              :to="qrUrl"
              target="_blank"
              color="warning"
              variant="solid"
              size="sm"
              label="打开二维码链接"
            />
          </template>
        </UAlert>

        <UAlert
          v-else-if="hasFailed"
          color="error"
          variant="subtle"
          icon="i-lucide-alert-triangle"
          title="微信登录失败，后台仍可正常使用"
          :description="lastError || 'Token 已失效或网络不可达。修复后点击重新登录。'"
        >
          <template #actions>
            <UButton
              color="error"
              variant="solid"
              size="sm"
              :loading="retrying"
              label="重新登录"
              @click="requestRetry"
            />
          </template>
        </UAlert>

        <UAlert
          v-else-if="loginState === 'hot_logging_in'"
          color="info"
          variant="subtle"
          icon="i-lucide-loader"
          title="正在使用已保存的登录态登录微信…"
        />

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

          <!-- 微信登录状态 (P5-3) -->
          <UCard>
            <div class="flex items-start justify-between">
              <div class="space-y-1">
                <p class="text-sm text-muted font-medium flex items-center gap-1.5">
                  <UIcon name="i-lucide-message-circle" class="size-3.5" />
                  微信登录
                </p>
                <p class="text-lg font-semibold flex items-center gap-2">
                  <UBadge :color="loginColor as any" variant="subtle" size="sm">{{ loginLabel }}</UBadge>
                </p>
                <p v-if="attempts > 0 && !isLoggedIn" class="text-xs text-muted">
                  已尝试 {{ attempts }} 次
                </p>
              </div>
              <div class="flex items-center justify-center size-10 rounded-lg bg-primary/10 text-primary">
                <UIcon name="i-lucide-qr-code" class="size-5" />
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

          <!-- 活跃会话 -->
          <UCard>
            <div class="flex items-start justify-between">
              <div class="space-y-1">
                <p class="text-sm text-muted font-medium flex items-center gap-1.5">
                  <UIcon name="i-lucide-users" class="size-3.5" />
                  活跃会话
                </p>
                <p class="text-2xl font-semibold tracking-tight">{{ sessions.length }}</p>
                <p class="text-xs text-muted">当前连接</p>
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
                  日志条数
                </p>
                <p class="text-2xl font-semibold tracking-tight">{{ (logs ?? []).length }}</p>
                <p class="text-xs text-muted">系统运行日志</p>
              </div>
              <div class="flex items-center justify-center size-10 rounded-lg bg-warning/10 text-warning">
                <UIcon name="i-lucide-bar-chart" class="size-5" />
              </div>
            </div>
          </UCard>

          <!-- 响应状态 -->
          <UCard>
            <div class="flex items-start justify-between">
              <div class="space-y-1">
                <p class="text-sm text-muted font-medium flex items-center gap-1.5">
                  <UIcon name="i-lucide-check-circle" class="size-3.5" />
                  服务状态
                </p>
                <p class="text-lg font-semibold">{{ isRunning ? '正常' : '异常' }}</p>
                <p class="text-xs text-muted">{{ status?.provider || '—' }}</p>
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
                :key="s.key"
                class="flex items-center gap-2.5 py-1.5 px-2 rounded-lg hover:bg-elevated transition-colors"
              >
                <span class="size-1.5 rounded-full bg-success shrink-0" />
                <UIcon
                  :name="s.kind === 'group' ? 'i-lucide-users' : 'i-lucide-user'"
                  class="size-3.5 text-muted shrink-0"
                />
                <span class="text-sm truncate" :title="s.key">{{ s.display || s.key }}</span>
                <UBadge variant="subtle" size="sm" class="ml-auto shrink-0">
                  {{ s.pairs }} 轮
                </UBadge>
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
