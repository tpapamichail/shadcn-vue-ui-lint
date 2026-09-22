<script setup lang="ts">
import { cn } from "@/lib/utils"

const props = defineProps<{
  inset?: boolean
  class?: string
}>()
</script>

<template>
  <div
    data-slot="dropdown-menu-sub-trigger"
    :data-inset="props.inset || undefined"
    :class="
      cn(
        `flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-popup-open:bg-accent data-popup-open:text-accent-foreground data-open:bg-accent data-open:text-accent-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4`,
        props.class
      )
    "
  >
    <slot />
    <span class="ml-auto" />
  </div>
</template>
