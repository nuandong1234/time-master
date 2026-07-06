<script setup lang="ts">
import { ref, onMounted, watch } from "vue"
import { invoke } from "@tauri-apps/api/core"
import { emit } from "@tauri-apps/api/event"
import { save, open } from "@tauri-apps/plugin-dialog"
import {
  loadSettings, setTheme, setMinimizeToTray, setWindowSize,
  useSettings, applyTheme
} from "@/store/settings"
import { showToast } from "@/store/toast"
import { loadItems } from "@/store/items"
import { loadPomodoroSettings } from "@/store/pomodoro"
import { initWorkflow } from "@/store/workflow"

const { theme, minimizeToTray, windowSize } = useSettings()

const currentWindowPreset = ref(windowSize.value)

// 跟随外部变化同步下拉框
watch(windowSize, (val) => {
  currentWindowPreset.value = val
})

const themeOptions = [
  { value: "light" as const, label: "浅色", icon: "☀️" },
  { value: "dark" as const, label: "深色", icon: "🌙" },
  { value: "system" as const, label: "跟随系统", icon: "💻" },
]

// ── 系统设置 ──
const autostartEnabled = ref(false)

async function toggleAutostart() {
  const newVal = !autostartEnabled.value
  try {
    await invoke("set_autostart", { enabled: newVal })
    autostartEnabled.value = newVal
    showToast(newVal ? "开机自启已开启" : "开机自启已关闭", "success")
  } catch (e) {
    showToast("设置失败: " + String(e), "error")
  }
}

async function toggleMinimizeToTray() {
  const newVal = !minimizeToTray.value
  try {
    await invoke("set_minimize_to_tray", { enabled: newVal })
    setMinimizeToTray(newVal)
    showToast(newVal ? "关闭时最小化到托盘" : "关闭时直接退出", "success")
  } catch (e) {
    showToast("设置失败: " + String(e), "error")
  }
}

const windowSizeOptions = [
  { value: "small" as const, label: "小 (1000×650)" },
  { value: "medium" as const, label: "中 (1200×800)" },
  { value: "large" as const, label: "大 (1400×900)" },
  { value: "maximized" as const, label: "最大化" },
  { value: "custom" as const, label: "自定义" },
]

async function handleWindowSizeChange(e: Event) {
  const preset = currentWindowPreset.value
  // 选中后立即移除焦点，去掉选中框
  ;(e.target as HTMLElement).blur()
  try {
    if (preset === "custom") {
      // 获取当前窗口尺寸作为自定义尺寸
      const [w, h, max] = await invoke<[number, number, boolean]>("get_window_size")
      if (!max) {
        setWindowSize("custom", w, h)
      } else {
        // 窗口最大化时，先恢复窗口（设为中尺寸），让用户可以手动拖拽调整
        await invoke("set_window_size", { preset: "medium" })
        // 将模式设为 custom（不传宽高，后续手动拖拽会通过 window-resized 事件自动保存尺寸）
        setWindowSize("custom")
        showToast("已取消最大化，请手动拖拽窗口到合适大小", "success")
        return
      }
      showToast("请手动拖拽窗口到合适大小", "success")
    } else {
      await invoke("set_window_size", { preset })
      setWindowSize(preset)
      showToast(`窗口已切换至${windowSizeOptions.find(o => o.value === preset)?.label}`, "success")
    }
  } catch (e) {
    showToast("调整窗口失败: " + String(e), "error")
  }
}

// ── 存储路径 ──
const dataPath = ref("")

async function openDataFolder() {
  try {
    await invoke("open_data_folder")
  } catch (e) {
    showToast("打开文件夹失败: " + String(e), "error")
  }
}

// ── 数据管理 ──
const showResetConfirm = ref(false)

async function handleExportJson() {
  try {
    const path = await save({
      defaultPath: "time-master-export.json",
      filters: [{ name: "JSON", extensions: ["json"] }],
    })
    if (!path) return
    await invoke("export_data", { path, format: "json" })
    showToast("导出成功", "success")
  } catch (e) {
    showToast("导出失败: " + String(e), "error")
  }
}

async function handleImport() {
  try {
    const path = await open({
      filters: [{ name: "JSON", extensions: ["json"] }],
      multiple: false,
    })
    if (!path) return
    await invoke("import_data", { path })
    await loadItems()
    await loadPomodoroSettings()
    await initWorkflow(true)
    showToast("导入成功", "success")
  } catch (e) {
    showToast("导入失败: " + String(e), "error")
  }
}

async function handleReset() {
  showResetConfirm.value = false
  try {
    await invoke("reset_all_data")
    await loadItems(true)
    await loadPomodoroSettings(true)
    await initWorkflow(true)
    await loadSettings(true)
    // 恢复默认后同步应用到功能和后端
    applyTheme(theme.value)
    await invoke("set_minimize_to_tray", { enabled: minimizeToTray.value })
    // 窗口尺寸恢复默认
    currentWindowPreset.value = "medium"
    setWindowSize("medium")
    await invoke("set_window_size", { preset: "medium" })
    emit("reset-all-data")
    showToast("数据已重置", "success")
  } catch (e) {
    showToast("重置失败: " + String(e), "error")
  }
}

