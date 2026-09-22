<script setup lang="ts">
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: string
}>()
</script>

<template>
  <div data-slot="select-group" :class="cn('scroll-my-1 p-1', props.class)">
    <slot />
  </div>
</template>
