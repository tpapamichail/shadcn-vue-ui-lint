<script setup lang="ts">
import { cn } from "@/lib/utils"

const props = defineProps<{
  class?: string
}>()
</script>

<template>
  <img
    data-slot="avatar-image"
    :class="
      cn('aspect-square size-full rounded-full object-cover', props.class)
    "
  />
</template>
