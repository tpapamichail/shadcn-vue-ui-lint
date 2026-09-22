<script setup lang="ts">
// A wrapper of a wrapper.
import SaveButton from "@/components/SaveButton.vue"

const props = defineProps<{ class?: string }>()
</script>

<template>
  <SaveButton :class="props.class" />
</template>
