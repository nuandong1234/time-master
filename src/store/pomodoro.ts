import { reactive, computed, ref } from "vue"
import { formatDate } from "@/lib/datetime"
import { dataStore } from "@/lib/data-store"

const DATA_FILE = "data/pomodoro.json"

const state = reactive({
  pomodoroCompleted: 0,
  pomodoroDate: "",
  totalFocusSeconds: 0,
  focusDate: "",
  focusMinutes: 25,
  breakMinutes: 5,
  totalRounds: 4,
  loaded: false,
})

async function migrateFromItems() {
  const oldData = await dataStore.read<any>("data/items.json")
  if (oldData && (oldData.pomodoroCompleted !== undefined || oldData.focusMinutes !== undefined)) {
    state.pomodoroCompleted = oldData.pomodoroCompleted || 0
    state.pomodoroDate = oldData.pomodoroDate || ""
    state.totalFocusSeconds = oldData.totalFocusSeconds || 0
    state.focusDate = oldData.focusDate || ""
    state.focusMinutes = oldData.focusMinutes ?? 25
    state.breakMinutes = oldData.breakMinutes ?? 5
    state.totalRounds = oldData.totalRounds ?? 4
    delete oldData.pomodoroCompleted; delete oldData.pomodoroDate
    delete oldData.totalFocusSeconds; delete oldData.focusDate
    delete oldData.focusMinutes; delete oldData.breakMinutes; delete oldData.totalRounds
    await dataStore.write("data/items.json", oldData)
  }
}

export async function loadPomodoroSettings(force = false, preloadedData?: any) {
  if (state.loaded && !force) return
  const data = preloadedData ?? await dataStore.read<any>(DATA_FILE)
  if (data) {
    Object.assign(state, data, { loaded: true })
    return
  }
  await migrateFromItems()
  state.loaded = true
}

async function savePomodoro() {
  await dataStore.write(DATA_FILE, {
    pomodoroCompleted: state.pomodoroCompleted,
    pomodoroDate: state.pomodoroDate,
    totalFocusSeconds: state.totalFocusSeconds,
    focusDate: state.focusDate,
    focusMinutes: state.focusMinutes,
    breakMinutes: state.breakMinutes,
    totalRounds: state.totalRounds,
  })
}

export async function addFocusSeconds(seconds: number) {
  const today = formatDate(new Date())
  if (state.focusDate !== today) {
    state.totalFocusSeconds = 0
    state.focusDate = today
  }
  state.totalFocusSeconds += seconds
  await savePomodoro()
}

export async function incrementPomodoro() {
  const today = formatDate(new Date())
  if (state.pomodoroDate !== today) { state.pomodoroCompleted = 1; state.pomodoroDate = today }
  else { state.pomodoroCompleted++ }
  await savePomodoro()
}

export async function resetPomodoroIfNewDay() {
  const today = formatDate(new Date())
  if (state.pomodoroDate !== today) {
    state.pomodoroCompleted = 0; state.pomodoroDate = today
    state.totalFocusSeconds = 0; state.focusDate = today
    await savePomodoro()
  }
}

export async function saveTimerSettings(settings: { focusMinutes: number; breakMinutes: number; totalRounds: number }) {
  state.focusMinutes = settings.focusMinutes
  state.breakMinutes = settings.breakMinutes
  state.totalRounds = settings.totalRounds
  await savePomodoro()
}

const lockedItemId = ref<number | null>(null)
export function setLockedItemId(id: number | null) { lockedItemId.value = id }

export function usePomodoroStore() {
  return {
    pomodoroCompleted: computed(() => state.pomodoroCompleted),
    totalFocusSeconds: computed(() => state.totalFocusSeconds),
    focusMinutesSetting: computed(() => state.focusMinutes),
    breakMinutesSetting: computed(() => state.breakMinutes),
    totalRoundsSetting: computed(() => state.totalRounds),
    lockedItemId,
    loadPomodoroSettings, incrementPomodoro,
    addFocusSeconds, saveTimerSettings, setLockedItemId, resetPomodoroIfNewDay,
  }
}
