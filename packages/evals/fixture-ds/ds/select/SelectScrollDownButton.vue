<script setup lang="ts">
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: string
}>()
</script>

<template>
  <div
    data-slot="select-scroll-down-button"
    :class="
      cn(
        `bottom-0 z-10 flex w-full cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4`,
        props.class
      )
    "
  >
    <slot />
  </div>
</template>
