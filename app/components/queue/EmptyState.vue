<script setup lang="ts">
const showCheck = ref(false)

onMounted(() => {
  // Gentle entrance animation
  setTimeout(() => {
    showCheck.value = true
  }, 100)
})
</script>

<template>
  <div class="flex flex-col items-center justify-center text-center px-6">
    <!-- Success Icon -->
    <div
      class="mb-6 transition-all duration-400 ease-out"
      :class="showCheck ? 'opacity-100 scale-100' : 'opacity-0 scale-90'"
    >
      <div class="size-16 rounded-full bg-linelo-100 flex items-center justify-center">
        <UIcon
          name="i-lucide-check"
          class="size-8 text-linelo-600"
        />
      </div>
    </div>

    <!-- Headline -->
    <h1 class="text-2xl font-semibold text-warm-900 mb-2">
      All caught up.
    </h1>

    <!-- Subtext -->
    <p class="text-base text-warm-500 mb-8">
      You&apos;ve finished your inbox.
    </p>

    <!-- Optional: Close button -->
    <UButton
      variant="outline"
      color="neutral"
      size="lg"
      :ui="{ base: 'text-warm-600 hover:text-warm-800' }"
    >
      Close Linelo
    </UButton>
  </div>
</template>
