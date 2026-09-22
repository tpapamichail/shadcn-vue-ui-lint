<script setup lang="ts">
import { cn } from "cn"

const props = defineProps<{ class?: string }>()
</script>

<template>
  <div :class="cn('rounded-lg border border-line', props.class)" />
</template>
