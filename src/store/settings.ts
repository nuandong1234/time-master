import { reactive, computed } from "vue"
import { dataStore } from "@/lib/data-store"
import { invoke } from "@tauri-apps/api/core"
import { emit } from "@tauri-apps/api/event"

interface SettingsState {
  theme: "light" | "dark" | "system"
  minimizeToTray: boolean
  loaded: boolean
  windowSize: "small" | "medium" | "large" | "maximized" | "custom"
  customWindowWidth: number
  customWindowHeight: number
  debugLogging: boolean
  debugLoggingStartedAt: string
}

const state = reactive<SettingsState>({
  theme: "light",
  minimizeToTray: false,
  loaded: false,
  windowSize: "medium",
  customWindowWidth: 1200,
  customWindowHeight: 800,
  debugLogging: false,
  debugLoggingStartedAt: "",
})

export async function loadSettings(force = false, preloadedData?: any) {
  if (state.loaded && !force) return
  const data = preloadedData
  if (data?.theme) state.theme = data.theme
  if (data?.minimizeToTray !== undefined) state.minimizeToTray = data.minimizeToTray
  if (data?.windowSize) state.windowSize = data.windowSize
  if (data?.customWindowWidth) state.customWindowWidth = data.customWindowWidth
  if (data?.customWindowHeight) state.customWindowHeight = data.customWindowHeight
  if (data?.debugLogging !== undefined) state.debugLogging = data.debugLogging
  if (data?.debugLoggingStartedAt) state.debugLoggingStartedAt = data.debugLoggingStartedAt

  // 24h 自动过期检查
  if (state.debugLogging && state.debugLoggingStartedAt) {
    const started = new Date(state.debugLoggingStartedAt).getTime()
    const now = Date.now()
    if (now - started > 24 * 60 * 60 * 1000) {
      state.debugLogging = false
      state.debugLoggingStartedAt = ""
      console.info('[settings] 调试日志已自动关闭（已超过24小时）')
      await saveSettings()
      await invoke("set_debug_logging", { enabled: false }).catch(() => {})
    }
  }

  state.loaded = true
}

async function saveSettings() {
  await dataStore.saveSettings({
    theme: state.theme,
    minimizeToTray: state.minimizeToTray,
    windowSize: state.windowSize,
    customWindowWidth: state.customWindowWidth,
    customWindowHeight: state.customWindowHeight,
    debugLogging: state.debugLogging,
    debugLoggingStartedAt: state.debugLoggingStartedAt,
  })
}

export async function setTheme(theme: "light" | "dark" | "system") {
  state.theme = theme
  applyTheme(theme)
  await saveSettings().catch((e) => console.error('[settings] 保存主题设置失败', e))
  emit("theme-changed", theme).catch(() => {})
}

export async function setMinimizeToTray(enabled: boolean) {
  state.minimizeToTray = enabled
  await saveSettings().catch((e) => console.error('[settings] 保存托盘设置失败', e))
}

export async function toggleDebugLogging() {
  const newVal = !state.debugLogging
  state.debugLogging = newVal
  state.debugLoggingStartedAt = newVal ? new Date().toISOString() : ""

  try {
    await invoke("set_debug_logging", { enabled: newVal })
    await saveSettings()
    if (newVal) {
      console.info('[settings] 调试日志已开启，24小时后自动关闭')
    } else {
      console.info('[settings] 调试日志已关闭')
    }
  } catch (e) {
    console.error('[settings] 切换调试日志失败', e)
  }
}

export async function setWindowSize(
  preset: "small" | "medium" | "large" | "maximized" | "custom",
  customWidth?: number,
  customHeight?: number,
) {
  state.windowSize = preset
  if (customWidth !== undefined) state.customWindowWidth = customWidth
  if (customHeight !== undefined) state.customWindowHeight = customHeight
  await saveSettings().catch((e) => console.error('[settings] 保存窗口尺寸失败', e))
}

export function applyTheme(theme: "light" | "dark" | "system") {
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches)
  document.documentElement.classList.toggle("dark", isDark)
}

export function useSettings() {
  return {
    theme: computed(() => state.theme),
    minimizeToTray: computed(() => state.minimizeToTray),
    windowSize: computed(() => state.windowSize),
    customWindowWidth: computed(() => state.customWindowWidth),
    customWindowHeight: computed(() => state.customWindowHeight),
    debugLogging: computed(() => state.debugLogging),
    loaded: computed(() => state.loaded),
  }
}
