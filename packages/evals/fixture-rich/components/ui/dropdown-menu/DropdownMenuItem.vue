<script setup lang="ts">
import { cn } from "@/lib/utils"

const props = withDefaults(
  defineProps<{
    inset?: boolean
    variant?: "default" | "destructive"
    class?: string
  }>(),
  { variant: "default" }
)
</script>

<template>
  <div
    data-slot="dropdown-menu-item"
    :data-inset="props.inset || undefined"
    :data-variant="props.variant"
    :class="
      cn(
        `group/dropdown-menu-item relative flex cursor-default items-center gap-1.5 rounded-md px-1.5 py-1 text-sm outline-hidden select-none focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-inset:pl-7 data-[variant=destructive]:text-destructive data-[variant=destructive]:focus:bg-destructive/10 data-[variant=destructive]:focus:text-destructive dark:data-[variant=destructive]:focus:bg-destructive/20 data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-[variant=destructive]:*:[svg]:text-destructive`,
        props.class
      )
    "
  >
    <slot />
  </div>
</template>
