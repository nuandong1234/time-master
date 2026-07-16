<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import AppLayout from "@/components/layout/AppLayout.vue";
import ToastContainer from "@/components/ToastContainer.vue"
import { useItems } from "@/store/items"
import { loadPomodoroSettings } from "@/store/pomodoro"
import { loadSettings, applyTheme, setWindowSize } from "@/store/settings"
import { useSettings } from "@/store/settings"
import { initWorkflow } from "@/store/workflow"
import { dataStore } from "@/lib/data-store"
import { flushAll } from "@/lib/debounced-save"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"

const { loadItems, resetExpiredSynced } = useItems()
const { theme, minimizeToTray, windowSize, customWindowWidth, customWindowHeight } = useSettings()

// 检查当前窗口是否为独立设置窗口
const isSettingsWindow = ref(getCurrentWebviewWindow().label === "settings")

// 在 Vue 挂载前就发起数据请求，与模板渲染并行执行
const dataPromise = dataStore.initDatabase()
// 失败时返回空对象，用于后续解构
const emptyData = { settings: null, items: null, workflow: null, pomodoro: null }

// 自动检测日期变更的定时器
let autoResetTimer: ReturnType<typeof setInterval> | null = null

// 窗口关闭前刷出所有待写入数据
function handleBeforeUnload() {
  flushAll()
}

onMounted(async () => {
  // 等待数据（可能已经在 setup 阶段加载完毕了）
  const allData = await dataPromise.catch(() => emptyData) || emptyData

  // 并行初始化各个 store（内存操作，无 IPC）
  const settingsData = allData.settings
  const itemsData = allData.items
  const workflowData = allData.workflow
  const pomodoroData = allData.pomodoro

  await loadSettings(false, settingsData)
  applyTheme(theme.value)

  if (!isSettingsWindow.value) {
    await loadItems(true, itemsData)
    await initWorkflow(true, workflowData)
    await resetExpiredSynced()
    await loadPomodoroSettings(false, pomodoroData)
  }
  // 同步最小化到托盘状态到后端
  try {
    await invoke("set_minimize_to_tray", { enabled: minimizeToTray.value })
  } catch { /* 忽略 */ }

  // 监听其他窗口的主题变化（这些不依赖数据，可以立即注册）
  await listen<string>("theme-changed", (event) => {
    applyTheme(event.payload as "light" | "dark" | "system")
  }).catch(() => {})

  // 监听主窗口手动调整大小事件（所有窗口都监听，确保及时同步）
  await listen<{width: number, height: number, maximized: boolean}>("window-resized", (event) => {
    const { width, height, maximized } = event.payload

    if (maximized) {
      setWindowSize("maximized")
      return
    }

    // 检查是否匹配预设尺寸（允许 5px 容差）
    const presets: Array<{key: "small" | "medium" | "large", w: number, h: number}> = [
      { key: "small", w: 1000, h: 650 },
      { key: "medium", w: 1200, h: 800 },
      { key: "large", w: 1400, h: 900 },
    ]
    const matched = presets.find(p => Math.abs(p.w - width) <= 5 && Math.abs(p.h - height) <= 5)

    if (matched) {
      setWindowSize(matched.key)
    } else {
      setWindowSize("custom", width, height)
    }
  })

  // 应用保存的窗口尺寸（仅主窗口）
  if (!isSettingsWindow.value) {
    const ws = windowSize.value
    if (ws === "custom") {
      invoke("set_window_size", {
        preset: "custom",
        width: customWindowWidth.value,
        height: customWindowHeight.value,
      }).catch(() => {})
    } else if (ws !== "medium") {
      // medium 是默认尺寸，不需要额外设置
      invoke("set_window_size", { preset: ws }).catch(() => {})
    }
  }

  // 监听其他窗口的数据重置通知
  await listen("reset-all-data", async () => {
    await loadItems(true)
    await resetExpiredSynced()
    await loadPomodoroSettings(true)
    await loadSettings(true)
    applyTheme(theme.value)
    await invoke("set_minimize_to_tray", { enabled: minimizeToTray.value })
    // 窗口尺寸恢复默认
    setWindowSize("medium")
    if (!isSettingsWindow.value) {
      await invoke("set_window_size", { preset: "medium" })
    }
  })

  // ── 自动检测日期变更，将过期的"今日待办"移回"待办事项" ──
  if (!isSettingsWindow.value) {
    // 每 30 秒检查一次 synced 是否过期
    const AUTO_RESET_INTERVAL = 30_000
    autoResetTimer = setInterval(() => resetExpiredSynced(), AUTO_RESET_INTERVAL)

    // 用户从其他窗口/标签页切回时立即检查
    document.addEventListener("visibilitychange", handleVisibilityChange)
  }

  // 关闭/刷新窗口前刷出所有待写入数据
  window.addEventListener("beforeunload", handleBeforeUnload)
})

onUnmounted(() => {
  if (autoResetTimer !== null) {
    clearInterval(autoResetTimer)
    autoResetTimer = null
  }
  document.removeEventListener("visibilitychange", handleVisibilityChange)
  window.removeEventListener("beforeunload", handleBeforeUnload)
})

function handleVisibilityChange() {
  if (document.visibilityState === "visible") {
    resetExpiredSynced()
  }
}
</script>

<template>
  <AppLayout v-if="!isSettingsWindow" />
  <router-view v-else />
  <ToastContainer />
</template>