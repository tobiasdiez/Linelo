<script setup lang="ts">
import DecisionButtons from './DecisionButtons.vue'
</script>

<template>
  <Stories title="Calendar/Decision Buttons" :component="DecisionButtons">
    <Story title="In The Active Row">
      <DecisionButtons class="p-6" title="Build night" />
    </Story>
    <Story title="In The Bar">
      <DecisionButtons class="max-w-md p-6" title="Build night" layout="bar" />
    </Story>
    <Story title="Accepting">
      <DecisionButtons class="p-6" title="Build night" busy pending="accept" />
    </Story>
  </Stories>
</template>
