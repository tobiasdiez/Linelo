<script setup lang="ts">
import SignInPanel from './SignInPanel.vue'
</script>

<template>
  <Stories title="Sign In Panel" :component="SignInPanel">
    <Story title="Standard">
      <SignInPanel />
    </Story>
    <Story title="Handing Over">
      <SignInPanel busy />
    </Story>
    <Story title="Cancelled">
      <SignInPanel notice="cancelled" />
    </Story>
    <Story title="Approval Needed">
      <SignInPanel notice="approval" />
    </Story>
    <Story title="Lost Access">
      <SignInPanel notice="reconnect" />
    </Story>
    <Story title="Session Ended">
      <SignInPanel notice="expired" />
    </Story>
    <Story title="Email Already Used">
      <SignInPanel notice="taken" />
    </Story>
    <Story title="Failed">
      <SignInPanel notice="failed" />
    </Story>
  </Stories>
</template>
