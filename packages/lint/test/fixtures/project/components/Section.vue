<script setup lang="ts">
// Not a wrapper: the class lands on a plain element.
const props = defineProps<{ class?: string }>()
</script>

<template>
  <section :class="props.class" />
</template>
