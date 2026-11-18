<script setup lang="ts">
import CalendarPicker from './calendar/CalendarPicker.vue'
import type { DropdownMenuItem } from '@nuxt/ui'
import authClient from '~/utils/auth-client'

const LOGO_SIZE = 26

/** Whether the account menu is open; a model so stories can show it open. */
const menuOpen = defineModel<boolean>('menuOpen', { default: false })

const { user, me } = useCurrentUser()
const sources = useCalendarSources()
const toast = useToast()
const accountButton = useTemplateRef<{ $el: HTMLElement }>('accountButton')

const name = computed(() => user.value?.name ?? '')

const pages = [
  { label: 'Inbox', to: '/' },
  { label: 'Calendar', to: '/calendar' },
]

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
      label: 'Calendars…',
      icon: 'i-lucide-calendar-cog',
      // Back on the account button when the picker closes: the menu item is gone by then
      onSelect: () => sources.openPicker(() => accountButton.value?.$el.focus()),
    },
  ],
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
  <header class="flex h-16 items-center gap-6 px-6 max-sm:gap-3 max-sm:px-4 lg:px-10">
    <div class="inline-flex items-center gap-2.5 text-lg font-semibold tracking-tight">
      <AppLogo :size="LOGO_SIZE" alt="" />
      <span class="max-[22rem]:sr-only">Linelo</span>
    </div>
    <nav aria-label="Pages" class="flex items-center gap-1">
      <!-- `exact` marks the page you are on with `aria-current="page"` -->
      <ULink
        v-for="page in pages"
        :key="page.to"
        :to="page.to"
        exact
        raw
        class="rounded-md px-2.5 py-1.5 text-sm font-medium focus-visible:focus-ring max-sm:px-2"
        active-class="bg-elevated text-highlighted"
        inactive-class="text-muted hover:text-highlighted"
      >
        {{ page.label }}
      </ULink>
    </nav>
    <UDropdownMenu v-model:open="menuOpen" :items="items" :content="menuContent" class="ml-auto">
      <UButton
        ref="accountButton"
        variant="ghost"
        :avatar="{ alt: name, color: 'neutral', size: 'md' }"
        :aria-label="`Account: ${name}`"
        square
      />
    </UDropdownMenu>
    <CalendarPicker
      :open="sources.open.value"
      :listing="sources.listing.value"
      :status="sources.status.value"
      :choices="sources.choices.value"
      @close="sources.closePicker"
      @closed="sources.restoreFocus"
      @choose="sources.choose"
      @retry="sources.load"
    />
  </header>
</template>
