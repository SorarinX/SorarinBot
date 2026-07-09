<script setup lang="ts">
const { status, refresh: refreshStatus } = useStatus()
const { messages, refresh: refreshHistory } = useHistory(100)
const scrollRef = ref<HTMLElement>()

const sessions = computed(() => status.value?.sessions ?? [])

type SessionItem = { user: string; room: string; lastMsg: string; count: number; time: string; isGroup: boolean }

const sessionList = computed(() => {
  const map = new Map<string, SessionItem>()
  for (const msg of messages.value as Record<string, unknown>[]) {
    const sender = String(msg.sender || '')
    if (!sender) continue
    const room = String(msg.room || '')
    const key = room ? `group:${room}` : `private:${sender}`
    const existing = map.get(key)
    if (existing) {
      existing.count++
      existing.lastMsg = String(msg.user_message || '')
      existing.time = String(msg.created_at || '')
    } else {
      map.set(key, { user: sender, room, lastMsg: String(msg.user_message || ''), count: 1, time: String(msg.created_at || ''), isGroup: !!room })
    }
  }
  return Array.from(map.values())
})

const category = ref<'all' | 'private' | 'group'>('all')
const selectedKey = ref('')

const filteredSessions = computed(() => {
  if (category.value === 'private') return sessionList.value.filter(s => !s.isGroup)
  if (category.value === 'group') return sessionList.value.filter(s => s.isGroup)
  return sessionList.value
})

const userMessages = computed(() => {
  if (!selectedKey.value) return ([...messages.value] as Record<string, unknown>[]).reverse()
  const [type, ...nameParts] = selectedKey.value.split(':')
  const name = nameParts.join(':')
  const list = (messages.value as Record<string, unknown>[]).filter(m => {
    if (type === 'group') return m.room === name
    return m.sender === name && !m.room
  })
  return [...list].reverse()
})

watch(userMessages, () => {
  nextTick(() => { if (scrollRef.value) scrollRef.value.scrollTop = scrollRef.value.scrollHeight })
}, { immediate: true })

onMounted(() => { setInterval(() => { refreshStatus(); refreshHistory() }, 10000) })

async function handleRefresh() {
  await refreshStatus()
  await refreshHistory()
}

function formatTime(ts: unknown): string {
  const s = String(ts || '')
  if (s.length < 16) return ''
  const time = s.slice(11, 16)
  const date = s.slice(0, 10)
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  if (date === today) return time
  const d = new Date(s.replace(' ', 'T'))
  const diff = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (diff <= 0) return time
  if (diff === 1) return '昨天'
  if (diff <= 7) return `${diff}天前`
  return '7天前'
}
</script>

<template>
  <UDashboardPanel id="chat">
    <template #header>
      <UDashboardNavbar title="聊天会话" :ui="{ right: 'gap-3' }">
        <template #leading><UDashboardSidebarCollapse /></template>
        <template #right>
          <UButton icon="i-lucide-refresh-cw" variant="outline" color="neutral" size="sm" @click="handleRefresh">刷新</UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="flex h-[calc(100vh-120px)]">
        <!-- Session list -->
        <div class="w-72 border-r border-default shrink-0 overflow-y-auto">
          <div class="p-2">
            <div class="flex gap-1 mb-2 px-1">
              <button
                v-for="cat in [{ key: 'all', label: '全部' }, { key: 'private', label: '私信' }, { key: 'group', label: '群聊' }]"
                :key="cat.key"
                class="flex-1 py-1 text-xs rounded-md transition-colors"
                :class="category === cat.key ? 'bg-primary text-white' : 'text-muted hover:bg-elevated'"
                @click="category = cat.key as 'all' | 'private' | 'group'; selectedKey = ''"
              >{{ cat.label }}</button>
            </div>

            <div
              class="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors"
              :class="!selectedKey ? 'bg-elevated' : 'hover:bg-elevated/50'"
              @click="selectedKey = ''"
            >
              <UIcon name="i-lucide-users" class="size-4 text-muted" />
              <span class="text-sm">全部会话</span>
              <UBadge variant="subtle" size="xs" class="ml-auto">{{ filteredSessions.length }}</UBadge>
            </div>

            <div
              v-for="s in filteredSessions"
              :key="s.isGroup ? `group:${s.room}` : `private:${s.user}`"
              class="flex items-start gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors"
              :class="selectedKey === (s.isGroup ? `group:${s.room}` : `private:${s.user}`) ? 'bg-elevated' : 'hover:bg-elevated/50'"
              @click="selectedKey = s.isGroup ? `group:${s.room}` : `private:${s.user}`"
            >
              <div class="size-8 rounded-full flex items-center justify-center shrink-0" :class="s.isGroup ? 'bg-warning/10' : 'bg-primary/10'">
                <UIcon :name="s.isGroup ? 'i-lucide-users' : 'i-lucide-user'" class="size-4" :class="s.isGroup ? 'text-warning' : 'text-primary'" />
              </div>
              <div class="min-w-0 flex-1">
                <div class="flex items-center justify-between">
                  <span class="text-sm font-medium truncate">{{ s.isGroup ? s.room : s.user }}</span>
                  <span class="text-xs text-muted">{{ formatTime(s.time) }}</span>
                </div>
                <p class="text-xs text-muted truncate mt-0.5">
                  <span v-if="s.isGroup">{{ s.user }}: </span>{{ s.lastMsg }}
                </p>
              </div>
            </div>
          </div>
        </div>

        <!-- Messages -->
        <div class="flex-1 flex flex-col min-w-0">
          <div ref="scrollRef" class="flex-1 overflow-y-auto p-4 space-y-3">
            <template v-for="msg in userMessages" :key="msg.id">
              <!-- User message -->
              <div v-if="msg.user_message" class="flex gap-3 items-end justify-end">
                <div class="flex flex-col items-end gap-1">
                  <div class="rounded-lg px-3 py-2 bg-primary text-white" style="max-width: fit-content;">
                    <p class="text-sm whitespace-pre-wrap">{{ msg.user_message }}</p>
                  </div>
                  <span class="text-xs text-muted pr-1">{{ formatTime(msg.created_at) }}</span>
                </div>
                <div class="size-8 rounded-full bg-neutral/20 flex items-center justify-center shrink-0">
                  <UIcon name="i-lucide-user" class="size-4 text-muted" />
                </div>
              </div>

              <!-- Bot reply -->
              <div v-if="msg.bot_reply" class="flex gap-3 items-end">
                <img src="/logo.png" alt="SorarinBot" class="size-8 rounded-full shrink-0 object-cover" />
                <div class="flex flex-col gap-1">
                  <div class="rounded-lg px-3 py-2 bg-elevated max-w-[70%]">
                    <p class="text-sm whitespace-pre-wrap">{{ msg.bot_reply }}</p>
                  </div>
                  <span class="text-xs text-muted pl-1">{{ formatTime(msg.created_at) }} · {{ msg.total_tokens }} tokens</span>
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
