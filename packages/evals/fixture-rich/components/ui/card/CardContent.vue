<script setup lang="ts">
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: string
}>()
</script>

<template>
  <div data-slot="card-content" :class="cn('px-(--card-spacing)', props.class)">
    <slot />
  </div>
</template>
