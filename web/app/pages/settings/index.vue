<script setup lang="ts">
const { config, updateConfig, testConnection, fetchModels } = useConfig()
const toast = useToast()

const providerOptions = [
  { label: 'OpenAI Compatible', value: 'openaicompat' },
  { label: 'OpenAI', value: 'openai' },
  { label: 'DeepSeek', value: 'deepseek' },
  { label: 'MiniMax', value: 'minimax' },
  { label: 'Claude (Anthropic)', value: 'claude' },
  { label: 'GLM (智谱)', value: 'glm' },
  { label: 'Ollama (本地)', value: 'ollama' },
  { label: 'SiliconFlow', value: 'siliconflow' },
  { label: 'Moonshot (月之暗面)', value: 'moonshot' },
  { label: 'Qwen (通义千问)', value: 'qwen' },
  { label: 'Doubao (豆包)', value: 'doubao' },
]

const providerDefaults: Record<string, { base_url: string; model: string }> = {
  openaicompat: { base_url: '', model: '' },
  openai: { base_url: 'https://api.openai.com/v1', model: 'gpt-4o' },
  deepseek: { base_url: 'https://api.deepseek.com', model: 'deepseek-chat' },
  minimax: { base_url: 'https://api.minimaxi.com/v1', model: 'MiniMax-M3' },
  claude: { base_url: 'https://api.anthropic.com/v1', model: 'claude-sonnet-4-20250514' },
  glm: { base_url: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-flash' },
  ollama: { base_url: 'http://localhost:11434/v1', model: 'llama3' },
  siliconflow: { base_url: 'https://api.siliconflow.cn/v1', model: 'deepseek-ai/DeepSeek-V3' },
  moonshot: { base_url: 'https://api.moonshot.cn/v1', model: 'moonshot-v1-8k' },
  qwen: { base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-turbo' },
  doubao: { base_url: 'https://ark.cn-beijing.volces.com/api/v3', model: 'doubao-lite-4k' },
}

const form = reactive({
  name: '',
  baseUrl: '',
  model: '',
  apiKey: '',
})

const models = ref<string[]>([])
const modelErr = ref('')
const showKey = ref(false)
const testing = ref(false)
const testRes = ref<{ ok: boolean; latency_ms?: number; model?: string; error?: string } | null>(null)
const saving = ref(false)
const loadingModels = ref(false)

watch(config, (cfg) => {
  if (cfg) {
    form.name = cfg.provider.name
    form.baseUrl = cfg.provider.base_url
    form.model = cfg.provider.model
  }
}, { immediate: true })

function onProviderChange(val: string) {
  testRes.value = null
  models.value = []
  modelErr.value = ''
  const d = providerDefaults[val]
  if (d) {
    form.baseUrl = d.base_url
    form.model = d.model
  }
}

async function handleLoadModels() {
  loadingModels.value = true
  modelErr.value = ''
  models.value = []
  const result = await fetchModels()
  loadingModels.value = false
  if (result.length) {
    models.value = result
  } else {
    modelErr.value = '获取失败，请检查 Base URL 和 API Key'
  }
}

async function handleSave() {
  saving.value = true
  const ok = await updateConfig({
    provider_name: form.name,
    base_url: form.baseUrl,
    model: form.model,
    api_key: form.apiKey || undefined,
  })
  saving.value = false
  if (ok) {
    toast.add({ title: '✓ Provider 已保存', color: 'success' })
    form.apiKey = ''
  } else {
    toast.add({ title: '✗ 保存失败', color: 'error' })
  }
}

async function handleTest() {
  testRes.value = null
  testing.value = true
  const result = await testConnection()
  testing.value = false
  testRes.value = result || { ok: false, error: '无法连接到服务' }
}
</script>

<template>
  <div>
    <UPageCard
      title="Provider"
      description="配置 LLM 服务商连接"
      variant="naked"
      orientation="horizontal"
      class="mb-4"
    >
      <UButton
        label="保存 Provider"
        color="neutral"
        :loading="saving"
        class="w-fit lg:ms-auto"
        @click="handleSave"
      />
    </UPageCard>

    <UPageCard variant="subtle">
      <UFormField
        label="服务商"
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <USelect
          :model-value="form.name"
          :items="providerOptions"
          placeholder="选择服务商"
          @update:model-value="form.name = $event; onProviderChange($event)"
        />
      </UFormField>

      <USeparator />

      <UFormField
        label="Base URL"
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <UInput v-model="form.baseUrl" placeholder="https://api.siliconflow.cn/v1" />
      </UFormField>

      <USeparator />

      <UFormField
        label="Model"
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <div class="flex gap-2 w-full">
          <UInput v-model="form.model" placeholder="deepseek-ai/DeepSeek-V3" class="flex-1" />
          <UButton
            variant="outline"
            color="neutral"
            size="sm"
            :loading="loadingModels"
            @click="handleLoadModels"
          >
            {{ loadingModels ? '加载中…' : '获取模型列表' }}
          </UButton>
        </div>
      </UFormField>

      <div v-if="models.length" class="mt-2">
        <USelect
          :model-value="form.model"
          :items="models.map(m => ({ label: m, value: m }))"
          placeholder="选择模型"
          @update:model-value="form.model = $event"
        />
      </div>
      <p v-if="modelErr" class="text-xs text-muted mt-1">⚠ {{ modelErr }}</p>

      <USeparator />

      <UFormField
        label="API Key"
        class="flex max-sm:flex-col justify-between items-start gap-4"
      >
        <div class="flex gap-2 w-full">
          <UInput
            v-model="form.apiKey"
            :type="showKey ? 'text' : 'password'"
            placeholder="sk-…"
            class="flex-1"
          />
          <UButton
            variant="outline"
            color="neutral"
            size="sm"
            @click="showKey = !showKey"
          >
            {{ showKey ? '隐藏' : '显示' }}
          </UButton>
        </div>
      </UFormField>

      <USeparator />

      <div class="flex gap-2">
        <UButton
          variant="outline"
          color="neutral"
          :loading="testing"
          @click="handleTest"
        >
          {{ testing ? '测试中…' : '测试连接' }}
        </UButton>
      </div>

      <!-- Test Result -->
      <div v-if="testRes" class="mt-3">
        <div
          class="p-3 rounded-lg text-sm"
          :class="testRes.ok
            ? 'bg-success/10 border border-success/20 text-success'
            : 'bg-error/10 border border-error/20 text-error'"
        >
          <div class="font-medium mb-1">
            {{ testRes.ok ? '✓ 连接成功' : '✗ 连接失败' }}
          </div>
          <div v-if="testRes.ok" class="text-xs space-y-0.5 opacity-80">
            <div>Provider: {{ form.name || '—' }}</div>
            <div>Model: {{ testRes.model || form.model || '—' }}</div>
            <div>延迟: {{ testRes.latency_ms }}ms</div>
          </div>
          <div v-else class="text-xs opacity-80">
            {{ testRes.error }}
          </div>
        </div>
      </div>
    </UPageCard>
  </div>
</template>
