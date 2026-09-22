<script setup lang="ts">
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: string
}>()
</script>

<template>
  <div
    data-slot="select-label"
    :class="cn('px-1.5 py-1 text-xs text-muted-foreground', props.class)"
  >
    <slot />
  </div>
</template>
