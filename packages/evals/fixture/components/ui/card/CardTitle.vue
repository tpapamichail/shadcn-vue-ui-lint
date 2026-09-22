<script setup lang="ts">
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: string
}>()
</script>

<template>
  <div
    data-slot="card-title"
    :class="
      cn(
        'cn-font-heading text-base leading-snug font-medium group-data-[size=sm]/card:text-sm',
        props.class
      )
    "
  >
    <slot />
  </div>
</template>
