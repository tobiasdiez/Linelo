<script setup lang="ts">

</script>

<template>
  <div class="w-full max-w-[680px] mx-auto">
    <UCard
      :ui="{
        root: 'bg-white border border-warm-200 rounded-xl',
        body: 'p-6',
      }"
    >
      <!-- Header skeleton -->
      <div class="flex items-start justify-between gap-4 mb-4">
        <div class="flex items-start gap-3">
          <USkeleton class="size-10 rounded-full" />
          <div class="space-y-2">
            <USkeleton class="h-5 w-32" />
            <USkeleton class="h-4 w-40" />
          </div>
        </div>
        <div class="space-y-2">
          <USkeleton class="h-4 w-16 ml-auto" />
          <USkeleton class="h-4 w-12 ml-auto" />
        </div>
      </div>

      <!-- Subject skeleton -->
      <USkeleton class="h-5 w-3/4 mb-4" />

      <USeparator class="mb-4" />

      <!-- Body skeleton -->
      <div class="space-y-3">
        <USkeleton class="h-4 w-full" />
        <USkeleton class="h-4 w-full" />
        <USkeleton class="h-4 w-5/6" />
        <USkeleton class="h-4 w-full mt-4" />
        <USkeleton class="h-4 w-4/5" />
        <USkeleton class="h-4 w-3/4" />
      </div>
    </UCard>

    <!-- Skeleton text below -->
    <p class="text-center text-sm text-warm-400 mt-4 animate-gentle-pulse">
      Loading next message...
    </p>
  </div>
</template>
