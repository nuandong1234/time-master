import { ref } from "vue"

export type ToastType = "success" | "error" | "info" | "warning"

const currentToast = ref<{ id: number; msg: string; type: ToastType } | null>(null)
const toastVisible = ref(false)
let idCounter = 0
let stayTimer: ReturnType<typeof setTimeout> | null = null
let leaveTimer: ReturnType<typeof setTimeout> | null = null

/** 显示 toast。新 toast 出现时当前 toast 立即离场，两者重叠流动 */
export function showToast(msg: string, type: ToastType = "warning") {
  const id = ++idCounter

  // 清除上一次遗留的离场定时器（防止堆积）
  if (leaveTimer !== null) {
    clearTimeout(leaveTimer)
    leaveTimer = null
  }

  // 当前有 toast → 立即离场（不停留）
  if (currentToast.value) {
    clearTimeout(stayTimer!)
    toastVisible.value = false
    // 等离场动画结束后再显示新的
    leaveTimer = setTimeout(() => {
      leaveTimer = null
      showNew(id, msg, type)
    }, 400) // 离场 400ms
  } else {
    showNew(id, msg, type)
  }
}

function showNew(id: number, msg: string, type: ToastType) {
  currentToast.value = { id, msg, type }
  toastVisible.value = true

  // 进场 350ms 后进入微停留 200ms，然后自动离场
  stayTimer = setTimeout(() => {
    toastVisible.value = false
    stayTimer = setTimeout(() => {
      currentToast.value = null
    }, 400) // 离场动画结束后清除
  }, 350 + 200) // 进场 + 微停留
}

/** 手动关闭当前 toast */
export function dismissToast() {
  if (!currentToast.value) return
  clearTimeout(stayTimer!)
  toastVisible.value = false
  stayTimer = setTimeout(() => {
    currentToast.value = null
    stayTimer = null
  }, 400)
}

export function useToast() {
  return { currentToast, toastVisible }
}
