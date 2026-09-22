<script setup lang="ts">
import { cn } from "@/lib/utils"

const props = withDefaults(
  defineProps<{
    orientation?: "horizontal" | "vertical"
    class?: string
  }>(),
  { orientation: "horizontal" }
)
</script>

<template>
  <div
    data-slot="separator"
    :data-orientation="props.orientation"
    :class="
      cn(
        'shrink-0 bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch',
        props.class
      )
    "
  />
</template>
