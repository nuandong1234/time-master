import { reactive, computed } from "vue"
import { dataStore } from "@/lib/data-store"
import { emit } from "@tauri-apps/api/event"

const DATA_FILE = "data/settings.json"

interface SettingsState {
  theme: "light" | "dark" | "system"
  minimizeToTray: boolean
  loaded: boolean
  windowSize: "small" | "medium" | "large" | "maximized" | "custom"
  customWindowWidth: number
  customWindowHeight: number
}

const state = reactive<SettingsState>({
  theme: "light",
  minimizeToTray: false,
  loaded: false,
  windowSize: "medium",
  customWindowWidth: 1200,
  customWindowHeight: 800,
})

export async function loadSettings(force = false, preloadedData?: any) {
  if (state.loaded && !force) return
  const data = preloadedData ?? await dataStore.read<any>(DATA_FILE)
  if (data?.theme) state.theme = data.theme
  if (data?.minimizeToTray !== undefined) state.minimizeToTray = data.minimizeToTray
  if (data?.windowSize) state.windowSize = data.windowSize
  if (data?.customWindowWidth) state.customWindowWidth = data.customWindowWidth
  if (data?.customWindowHeight) state.customWindowHeight = data.customWindowHeight
  state.loaded = true
}

async function saveSettings() {
  await dataStore.write(DATA_FILE, {
    theme: state.theme,
    minimizeToTray: state.minimizeToTray,
    windowSize: state.windowSize,
    customWindowWidth: state.customWindowWidth,
    customWindowHeight: state.customWindowHeight,
  })
}

export function setTheme(theme: "light" | "dark" | "system") {
  state.theme = theme
  applyTheme(theme)
  saveSettings()
  emit("theme-changed", theme).catch(() => {})
}

export function setMinimizeToTray(enabled: boolean) {
  state.minimizeToTray = enabled
  saveSettings()
}

export function setWindowSize(
  preset: "small" | "medium" | "large" | "maximized" | "custom",
  customWidth?: number,
  customHeight?: number,
) {
  state.windowSize = preset
  if (customWidth !== undefined) state.customWindowWidth = customWidth
  if (customHeight !== undefined) state.customWindowHeight = customHeight
  saveSettings()
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
    loaded: computed(() => state.loaded),
  }
}
