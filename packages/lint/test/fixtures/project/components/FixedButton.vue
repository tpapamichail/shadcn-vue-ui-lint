<script setup lang="ts">
import { Button } from "@/components/ui/button"

// Not a wrapper: the received attributes never reach the Button, and
// the class it wears is the author's.
defineOptions({ inheritAttrs: false })
defineProps<{ class?: string }>()
</script>

<template>
  <Button class="w-full" />
</template>
