<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

defineProps<{
  collapsed?: boolean
}>()

const colorMode = useColorMode()
const appConfig = useAppConfig()

// 持久化主题设置
const savedPrimary = useLocalStorage('sorarinbot-primary-color', 'blue')
const savedNeutral = useLocalStorage('sorarinbot-neutral-color', 'slate')

// 初始化时恢复保存的颜色
onMounted(() => {
  if (savedPrimary.value) {
    appConfig.ui.colors.primary = savedPrimary.value
  }
  if (savedNeutral.value) {
    appConfig.ui.colors.neutral = savedNeutral.value
  }
})

const colors = ['red', 'orange', 'amber', 'yellow', 'lime', 'green', 'emerald', 'teal', 'cyan', 'sky', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink', 'rose']
const neutrals = ['slate', 'gray', 'zinc', 'neutral', 'stone']

const colorLabels: Record<string, string> = {
  red: '红色', orange: '橙色', amber: '琥珀', yellow: '黄色', lime: '青柠',
  green: '绿色', emerald: '翡翠', teal: '水鸭', cyan: '青色', sky: '天蓝',
  blue: '蓝色', indigo: '靛蓝', violet: '紫罗兰', purple: '紫色', fuchsia: '紫红',
  pink: '粉色', rose: '玫瑰'
}

const neutralLabels: Record<string, string> = {
  slate: '石板蓝', gray: '纯灰', zinc: '冷灰', neutral: '中性', stone: '暖灰'
}

const items = computed<DropdownMenuItem[][]>(() => ([[{
  type: 'label',
  label: 'SorarinBot'
}], [{
  label: '配置',
  icon: 'i-lucide-settings',
  to: '/settings'
}, {
  label: '系统日志',
  icon: 'i-lucide-file-text',
  to: '/logs'
}], [{
  label: '主题',
  icon: 'i-lucide-palette',
  children: [{
    label: '主色调',
    slot: 'chip',
    chip: appConfig.ui.colors.primary,
    content: { align: 'center', collisionPadding: 16 },
    children: colors.map(color => ({
      label: colorLabels[color] || color,
      chip: color,
      slot: 'chip',
      checked: appConfig.ui.colors.primary === color,
      type: 'checkbox',
      onSelect: (e: Event) => {
        e.preventDefault()
        appConfig.ui.colors.primary = color
        savedPrimary.value = color
      }
    }))
  }, {
    label: '中性色',
    slot: 'chip',
    chip: appConfig.ui.colors.neutral === 'neutral' ? 'old-neutral' : appConfig.ui.colors.neutral,
    content: { align: 'end', collisionPadding: 16 },
    children: neutrals.map(color => ({
      label: neutralLabels[color] || color,
      chip: color === 'neutral' ? 'old-neutral' : color,
      slot: 'chip',
      type: 'checkbox',
      checked: appConfig.ui.colors.neutral === color,
      onSelect: (e: Event) => {
        e.preventDefault()
        appConfig.ui.colors.neutral = color
        savedNeutral.value = color
      }
    }))
  }]
}, {
  label: '外观',
  icon: 'i-lucide-sun-moon',
  children: [{
    label: '浅色',
    icon: 'i-lucide-sun',
    type: 'checkbox',
    checked: colorMode.value === 'light',
    onSelect(e: Event) {
      e.preventDefault()
      colorMode.preference = 'light'
    }
  }, {
    label: '深色',
    icon: 'i-lucide-moon',
    type: 'checkbox',
    checked: colorMode.value === 'dark',
    onUpdateChecked(checked: boolean) {
      if (checked) colorMode.preference = 'dark'
    },
    onSelect(e: Event) {
      e.preventDefault()
    }
  }]
}]]))
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'center', collisionPadding: 12 }"
    :ui="{ content: collapsed ? 'w-48' : 'w-(--reka-dropdown-menu-trigger-width)' }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      block
      :square="collapsed"
      class="data-[state=open]:bg-elevated justify-start"
      :ui="{ trailingIcon: 'text-dimmed' }"
    >
      <template v-if="!collapsed">
        <span class="text-sm">管理</span>
      </template>
      <template v-if="!collapsed" #trailing>
        <UIcon name="i-lucide-chevrons-up-down" class="size-4 text-dimmed" />
      </template>
    </UButton>
  </UDropdownMenu>
</template>
