<script setup lang="ts">
import { UAlert } from '#components'
</script>

<template>
  <Stories title="Nuxt UI/Alert Theme">
    <Story title="Primary">
      <UAlert
        color="primary"
        title="With Linelo"
        description="The queue narrows to one clear next action instead of leaving the whole backlog on screen."
      />
    </Story>

    <Story title="Neutral">
      <UAlert
        color="neutral"
        title="Account"
        description="Sign in again so Linelo can keep reading your mail."
      />
    </Story>

    <Story title="Warning">
      <UAlert
        color="warning"
        title="Approval"
        description="Your organisation needs to approve Linelo first. Your IT admin can do that."
      />
    </Story>

    <Story title="Error">
      <UAlert
        color="error"
        title="Inbox problem"
        description="Outlook mail could not be loaded right now. Reload the inbox or open Outlook to confirm the account state."
      />
    </Story>
  </Stories>
</template>
