import { ref, computed } from "vue"

const monthNames = ["1月", "2月", "3月", "4月", "5月", "6月", "7月", "8月", "9月", "10月", "11月", "12月"]
const weekDays = ["一", "二", "三", "四", "五", "六", "日"]

export function useCalendar() {
  const showCal = ref(false)
  const calMode = ref<"start" | "end">("start")
  const calYear = ref(new Date().getFullYear())
  const calMonth = ref(new Date().getMonth())

  const calTitle = computed(() => `${calYear.value}年 ${monthNames[calMonth.value]}`)

  const calDays = computed(() => {
    const firstDay = new Date(calYear.value, calMonth.value, 1)
    const lastDay = new Date(calYear.value, calMonth.value + 1, 0)
    const days: (number | null)[] = []
    let startDow = firstDay.getDay() - 1
    if (startDow < 0) startDow = 6
    for (let i = 0; i < startDow; i++) days.push(null)
    for (let d = 1; d <= lastDay.getDate(); d++) days.push(d)
    return days
  })

  function isToday(y: number, m: number, d: number) {
    const t = new Date()
    return t.getFullYear() === y && t.getMonth() === m && t.getDate() === d
  }

  function isSameDay(y: number, m: number, d: number, dateStr: string) {
    if (!dateStr) return false
    const [sy, sm, sd] = dateStr.split("-").map(Number)
    return sy === y && sm === m + 1 && sd === d
  }

  function isBeforeStart(y: number, m: number, d: number, startDate: string) {
    if (!startDate) return false
    const ds = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
    return ds < startDate
  }

  function formatDay(y: number, m: number, d: number): string {
    return `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`
  }

  function openCal(mode: "start" | "end", dateStr: string | undefined) {
    calMode.value = mode
    showCal.value = true
    if (dateStr) {
      const [y, m] = dateStr.split("-").map(Number)
      calYear.value = y
      calMonth.value = m - 1
    } else {
      const today = new Date()
      calYear.value = today.getFullYear()
      calMonth.value = today.getMonth()
    }
  }

  function closeCal() {
    showCal.value = false
  }

  function handleCalWheel(e: WheelEvent) {
    e.preventDefault()
    if (e.deltaY > 0) {
      calMonth.value++
      if (calMonth.value > 11) { calMonth.value = 0; calYear.value++ }
    } else {
      calMonth.value--
      if (calMonth.value < 0) { calMonth.value = 11; calYear.value-- }
    }
  }

  return {
    // 状态
    showCal,
    calMode,
    calYear,
    calMonth,
    // 计算属性
    calTitle,
    calDays,
    // 常量
    monthNames,
    weekDays,
    // 辅助函数
    isToday,
    isSameDay,
    isBeforeStart,
    formatDay,
    // 操作
    openCal,
    closeCal,
    handleCalWheel,
  }
}