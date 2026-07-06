<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const route = useRoute()
const open = ref(false)

const links = [[{
  label: '仪表盘',
  icon: 'i-lucide-layout-dashboard',
  to: '/',
  onSelect: () => { open.value = false }
}, {
  label: '聊天会话',
  icon: 'i-lucide-message-square',
  to: '/chat',
  onSelect: () => { open.value = false }
}, {
  label: '系统日志',
  icon: 'i-lucide-file-text',
  to: '/logs',
  onSelect: () => { open.value = false }
}, {
  label: '配置',
  to: '/settings',
  icon: 'i-lucide-settings',
  defaultOpen: true,
  type: 'trigger',
  children: [{
    label: 'Provider',
    to: '/settings',
    exact: true,
    onSelect: () => { open.value = false }
  }, {
    label: '系统提示词',
    to: '/settings/prompt',
    onSelect: () => { open.value = false }
  }]
}]] satisfies NavigationMenuItem[][]

const groups = computed(() => [{
  id: 'links',
  label: '导航',
  items: links.flat()
}])
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <TeamsMenu :collapsed="collapsed" />
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[0]"
          orientation="vertical"
          tooltip
          popover
        />
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="groups" />

    <slot />
  </UDashboardGroup>
</template>
