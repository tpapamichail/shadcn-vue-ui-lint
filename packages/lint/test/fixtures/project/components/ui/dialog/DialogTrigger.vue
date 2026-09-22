<script setup lang="ts">
defineProps<{ class?: string }>()
</script>

<template>
  <button data-slot="dialog-trigger"><slot /></button>
</template>
