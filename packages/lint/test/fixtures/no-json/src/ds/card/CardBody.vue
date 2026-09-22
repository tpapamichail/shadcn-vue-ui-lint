<script setup lang="ts">
import { cn } from "cn"

const props = defineProps<{ class?: string }>()
</script>

<template>
  <div :class="cn('p-5', props.class)" />
</template>
