<script setup lang="ts">
import { cn } from "@/lib/utils"
import { badgeVariants } from "./variants"

const props = defineProps<{
  variant?:
    | "default"
    | "secondary"
    | "destructive"
    | "outline"
    | "ghost"
    | "link"
  class?: string
}>()
</script>

<template>
  <span
    data-slot="badge"
    :class="cn(badgeVariants({ variant: props.variant }), props.class)"
  >
    <slot />
  </span>
</template>
