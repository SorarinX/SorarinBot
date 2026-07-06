<script setup lang="ts">
const { config, updateConfig } = useConfig()
const toast = useToast()

const promptText = ref('')
const saving = ref(false)

watch(config, (cfg) => {
  if (cfg) {
    promptText.value = cfg.prompt
  }
}, { immediate: true })

async function handleSave() {
  saving.value = true
  const ok = await updateConfig({ prompt: promptText.value })
  saving.value = false
  if (ok) {
    toast.add({ title: '✓ 提示词已保存', color: 'success' })
  } else {
    toast.add({ title: '✗ 保存失败', color: 'error' })
  }
}
</script>

<template>
  <div>
    <UPageCard
      title="系统提示词"
      description="定义 AI 助手的角色和行为"
      variant="naked"
      orientation="horizontal"
      class="mb-4"
    >
      <UButton
        label="保存提示词"
        color="neutral"
        :loading="saving"
        class="w-fit lg:ms-auto"
        @click="handleSave"
      />
    </UPageCard>

    <UPageCard variant="subtle">
      <UFormField
        label="System Prompt"
        description="输入系统提示词，定义 AI 的人格和行为规则"
        class="flex max-sm:flex-col justify-between items-start gap-4"
        :ui="{ container: 'w-full' }"
      >
        <UTextarea
          v-model="promptText"
          :rows="12"
          autoresize
          class="w-full"
          placeholder="输入系统提示词…"
        />
      </UFormField>
    </UPageCard>
  </div>
</template>
