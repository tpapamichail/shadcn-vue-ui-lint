<script setup lang="ts">
import { cva } from "class-variance-authority"
import { cn } from "@/lib/utils"

// An axis not named "variant", and a second definition in the same
// file — both cases the v0 regex extractor missed.
const fieldVariants = cva("group/field flex w-full gap-3", {
  variants: {
    orientation: {
      vertical: "flex-col",
      horizontal: "flex-row items-center",
      responsive: "flex-col @md/field-group:flex-row",
    },
  },
  defaultVariants: { orientation: "vertical" },
})

const props = defineProps<{
  orientation?: "vertical" | "horizontal" | "responsive"
  class?: string
}>()
</script>

<template>
  <div
    data-slot="field"
    :class="cn(fieldVariants({ orientation: props.orientation }), props.class)"
  />
</template>
