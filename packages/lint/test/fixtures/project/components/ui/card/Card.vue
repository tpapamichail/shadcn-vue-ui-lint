<script setup lang="ts">
import { cn } from "@/lib/utils"

const props = defineProps<{
  size?: "default" | "sm"
  class?: string
}>()
</script>

<template>
  <div
    data-slot="card"
    :data-size="props.size ?? 'default'"
    :class="cn('group/card flex flex-col gap-(--card-spacing) overflow-hidden rounded-xl bg-card py-(--card-spacing) text-sm text-card-foreground ring-1 ring-foreground/10', props.class)"
  />
</template>
