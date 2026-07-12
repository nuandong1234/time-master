import { setTheme, applyTheme, loadSettings } from "@/store/settings"

let mediaQuery: MediaQueryList | null = null
let systemThemeHandler: (() => void) | null = null

export function useTheme() {
  async function initTheme() {
    await loadSettings()
  }

  function changeTheme(theme: "light" | "dark" | "system") {
    setTheme(theme)
  }

  function startSystemThemeWatch() {
    if (mediaQuery) return
    mediaQuery = window.matchMedia("(prefers-color-scheme: dark)")
    systemThemeHandler = () => {
      applyTheme("system")
    }
    mediaQuery.addEventListener("change", systemThemeHandler)
  }

  function stopSystemThemeWatch() {
    if (mediaQuery && systemThemeHandler) {
      mediaQuery.removeEventListener("change", systemThemeHandler)
      mediaQuery = null
      systemThemeHandler = null
    }
  }

  return { initTheme, changeTheme, startSystemThemeWatch, stopSystemThemeWatch }
}
