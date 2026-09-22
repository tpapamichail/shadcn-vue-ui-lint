<script setup lang="ts">
import { cn } from "@/lib/utils"

import { tabsListVariants } from "./variants"

const props = withDefaults(
  defineProps<{
    variant?: "default" | "line"
    class?: string
  }>(),
  { variant: "default" }
)
</script>

<template>
  <div
    data-slot="tabs-list"
    :data-variant="props.variant"
    :class="cn(tabsListVariants({ variant: props.variant }), props.class)"
  >
    <slot />
  </div>
</template>
