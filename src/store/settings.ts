import { reactive, computed } from "vue"
import { dataStore } from "@/lib/data-store"
import { emit } from "@tauri-apps/api/event"

const DATA_FILE = "data/settings.json"

interface SettingsState {
  theme: "light" | "dark" | "system"
  minimizeToTray: boolean
  loaded: boolean
}

const state = reactive<SettingsState>({
  theme: "light",
  minimizeToTray: false,
  loaded: false,
})

export async function loadSettings(force = false, preloadedData?: any) {
  if (state.loaded && !force) return
  const data = preloadedData ?? await dataStore.read<any>(DATA_FILE)
  if (data?.theme) state.theme = data.theme
  if (data?.minimizeToTray !== undefined) state.minimizeToTray = data.minimizeToTray
  state.loaded = true
}

async function saveSettings() {
  await dataStore.write(DATA_FILE, { theme: state.theme, minimizeToTray: state.minimizeToTray })
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
    loaded: computed(() => state.loaded),
  }
}
