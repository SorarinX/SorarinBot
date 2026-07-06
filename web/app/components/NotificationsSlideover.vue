<script setup lang="ts">
const { isNotificationsSlideoverOpen } = useDashboard()

const notifications = ref<Array<{
  id: number
  title: string
  body: string
  time: string
  read: boolean
}>>([])
</script>

<template>
  <USlideover
    v-model:open="isNotificationsSlideoverOpen"
    title="通知"
  >
    <template #body>
      <div v-if="notifications.length === 0" class="flex items-center justify-center h-32">
        <div class="text-center space-y-2">
          <UIcon name="i-lucide-bell-off" class="size-8 text-muted mx-auto" />
          <p class="text-sm text-muted">暂无通知</p>
        </div>
      </div>
    </template>
  </USlideover>
</template>