onMounted(async () => {
  // 先加载配置，确保读到真实值
  await loadSettings()
  // 同步下拉框
  currentWindowPreset.value = windowSize.value
  // 同步最小化到托盘状态到后端
  try {
    await invoke("set_minimize_to_tray", { enabled: minimizeToTray.value })
  } catch { /* 忽略 */ }
  // 查询实际自启状态
  try {
    autostartEnabled.value = await invoke<boolean>("get_autostart")
  } catch { /* 忽略 */ }
  // 获取数据路径
  try {
    dataPath.value = await invoke<string>("get_data_dir")
  } catch { /* 忽略 */ }
})
</script>

<template>
  <div class="h-full overflow-auto p-6 relative select-none">

    <!-- ⚙️ 系统 -->
    <div class="mb-8">
      <h3 class="text-sm font-semibold text-foreground pb-2 mb-4 border-b border-border/50">
        系统
      </h3>
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <h4 class="text-sm font-medium text-foreground">开机自启</h4>
            <p class="text-xs text-muted-foreground mt-0.5">电脑启动时自动运行</p>
          </div>
          <button
            class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0"
            :class="autostartEnabled ? 'bg-primary' : 'bg-input'"
            @click="toggleAutostart"
          >
            <span
              class="inline-block size-5 rounded-full bg-white shadow-sm transition-transform"
              :class="autostartEnabled ? 'translate-x-[22px]' : 'translate-x-[2px]'"
            />
          </button>
        </div>

        <div class="flex items-center justify-between">
          <div>
            <h4 class="text-sm font-medium text-foreground">关闭时最小化到托盘</h4>
            <p class="text-xs text-muted-foreground mt-0.5">关闭窗口时隐藏到系统托盘，不退出应用</p>
          </div>
          <button
            class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0"
            :class="minimizeToTray ? 'bg-primary' : 'bg-input'"
            @click="toggleMinimizeToTray"
          >
            <span
              class="inline-block size-5 rounded-full bg-white shadow-sm transition-transform"
              :class="minimizeToTray ? 'translate-x-[22px]' : 'translate-x-[2px]'"
            />
          </button>
        </div>

        <div class="flex items-center justify-between">
          <h4 class="text-sm font-medium text-foreground">主题</h4>
          <div class="flex gap-1">
            <button
              v-for="opt in themeOptions"
              :key="opt.value"
              class="px-2.5 py-1 text-xs rounded-md border transition-all"
              :class="theme === opt.value ? 'border-2 border-foreground bg-muted text-foreground' : 'border border-border bg-background text-foreground hover:bg-muted'"
              @click="setTheme(opt.value)"
            ><span>{{ opt.icon }}</span> {{ opt.label }}</button>
          </div>
        </div>

        <!-- 窗口尺寸 -->
        <div class="flex items-center justify-between">
          <div>
            <h4 class="text-sm font-medium text-foreground">窗口尺寸</h4>
            <p class="text-xs text-muted-foreground mt-0.5">调整窗口大小以适应不同屏幕</p>
          </div>
          <select
            v-model="currentWindowPreset"
            class="px-2.5 py-1.5 text-sm rounded-md border border-border bg-background text-foreground outline-none transition-colors cursor-pointer"
            @change="handleWindowSizeChange($event)"
          >
            <option
              v-for="opt in windowSizeOptions"
              :key="opt.value"
              :value="opt.value"
            >{{ opt.label }}</option>
          </select>
        </div>
      </div>
    </div>

    <!-- 💾 数据管理 -->
    <div class="mb-8">
      <h3 class="text-sm font-semibold text-foreground pb-2 mb-4 border-b border-border/50">
        数据管理
      </h3>
      <div class="space-y-3">
        <div class="flex items-center justify-between">
          <h4 class="text-sm font-medium text-foreground">备份</h4>
          <button
            class="px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors"
            @click="handleExportJson"
          >导出</button>
        </div>

        <div class="flex items-center justify-between">
          <h4 class="text-sm font-medium text-foreground">恢复</h4>
          <button
            class="px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors"
            @click="handleImport"
          >导入</button>
        </div>

        <div class="flex items-center justify-between">
          <h4 class="text-sm font-medium text-foreground">数据存储路径</h4>
          <div class="flex items-center gap-2 max-w-[60%]">
            <p class="text-xs text-muted-foreground truncate">{{ dataPath }}</p>
            <button
              class="px-3 py-1.5 text-sm rounded-md border border-border bg-background text-foreground hover:bg-muted transition-colors shrink-0"
              @click="openDataFolder"
            >打开</button>
          </div>
        </div>

        <div class="pt-1">
          <button
            class="px-3 py-1.5 text-sm rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors"
            @click="showResetConfirm = true"
          >恢复出厂设置</button>
        </div>
      </div>
    </div>

    <!-- 二次确认弹窗 -->
    <Teleport to="body">
      <div
        v-if="showResetConfirm"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/40"
        @click.self="showResetConfirm = false"
      >
        <div class="bg-card border border-border rounded-lg shadow-lg p-6 w-full max-w-sm mx-4">
          <h3 class="text-lg font-semibold text-foreground mb-2">恢复出厂设置</h3>
          <p class="text-sm text-muted-foreground mb-6">确定要清空所有数据并恢复默认设置吗？此操作不可恢复。</p>
          <div class="flex justify-end gap-3">
            <button
              class="px-4 py-2 rounded-md text-sm text-foreground bg-muted hover:bg-muted/80 transition-colors"
              @click="showResetConfirm = false"
            >取消</button>
            <button
              class="px-4 py-2 rounded-md text-sm text-white bg-red-500 hover:bg-red-600 transition-colors"
              @click="handleReset"
          >确认</button>
          </div>
        </div>
      </div>
    </Teleport>

  </div>
</template>