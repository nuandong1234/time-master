<script setup lang="ts">
import { useToast, dismissToast } from "@/store/toast"
import { CircleCheck, XCircle, AlertTriangle, Info } from "@lucide/vue"

const { currentToast, toastVisible } = useToast()
</script>

<template>
  <Teleport to="body">
    <Transition>
      <div
        v-if="toastVisible && currentToast"
        :key="currentToast.id"
        class="fixed left-1/2 top-4 -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium text-white select-none pointer-events-auto"
        :class="{
          'bg-green-500 dark:bg-green-600': currentToast.type === 'success',
          'bg-blue-500 dark:bg-blue-600': currentToast.type === 'info',
          'bg-amber-500 dark:bg-amber-600': currentToast.type === 'warning',
          'bg-red-500 dark:bg-red-600': currentToast.type === 'error',
        }"
        @click="dismissToast()"
      >
        <span class="shrink-0 flex items-center">
          <CircleCheck v-if="currentToast.type === 'success'" class="size-[18px]" />
          <XCircle v-if="currentToast.type === 'error'" class="size-[18px]" />
          <AlertTriangle v-if="currentToast.type === 'warning'" class="size-[18px]" />
          <Info v-if="currentToast.type === 'info'" class="size-[18px]" />
        </span>
        {{ currentToast.msg }}
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.v-enter-active {
  animation: toast-in 350ms ease-out;
}
.v-leave-active {
  animation: toast-out 400ms ease-in;
}

@keyframes toast-in {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes toast-out {
  from {
    opacity: 1;
    transform: translateY(0);
  }
  to {
    opacity: 0;
    transform: translateY(-16px);
  }
}
</style>