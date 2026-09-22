<script setup lang="ts">
import { cn } from "@/lib/utils"

const props = defineProps<{ class?: string }>()
</script>

<template>
  <div
    data-slot="card-footer"
    :class="cn('flex items-center rounded-b-xl border-t bg-muted/50 p-(--card-spacing)', props.class)"
  />
</template>
