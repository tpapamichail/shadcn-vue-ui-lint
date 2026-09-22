<script setup lang="ts">
// A wrapper of an open container: its class lands on CardContent, so
// from outside it accepts spacing the way CardContent does.
import { CardContent } from "@/components/ui/card"

const props = defineProps<{ class?: string }>()
</script>

<template>
  <CardContent :class="props.class" />
</template>
