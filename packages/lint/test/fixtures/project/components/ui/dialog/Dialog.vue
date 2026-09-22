<script setup lang="ts">
defineProps<{ class?: string }>()
</script>

<template>
  <div data-slot="dialog"><slot /></div>
</template>
