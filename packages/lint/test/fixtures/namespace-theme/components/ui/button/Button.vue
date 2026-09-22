<script setup lang="ts">
const props = defineProps<{ class?: string }>()
</script>

<template>
  <button :class="props.class" />
</template>
