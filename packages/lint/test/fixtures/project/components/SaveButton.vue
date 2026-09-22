<script setup lang="ts">
// A wrapper: its class lands on a design-system component, so from
// outside it is that component.
import { Button } from "@/components/ui/button"

const props = defineProps<{ class?: string }>()
</script>

<template>
  <Button variant="default" :class="props.class" />
</template>
