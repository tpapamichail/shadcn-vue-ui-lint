<script setup lang="ts">
import { tv } from "tailwind-variants"

// tv() takes its config as the first argument.
const chip = tv({
  slots: { root: "inline-flex rounded-full", label: "text-xs" },
  variants: {
    tone: {
      neutral: { root: "bg-muted" },
      loud: { root: "bg-primary text-primary-foreground" },
    },
  },
})

const props = defineProps<{ tone?: "neutral" | "loud" }>()
</script>

<template>
  <span :class="chip({ tone: props.tone }).root()">
    <span :class="chip({ tone: props.tone }).label()">chip</span>
  </span>
</template>
