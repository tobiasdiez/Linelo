<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import authClient from '~/utils/auth-client'

const LOGO_SIZE = 26

/** Whether the account menu is open; a model so stories can show it open. */
const menuOpen = defineModel<boolean>('menuOpen', { default: false })

const { user, me } = useCurrentUser()
const toast = useToast()

const name = computed(() => user.value?.name ?? '')

async function signOut(): Promise<void> {
  const { error } = await authClient
    .signOut()
    .catch((networkError: unknown) => ({ error: networkError }))
  if (error) {
    console.error('Signing out failed', error)
    toast.add({
      title: "Couldn't sign you out. Try again.",
      color: 'error',
      icon: 'i-lucide-circle-alert',
    })
    return
  }
  // A full page load, so nothing of the inbox stays in memory
  await navigateTo('/sign-in', { external: true, replace: true })
}

const menuContent = {
  align: 'end' as const,
  /*
   * Closes on Escape even when an Undo toast saw it first and kept itself open by
   * marking it handled, which Reka's menu would otherwise respect.
   */
  onEscapeKeyDown: () => {
    menuOpen.value = false
  },
}

const items = computed<DropdownMenuItem[][]>(() => [
  [{ type: 'label', label: name.value, description: me.value.email }],
  [
    {
      label: 'Sign out',
      icon: 'i-lucide-log-out',
      onSelect: () => {
        void signOut()
      },
    },
  ],
])
</script>

<template>
  <header class="flex h-16 items-center justify-between px-6 lg:px-10">
    <div class="inline-flex items-center gap-2.5 text-lg font-semibold tracking-tight">
      <AppLogo :size="LOGO_SIZE" alt="" />
      Linelo
    </div>
    <UDropdownMenu v-model:open="menuOpen" :items="items" :content="menuContent">
      <UButton
        variant="ghost"
        :avatar="{ alt: name, color: 'neutral', size: 'md' }"
        :aria-label="`Account: ${name}`"
        square
      />
    </UDropdownMenu>
  </header>
</template>
