<script setup lang="ts">
import type { EmailMessage } from '~/types/email'

defineProps<{
  message: EmailMessage
  isTransitioning: boolean
  transitionDirection: 'enter' | 'exit'
}>()

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}

function formatDate(date: Date): string {
  const now = new Date()
  const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatFileSize(size: string): string {
  return size
}
</script>

<template>
  <article
    class="w-full max-w-[680px] mx-auto"
    :class="{
      'animate-message-enter': transitionDirection === 'enter' && !isTransitioning,
      'animate-message-exit': transitionDirection === 'exit' && isTransitioning,
    }"
  >
    <!-- Explanation line (optional, above card) -->
    <p
      v-if="message.explanation"
      class="text-sm text-warm-500 italic mb-3 px-1"
    >
      {{ message.explanation }}
    </p>

    <!-- Message Card -->
    <UCard
      :ui="{
        root: 'bg-white border border-warm-200 rounded-xl',
        body: 'p-6',
      }"
    >
      <!-- Message Header -->
      <div class="flex items-start justify-between gap-4 mb-4">
        <!-- Sender Info -->
        <div class="flex items-start gap-3">
          <SenderAvatar :sender="message.sender" />
          <div class="min-w-0">
            <h2 class="text-lg font-semibold text-warm-900 leading-tight">
              {{ message.sender.name }}
            </h2>
            <p class="text-sm text-warm-500 truncate">
              {{ message.sender.email }}
            </p>
          </div>
        </div>

        <!-- Timestamp -->
        <div class="text-right flex-shrink-0">
          <p class="text-sm text-warm-500">
            {{ formatTime(message.timestamp) }}
          </p>
          <p class="text-sm text-warm-400">
            {{ formatDate(message.timestamp) }}
          </p>
        </div>
      </div>

      <!-- Subject Line -->
      <h3 class="text-base font-medium text-warm-800 mb-4 text-pretty">
        {{ message.subject }}
      </h3>

      <!-- Divider -->
      <USeparator class="mb-4" />

      <!-- Message Body -->
      <div
        class="prose prose-sm max-w-none text-warm-700 leading-relaxed linelo-scrollbar max-h-[300px] overflow-y-auto"
      >
        <p
          v-for="(paragraph, index) in message.body.split('\n\n')"
          :key="index"
          class="mb-4 last:mb-0 whitespace-pre-line"
        >
          {{ paragraph }}
        </p>
      </div>

      <!-- Attachments -->
      <div
        v-if="message.attachments?.length"
        class="mt-4 pt-4 border-t border-warm-200"
      >
        <div class="flex flex-wrap gap-2">
          <div
            v-for="attachment in message.attachments"
            :key="attachment.name"
            class="inline-flex items-center gap-2 px-3 py-1.5 bg-warm-50 rounded-md text-sm text-warm-600 border border-warm-200"
          >
            <UIcon name="i-lucide-paperclip" class="size-4 text-warm-400" />
            <span class="truncate max-w-[150px]">{{ attachment.name }}</span>
            <span class="text-warm-400">{{ formatFileSize(attachment.size) }}</span>
          </div>
        </div>
      </div>

      <!-- Thread indicator -->
      <button
        v-if="message.threadCount && message.threadCount > 1"
        class="mt-4 text-sm text-warm-500 hover:text-linelo-600 transition-colors"
      >
        Show {{ message.threadCount - 1 }} earlier {{ message.threadCount === 2 ? 'message' : 'messages' }}
      </button>
    </UCard>
  </article>
</template>
