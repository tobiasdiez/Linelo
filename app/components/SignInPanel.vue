<script setup lang="ts">
const LOGO_SIZE = 40

const { notice = undefined, busy = false } = defineProps<{
  /** Why the user is (back) on the sign-in page. */
  notice?: Session.SignInNotice
  /** True while handing over to Microsoft. */
  busy?: boolean
}>()

const emit = defineEmits<{
  continue: []
}>()

const continueButton = useTemplateRef<{ $el: HTMLElement }>('continueButton')
const noticeRegion = useTemplateRef<HTMLElement>('noticeRegion')

// Arriving with a notice (after a redirect), move focus to it so it is read out
onMounted(() => {
  if (notice) {
    noticeRegion.value?.focus()
  }
})

/** Puts focus back on the button, for example after a failed start. */
function focusButton(): void {
  continueButton.value?.$el.focus()
}

defineExpose({ focusButton })

type AlertColor = 'neutral' | 'warning' | 'error'

/** The notices that need attention; a cancelled sign-in only gets a quiet line. */
const alerts: Record<
  Exclude<Session.SignInNotice, 'cancelled'>,
  { color: AlertColor; icon: string; text: string }
> = {
  reconnect: {
    color: 'neutral',
    icon: 'i-lucide-info',
    text: 'Sign in again so Linelo can keep reading your mail.',
  },
  expired: {
    color: 'neutral',
    icon: 'i-lucide-info',
    text: 'Your session ended. Sign in again to carry on.',
  },
  approval: {
    color: 'warning',
    icon: 'i-lucide-info',
    text: 'Your organisation needs to approve Linelo first. Your IT admin can do that.',
  },
  taken: {
    color: 'warning',
    icon: 'i-lucide-info',
    text: 'That email address is already linked to a different Microsoft account in Linelo. Sign in with the one you used first.',
  },
  failed: {
    color: 'error',
    icon: 'i-lucide-circle-alert',
    text: "Signing in didn't work. Try again.",
  },
}

const alert = computed(() => (notice && notice !== 'cancelled' ? alerts[notice] : undefined))
</script>

<template>
  <div class="mx-auto flex w-full max-w-md flex-col gap-8 px-6 py-24">
    <div class="inline-flex items-center gap-3 text-2xl font-semibold tracking-tight">
      <AppLogo :size="LOGO_SIZE" alt="" />
      Linelo
    </div>

    <div class="space-y-4">
      <h1 class="text-4xl font-semibold tracking-tight text-balance">Finish your inbox calmly.</h1>
      <p class="text-lg text-toned">
        Linelo reads your unread email and marks it as read when you handle it. It never sends
        anything on its own.
      </p>
      <p class="text-toned">
        Sign in with the Microsoft account that holds your inbox. Microsoft asks you to allow read
        and write access to your mail; Linelo only uses it to mark mail as read.
      </p>
    </div>

    <div>
      <!-- Polite: the notice explains what happened, it does not interrupt -->
      <div ref="noticeRegion" role="status" tabindex="-1" class="outline-none">
        <UAlert
          v-if="alert"
          :color="alert.color"
          variant="subtle"
          :icon="alert.icon"
          :description="alert.text"
          class="mb-6"
        />
        <p v-else-if="notice === 'cancelled'" class="mb-6 text-sm text-muted">
          Signing in was cancelled. Continue whenever you're ready.
        </p>
      </div>
      <UButton
        ref="continueButton"
        label="Continue with Microsoft"
        color="primary"
        variant="solid"
        size="xl"
        block
        :loading="busy"
        @click="emit('continue')"
      />
    </div>
  </div>
</template>
