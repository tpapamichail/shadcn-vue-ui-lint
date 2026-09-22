<script setup lang="ts">
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

const fieldLabelVariants = cva("text-sm font-medium", {
  variants: {
    variant: {
      default: "text-foreground",
      muted: "text-muted-foreground",
    },
  },
})

const props = defineProps<{
  variant?: "default" | "muted"
  class?: string
}>()
</script>

<template>
  <label
    data-slot="field-label"
    :class="cn(fieldLabelVariants({ variant: props.variant }), props.class)"
  />
</template>
