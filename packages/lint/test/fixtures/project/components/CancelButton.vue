<script setup lang="ts">
import { Button } from "@/components/ui/button"

const props = defineProps<{ class?: string }>()
</script>

<template>
  <Button variant="ghost" :class="props.class" />
</template>
