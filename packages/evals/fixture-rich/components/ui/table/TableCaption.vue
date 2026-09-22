<script setup lang="ts">
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: string
}>()
</script>

<template>
  <caption
    data-slot="table-caption"
    :class="cn('mt-4 text-sm text-muted-foreground', props.class)"
  >
    <slot />
  </caption>
</template>
