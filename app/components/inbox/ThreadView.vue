<script setup lang="ts">
import MessageView from './MessageView.vue'
import ThreadMessageRow from './ThreadMessageRow.vue'
import WhyShownHint from './WhyShownHint.vue'
import latestMessage from '#shared/utils/latest-message'
import participants from '#shared/utils/participants'

const { thread, whyShown } = defineProps<{
  thread: Inbox.Thread
  /** One line explaining why the thread is shown now. */
  whyShown: string
}>()

const { listNames } = useCurrentUser()

const earlierMessages = computed(() => thread.messages.slice(0, -1))
const latest = computed(() => latestMessage(thread))
const messageCount = computed(() =>
  thread.messages.length === 1 ? '1 message' : `${thread.messages.length} messages`,
)
const participantNames = computed(() => {
  const everyone: Inbox.Participant[] = []
  for (const message of thread.messages) {
    everyone.push(message.from, ...message.to, ...message.cc)
  }
  return listNames(participants.unique(everyone))
})
</script>

<template>
  <div class="min-w-0">
    <!-- Focusable so the page can move focus here when the next message comes up -->
    <h1 tabindex="-1" class="text-3xl font-semibold tracking-tight text-pretty outline-none">
      {{ thread.subject }}
    </h1>
    <p class="mt-1.5 flex items-center gap-1 text-xs text-muted">
      <span>{{ messageCount }} · {{ participantNames }}</span>
      <WhyShownHint :text="whyShown" />
    </p>

    <UCard variant="flush" class="mt-5">
      <UCollapsible
        v-for="message in earlierMessages"
        :key="message.id"
        class="border-b border-default"
      >
        <ThreadMessageRow :message="message" />
        <template #content>
          <MessageView :message="message" />
        </template>
      </UCollapsible>
      <MessageView :message="latest" />
    </UCard>
  </div>
</template>
