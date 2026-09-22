<script setup lang="ts">
import { cn } from "@/lib/utils"

const props = defineProps<{
  inset?: boolean
  class?: string
}>()
</script>

<template>
  <div
    data-slot="dropdown-menu-radio-item"
    :data-inset="props.inset || undefined"
    :class="
      cn(
        `relative flex cursor-default items-center gap-1.5 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground focus:**:text-accent-foreground data-inset:pl-7 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`,
        props.class
      )
    "
  >
    <span
      class="pointer-events-none absolute right-2 flex items-center justify-center"
      data-slot="dropdown-menu-radio-item-indicator"
    />
    <slot />
  </div>
</template>
