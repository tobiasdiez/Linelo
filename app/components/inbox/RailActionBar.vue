<template>
  <!-- In the rail on large screens; a bar fixed to the bottom of the viewport below `lg`, so the actions stay in reach -->
  <div
    class="max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:z-10 max-lg:border-t max-lg:border-default max-lg:bg-default max-lg:px-6 max-lg:py-3 max-lg:shadow-xs"
  >
    <div class="grid grid-cols-2 gap-2 lg:grid-cols-1">
      <slot />
    </div>
    <slot name="hint" />
  </div>
</template>
