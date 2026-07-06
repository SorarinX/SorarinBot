<script setup lang="ts">
const { status, refresh: refreshStatus } = useStatus()
const { messages, refresh: refreshHistory } = useHistory(50)
const scrollRef = ref<HTMLElement>()

const sessions = computed(() => status.value?.sessions ?? [])

// Group messages by sender for session list
const sessionList = computed(() => {
  const map = new Map<string, { lastMsg: string; count: number; time: string }>()
  for (const msg of messages.value as Record<string, unknown>[]) {
    const sender = String(msg.sender || '')
    if (!sender) continue
    const existing = map.get(sender)
    if (existing) {
      existing.count++
      existing.lastMsg = String(msg.user_message || '')
      existing.time = String(msg.created_at || '')
    } else {
      map.set(sender, { lastMsg: String(msg.user_message || ''), count: 1, time: String(msg.created_at || '') })
    }
  }
  return Array.from(map.entries()).map(([user, info]) => ({ user, ...info }))
})

const selectedUser = ref('')

const userMessages = computed(() => {
  const list = selectedUser.value
    ? (messages.value as Record<string, unknown>[]).filter(m => m.sender === selectedUser.value)
    : messages.value as Record<string, unknown>[]
  // Oldest first, newest at bottom
  return [...list].reverse()
})

// Auto-scroll to bottom
watch(userMessages, () => {
  nextTick(() => {
    if (scrollRef.value) {
      scrollRef.value.scrollTop = scrollRef.value.scrollHeight
    }
  })
}, { immediate: true })

// Auto-refresh every 10s
onMounted(() => {
  setInterval(() => {
    refreshStatus()
    refreshHistory()
  }, 10000)
})

async function handleRefresh() {
  await refreshStatus()
  await refreshHistory()
}
</script>

<template>
  <UDashboardPanel id="chat">
    <template #header>
      <UDashboardNavbar title="聊天会话" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            icon="i-lucide-refresh-cw"
            variant="outline"
            color="neutral"
            size="sm"
            @click="handleRefresh"
          >
            刷新
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex h-[calc(100vh-120px)]">
        <!-- Session list -->
        <div class="w-64 border-r border-default shrink-0 overflow-y-auto">
          <div class="p-2">
            <div
              class="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors"
              :class="!selectedUser ? 'bg-elevated' : 'hover:bg-elevated/50'"
              @click="selectedUser = ''"
            >
              <UIcon name="i-lucide-users" class="size-4 text-muted" />
              <span class="text-sm">全部会话</span>
              <UBadge variant="subtle" size="xs" class="ml-auto">{{ sessions.length }}</UBadge>
            </div>
            <div
              v-for="s in sessionList"
              :key="s.user"
              class="flex items-start gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors"
              :class="selectedUser === s.user ? 'bg-elevated' : 'hover:bg-elevated/50'"
              @click="selectedUser = s.user"
            >
              <div class="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <UIcon name="i-lucide-user" class="size-4 text-primary" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium truncate">{{ s.user }}</span>
                  <span class="text-xs text-muted">{{ s.time?.slice(11, 16) }}</span>
                </div>
                <p class="text-xs text-muted truncate mt-0.5">{{ s.lastMsg }}</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Messages -->
        <div class="flex-1 flex flex-col min-w-0">
          <div ref="scrollRef" class="flex-1 overflow-y-auto p-4 space-y-4">
            <template v-for="msg in userMessages" :key="msg.id">
              <!-- User message (right, first) -->
              <div v-if="msg.user_message" class="flex gap-3 items-end justify-end">
                <div class="rounded-lg px-3 py-2 bg-primary text-primary-foreground" style="max-width: fit-content;">
                  <p class="text-sm whitespace-pre-wrap">{{ msg.user_message }}</p>
                  <div class="flex items-center gap-2 mt-1 justify-end">
                    <span class="text-xs opacity-60">{{ msg.sender }}</span>
                  </div>
                </div>
                <div class="size-8 rounded-full bg-neutral/20 flex items-center justify-center shrink-0">
                  <UIcon name="i-lucide-user" class="size-4 text-muted" />
                </div>
              </div>

              <!-- Bot reply (left, below user message) -->
              <div v-if="msg.bot_reply" class="flex gap-3 items-end">
                <img src="/logo.png" alt="SorarinBot" class="size-8 rounded-full shrink-0 object-cover" />
                <div class="rounded-lg px-3 py-2 bg-elevated max-w-[70%]">
                  <p class="text-sm whitespace-pre-wrap">{{ msg.bot_reply }}</p>
                  <div class="flex items-center gap-2 mt-1">
                    <span class="text-xs text-muted">{{ msg.created_at }}</span>
                    <span class="text-xs text-muted">{{ msg.total_tokens }} tokens</span>
                  </div>
                </div>
              </div>
            </template>

            <div v-if="userMessages.length === 0" class="flex items-center justify-center h-full">
              <div class="text-center space-y-2">
                <UIcon name="i-lucide-message-square" class="size-12 text-muted mx-auto" />
                <p class="text-muted">暂无聊天记录</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
