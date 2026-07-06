<script setup lang="ts">
const { status } = useStatus()

const sessions = computed(() => status.value?.sessions ?? [])

const tableData = computed(() => {
  return sessions.value.map((s, i) => ({
    id: i,
    user: s,
  }))
})
</script>

<template>
  <UDashboardPanel id="chat">
    <template #header>
      <UDashboardNavbar title="聊天会话" :ui="{ right: 'gap-3' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UCard>
        <UTable
          :data="tableData"
          :columns="[
            { accessorKey: 'user', header: '用户' },
          ]"
        >
          <template #empty>
            <div class="py-8 text-center text-sm text-muted">
              暂无活跃会话
            </div>
          </template>
        </UTable>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
