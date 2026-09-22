<script setup lang="ts">
import { cn } from "@/lib/utils"

const props = defineProps<{ class?: string }>()
</script>

<template>
  <button data-slot="scroller-button" :class="cn('bg-background', props.class)" />
</template>
