<script setup lang="ts">
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: string
}>()
</script>

<template>
  <span
    data-slot="select-value"
    :class="cn('flex flex-1 text-left', props.class)"
  >
    <slot />
  </span>
</template>
