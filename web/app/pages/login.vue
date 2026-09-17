<script setup lang="ts">
// The login screen is deliberately layout-free: the dashboard sidebar would
// expose navigation the visitor is not allowed to use yet.
definePageMeta({ layout: false })

const { login, pending, lastError } = useAuth()

const password = ref('')
const passwordField = ref<{ inputRef?: HTMLInputElement } | null>(null)

onMounted(() => {
  passwordField.value?.inputRef?.focus()
})

async function submit() {
  if (!password.value || pending.value) return
  if (await login(password.value)) {
    await navigateTo('/')
  }
  password.value = ''
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center p-6 bg-default">
    <UCard class="w-full max-w-sm">
      <template #header>
        <div class="flex flex-col items-center gap-3 text-center">
          <img src="/logo.png" alt="SorarinBot" class="size-14 rounded-xl">
          <div>
            <h1 class="text-lg font-semibold text-highlighted">
              SorarinBot
            </h1>
            <p class="text-sm text-muted mt-1">
              请输入管理密码
            </p>
          </div>
        </div>
      </template>

      <form class="space-y-4" @submit.prevent="submit">
        <UFormField label="密码">
          <UInput
            ref="passwordField"
            v-model="password"
            type="password"
            placeholder="••••••••"
            autocomplete="current-password"
            class="w-full"
          />
        </UFormField>

        <UAlert
          v-if="lastError"
          color="error"
          variant="subtle"
          icon="i-lucide-triangle-alert"
          :description="lastError"
        />

        <UButton
          type="submit"
          block
          :loading="pending"
          :disabled="!password"
          label="登录"
        />
      </form>

      <template #footer>
        <p class="text-xs text-muted text-center">
          忘记密码？在程序所在目录运行 <code>SorarinBot -set-password</code> 重新设置。
        </p>
      </template>
    </UCard>
  </div>
</template>
