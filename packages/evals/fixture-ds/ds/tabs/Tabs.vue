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
    data-slot="tabs"
    :data-orientation="props.orientation"
    :class="cn('group/tabs flex gap-2 data-horizontal:flex-col', props.class)"
  >
    <slot />
  </div>
</template>
