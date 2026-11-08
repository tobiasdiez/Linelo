<script setup lang="ts">
import SignInPanel from '~/components/SignInPanel.vue'
import authClient from '~/utils/auth-client'
import signInNotice from '~/utils/sign-in-notice'

useHead({ title: 'Sign in · Linelo' })

const route = useRoute()
const panel = useTemplateRef<InstanceType<typeof SignInPanel>>('panel')
const busy = ref(false)
const failed = ref(false)

const notice = computed(() => (failed.value ? 'failed' : signInNotice(route.query)))

async function continueWithMicrosoft(): Promise<void> {
  busy.value = true
  failed.value = false
  // On success the client leaves for Microsoft, which returns to the callback and then to `/`
  const { error } = await authClient.signIn
    .social({ provider: 'microsoft', callbackURL: '/', errorCallbackURL: '/sign-in' })
    .catch((networkError: unknown) => ({ error: networkError }))
  if (!error) {
    return
  }
  console.error('Starting the sign-in with Microsoft failed', error)
  failed.value = true
  busy.value = false
  await nextTick()
  panel.value?.focusButton()
}

// Back from Microsoft's page restores this one from the browser's cache, still busy
function onPageShow(event: PageTransitionEvent): void {
  if (event.persisted) {
    busy.value = false
  }
}

onMounted(() => window.addEventListener('pageshow', onPageShow))
onBeforeUnmount(() => window.removeEventListener('pageshow', onPageShow))
</script>

<template>
  <main class="min-h-dvh">
    <SignInPanel ref="panel" :notice="notice" :busy="busy" @continue="continueWithMicrosoft" />
  </main>
</template>
