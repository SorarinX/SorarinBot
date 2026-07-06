<script setup lang="ts">
defineProps<{
  collapsed?: boolean
}>()

const { status, isRunning } = useStatus()
</script>

<template>
  <UButton
    color="neutral"
    variant="ghost"
    block
    :square="collapsed"
    class="data-[state=open]:bg-elevated justify-start"
    :class="[!collapsed && 'py-2']"
  >
    <template #leading>
      <img src="/logo.png" alt="SorarinBot" class="size-6 rounded-md" />
    </template>
    <template v-if="!collapsed">
      <div class="flex flex-col items-start">
        <span class="text-sm font-medium">SorarinBot</span>
        <span class="text-xs text-muted flex items-center gap-1">
          <span
            class="size-1.5 rounded-full"
            :class="isRunning ? 'bg-success' : 'bg-error'"
          />
          {{ isRunning ? '运行中' : '离线' }}
        </span>
      </div>
    </template>
  </UButton>
</template>
