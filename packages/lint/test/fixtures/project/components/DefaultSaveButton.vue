<script setup lang="ts">
import { Button } from "@/components/ui/button"

// A wrapper whose name the importing page picks: the file is its
// default export.
const props = defineProps<{ class?: string }>()
</script>

<template>
  <Button :class="props.class">Save</Button>
</template>
