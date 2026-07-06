<script setup lang="ts">
import { onMounted, ref } from "vue"
import { invoke } from "@tauri-apps/api/core"
import { listen } from "@tauri-apps/api/event"
import AppLayout from "@/components/layout/AppLayout.vue";
import ToastContainer from "@/components/ToastContainer.vue"
import { useItems } from "@/store/items"
import { loadPomodoroSettings } from "@/store/pomodoro"
import { loadSettings, applyTheme } from "@/store/settings"
import { useSettings } from "@/store/settings"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"

const { loadItems, resetExpiredSynced } = useItems()
const { theme, minimizeToTray } = useSettings()

// 检查当前窗口是否为独立设置窗口
const isSettingsWindow = ref(getCurrentWebviewWindow().label === "settings")

// 在 Vue 挂载前就发起数据请求，与模板渲染并行执行
const dataPromise = invoke<Record<string, any>>("batch_read_data_files").catch(() => null)

onMounted(async () => {
  // 等待数据（可能已经在 setup 阶段加载完毕了）
  const allData = await dataPromise || {}

  // 并行初始化各个 store（内存操作，无 IPC）
  const settingsData = allData["data/settings.json"]
  const itemsData = allData["data/items.json"]
  const pomodoroData = allData["data/pomodoro.json"]

  await loadSettings(false, settingsData)
  applyTheme(theme.value)

  if (!isSettingsWindow.value) {
    await loadItems(false, itemsData)
    await resetExpiredSynced()
    await loadPomodoroSettings(false, pomodoroData)
  }
  // 同步最小化到托盘状态到后端
  try {
    await invoke("set_minimize_to_tray", { enabled: minimizeToTray.value })
  } catch { /* 忽略 */ }

  // 监听其他窗口的主题变化（这些不依赖数据，可以立即注册）
  listen<string>("theme-changed", (event) => {
    applyTheme(event.payload as "light" | "dark" | "system")
  })

  // 监听其他窗口的数据重置通知
  listen("reset-all-data", async () => {
    await loadItems(true)
    await resetExpiredSynced()
    await loadPomodoroSettings(true)
    await loadSettings(true)
    applyTheme(theme.value)
    await invoke("set_minimize_to_tray", { enabled: minimizeToTray.value })
  })
})
</script>

<template>
  <AppLayout v-if="!isSettingsWindow" />
  <router-view v-else />
  <ToastContainer />
</template>