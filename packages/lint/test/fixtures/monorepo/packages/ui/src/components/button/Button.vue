<script setup lang="ts">
import { cva } from "class-variance-authority"
import { cn } from "@workspace/ui/lib/utils"

const buttonVariants = cva("inline-flex rounded-md", {
  variants: {
    variant: {
      default: "bg-primary text-primary-foreground",
      brand: "bg-brand text-primary-foreground",
    },
  },
  defaultVariants: { variant: "default" },
})

const props = defineProps<{
  variant?: "default" | "brand"
  class?: string
}>()
</script>

<template>
  <button :class="cn(buttonVariants({ variant: props.variant }), props.class)" />
</template>
