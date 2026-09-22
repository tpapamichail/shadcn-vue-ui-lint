<script setup lang="ts">
import { cva } from "class-variance-authority"
import { cn } from "cn"

export const buttonVariants = cva("inline-flex rounded-md", {
  variants: {
    variant: {
      primary: "bg-accent text-accent-ink",
      secondary: "border border-line bg-paper text-ink",
    },
    size: { sm: "h-8", md: "h-10" },
  },
  defaultVariants: { variant: "primary", size: "md" },
})

const props = defineProps<{
  variant?: "primary" | "secondary"
  size?: "sm" | "md"
  class?: string
}>()
</script>

<template>
  <button
    :class="cn(buttonVariants({ variant: props.variant, size: props.size }), props.class)"
  />
</template>
