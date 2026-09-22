<script setup lang="ts">
import { cn } from "@/lib/utils"

const props = defineProps<{
  inset?: boolean
  class?: string
}>()
</script>

<template>
  <div
    data-slot="dropdown-menu-label"
    :data-inset="props.inset || undefined"
    :class="
      cn(
        'px-1.5 py-1 text-xs font-medium text-muted-foreground data-inset:pl-7',
        props.class
      )
    "
  >
    <slot />
  </div>
</template>
