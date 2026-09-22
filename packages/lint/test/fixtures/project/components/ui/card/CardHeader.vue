<script setup lang="ts">
import { cn } from "@/lib/utils"

const props = defineProps<{ class?: string }>()
</script>

<template>
  <div
    data-slot="card-header"
    :class="cn('group/card-header grid auto-rows-min items-start gap-1 rounded-t-xl px-(--card-spacing)', props.class)"
  />
</template>
