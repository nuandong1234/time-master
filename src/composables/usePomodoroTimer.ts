import { ref, computed, watch } from "vue"
import type { Item } from "@/store/items"
import { usePomodoroStore } from "@/store/pomodoro"
import { completeItem } from "@/lib/workflow-item-sync"
import { showToast } from "@/store/toast"
import { playBeep } from "@/lib/sound"

// ── 模块级运行时状态（组件切换时保留，不重置） ──
const currentRound = ref(1)
const linkedItem = ref<Item | null>(null)
const lockedItem = ref<Item | null>(null)
const timerPhase = ref<"idle" | "ready" | "focus" | "break">("idle")
const remainingSeconds = ref(0)
const timerInterval = ref<ReturnType<typeof setInterval> | null>(null)
const focusAddedSeconds = ref(0)
const showCompleteConfirm = ref(false)
const pendingCompleteItem = ref<Item | null>(null)

export function usePomodoroTimer() {
  const {
    incrementPomodoro, addFocusSeconds, saveTimerSettings, setLockedItemId,
    focusMinutesSetting, breakMinutesSetting, totalRoundsSetting,
  } = usePomodoroStore()

  // ── 设置 ──
  const focusMinutes = ref(focusMinutesSetting.value)
  const breakMinutes = ref(breakMinutesSetting.value)
  const totalRounds = ref(totalRoundsSetting.value)

  // ── 同步持久化设置到本地 ref（仅在非运行时更新） ──
  watch(focusMinutesSetting, (val) => {
    if (timerPhase.value === "idle" || timerPhase.value === "ready") {
      focusMinutes.value = val
    }
  })
  watch(breakMinutesSetting, (val) => {
    if (timerPhase.value === "idle" || timerPhase.value === "ready") {
      breakMinutes.value = val
    }
  })
  watch(totalRoundsSetting, (val) => {
    if (timerPhase.value === "idle" || timerPhase.value === "ready") {
      totalRounds.value = val
    }
  })

  watch([focusMinutes, breakMinutes, totalRounds], () => {
    saveTimerSettings({
      focusMinutes: focusMinutes.value,
      breakMinutes: breakMinutes.value,
      totalRounds: totalRounds.value,
    })
  })

  // ── 提示音 ──
  function callPlayBeep(type: 'switch' | 'complete') {
    playBeep(type, 100)
  }

  // ── 计时器操作 ──
  function startCountdown() {
    if (timerInterval.value) clearInterval(timerInterval.value)
    timerInterval.value = setInterval(() => {
      remainingSeconds.value--
      if (remainingSeconds.value <= 0) {
        if (timerPhase.value === "focus") {
          const total = focusMinutes.value * 60
          const delta = total - focusAddedSeconds.value
          if (delta > 0) addFocusSeconds(delta)
          focusAddedSeconds.value = 0
          timerPhase.value = "break"
          remainingSeconds.value = breakMinutes.value * 60
          callPlayBeep('switch')
        } else {
          incrementPomodoro()
          if (currentRound.value < totalRounds.value) {
            currentRound.value++
            timerPhase.value = "focus"
            remainingSeconds.value = focusMinutes.value * 60
            callPlayBeep('switch')
          } else {
            if (timerInterval.value) {
              clearInterval(timerInterval.value)
              timerInterval.value = null
            }
            timerPhase.value = "ready"
            currentRound.value = 1
            remainingSeconds.value = 0
            callPlayBeep('complete')
            if (lockedItem.value) {
              pendingCompleteItem.value = lockedItem.value
              showCompleteConfirm.value = true
            }
            setLockedItemId(null)
            lockedItem.value = null
            linkedItem.value = null
          }
        }
      }
    }, 1000)
  }

  function startPomodoro() {
    if (timerPhase.value === "ready") {
      currentRound.value = 1
      lockedItem.value = linkedItem.value
      setLockedItemId(linkedItem.value?.id ?? null)
      timerPhase.value = "focus"
      remainingSeconds.value = focusMinutes.value * 60
      focusAddedSeconds.value = 0
      showToast('开始专注', 'info')
      startCountdown()
    }
  }

  function togglePause() {
    if (timerPhase.value === "focus" || timerPhase.value === "break") {
      if (timerInterval.value) {
        clearInterval(timerInterval.value)
        timerInterval.value = null
        showToast('已暂停', 'info')
        if (timerPhase.value === "focus") {
          const total = focusMinutes.value * 60
          const elapsed = total - remainingSeconds.value
          const delta = elapsed - focusAddedSeconds.value
          if (delta > 0) {
            addFocusSeconds(delta)
            focusAddedSeconds.value = elapsed
          }
        }
      } else {
        showToast('已继续', 'info')
        startCountdown()
      }
    }
  }

  function resetTimer() {
    if (timerInterval.value) {
      clearInterval(timerInterval.value)
      timerInterval.value = null
    }
    timerPhase.value = "idle"
    currentRound.value = 1
    remainingSeconds.value = 0
    setLockedItemId(null)
    linkedItem.value = null
    lockedItem.value = null
    showToast('已重置', 'info')
  }

  function selectLinkedItem(item: Item) {
    if (timerPhase.value !== "idle" && timerPhase.value !== "ready") return
    if (lockedItem.value) return
    if (linkedItem.value?.id === item.id) {
      linkedItem.value = null
      if (timerPhase.value === "ready") timerPhase.value = "idle"
    } else {
      linkedItem.value = item
      timerPhase.value = "ready"
    }
  }

  function handleWheel(e: WheelEvent, field: "focus" | "break" | "rounds") {
    if (timerPhase.value !== "idle" && timerPhase.value !== "ready") return
    e.preventDefault()
    const step = 1
    const delta = e.deltaY > 0 ? -step : step
    if (field === "focus") {
      focusMinutes.value = Math.min(60, Math.max(1, focusMinutes.value + delta))
    } else if (field === "break") {
      breakMinutes.value = Math.min(30, Math.max(1, breakMinutes.value + delta))
    } else {
      totalRounds.value = Math.min(10, Math.max(1, totalRounds.value + delta))
    }
  }

  function handleConfirmComplete() {
    if (pendingCompleteItem.value) {
      completeItem(pendingCompleteItem.value.id)
      showToast("任务完成", "success")
    }
    showCompleteConfirm.value = false
    pendingCompleteItem.value = null
  }

  function handleCancelComplete() {
    showCompleteConfirm.value = false
    pendingCompleteItem.value = null
  }

  // ── 计算属性 ──
  const displayTime = computed(() => {
    if (timerPhase.value === "idle" || timerPhase.value === "ready") {
      const m = String(focusMinutes.value).padStart(2, "0")
      return `${m}:00`
    }
    const min = Math.floor(remainingSeconds.value / 60)
    const sec = remainingSeconds.value % 60
    return `${String(min).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
  })

  const timerProgress = computed(() => {
    if (timerPhase.value === "idle" || timerPhase.value === "ready") return 0
    if (timerPhase.value === "focus") {
      return 1 - remainingSeconds.value / (focusMinutes.value * 60)
    }
    return 1 - remainingSeconds.value / (breakMinutes.value * 60)
  })

  const phaseLabel = computed(() => {
    if (timerPhase.value === "idle") return "等待开始"
    if (timerPhase.value === "ready") return "等待开始"
    if (timerPhase.value === "focus") return "专注中"
    if (timerPhase.value === "break") return "休息中"
    return "等待开始"
  })

  const circumference = 263.89

  return {
    // 设置
    focusMinutes, breakMinutes, totalRounds,
    // 计时器状态
    currentRound, linkedItem, lockedItem, timerPhase,
    remainingSeconds, timerInterval,
    // 完成确认
    showCompleteConfirm, pendingCompleteItem,
    // 计算属性
    displayTime, timerProgress, phaseLabel, circumference,
    // 操作
    startPomodoro, togglePause, resetTimer,
    selectLinkedItem, handleWheel,
    handleConfirmComplete, handleCancelComplete,
  }
}