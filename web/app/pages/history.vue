<script setup lang="ts">
const { messages, total, loading, page, prevPage, nextPage } = useHistory(50)

const columns = [
  { accessorKey: 'sender', header: '发送者' },
  { accessorKey: 'user_message', header: '消息' },
  { accessorKey: 'bot_reply', header: '回复' },
  { accessorKey: 'model', header: '模型' },
  { accessorKey: 'total_tokens', header: 'Token' },
  { accessorKey: 'created_at', header: '时间' },
]
</script>

<template>
  <UDashboardPanel id="history">
    <template #header>
      <UDashboardNavbar title="消息记录" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UCard>
        <UTable
          :data="messages"
          :columns="columns"
          :loading="loading"
        >
          <template #empty>
            <div class="py-8 text-center text-sm text-muted">
              暂无消息记录
            </div>
          </template>
        </UTable>

        <template #footer>
          <div class="flex items-center justify-between">
            <span class="text-sm text-muted">共 {{ total }} 条记录</span>
            <div class="flex gap-1">
              <UButton
                size="xs"
                variant="outline"
                color="neutral"
                :disabled="page <= 1"
                @click="prevPage"
              >
                上一页
              </UButton>
              <UButton
                size="xs"
                variant="outline"
                color="neutral"
                :disabled="page * 50 >= total"
                @click="nextPage"
              >
                下一页
              </UButton>
            </div>
          </div>
        </template>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
