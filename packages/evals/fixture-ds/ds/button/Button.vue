<script setup lang="ts">
import { cn } from "@/lib/utils"
import { buttonVariants } from "./variants"

const props = defineProps<{
  variant?:
    | "default"
    | "outline"
    | "secondary"
    | "ghost"
    | "destructive"
    | "link"
  size?:
    | "default"
    | "xs"
    | "sm"
    | "lg"
    | "icon"
    | "icon-xs"
    | "icon-sm"
    | "icon-lg"
  class?: string
}>()
</script>

<template>
  <button
    data-slot="button"
    :class="
      cn(
        buttonVariants({ variant: props.variant, size: props.size }),
        props.class
      )
    "
  >
    <slot />
  </button>
</template>
