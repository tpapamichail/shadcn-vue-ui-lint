<script setup lang="ts">
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: string
}>()
</script>

<template>
  <div
    data-slot="tabs-content"
    :class="cn('flex-1 text-sm outline-none', props.class)"
  >
    <slot />
  </div>
</template>
