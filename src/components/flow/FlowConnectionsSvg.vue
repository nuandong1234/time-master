<script setup lang="ts">
import type { SvgPathDef } from "@/composables/useWorkflowConnections"

const LINE_COLOR = "#d5d5d5"
const LINE_WIDTH = 1.5

defineProps<{
  paths: SvgPathDef[]
  width: number
  height: number
}>()
</script>

<template>
  <svg
    class="absolute inset-0 pointer-events-none overflow-visible"
    style="z-index: 1"
    :width="width"
    :height="height"
    :viewBox="`0 0 ${width} ${height}`"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      v-for="(p, pi) in paths"
      :key="pi"
      :d="p.d"
      :stroke="LINE_COLOR"
      :stroke-width="LINE_WIDTH"
      fill="none"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  </svg>
</template>