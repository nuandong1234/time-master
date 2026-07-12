<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue"
import type { Item } from "@/store/items"
import { showToast } from "@/store/toast"
import { useCalendar } from "@/composables/useCalendar"

const props = defineProps<{ modelValue: boolean; item: Item | null }>()
const emit = defineEmits<{ "update:modelValue": [value: boolean]; save: [data: { id: number; name: string; description: string; startDate: string; endDate: string; priority: string; repeatType: string }]; delete: [id: number] }>()

const NAME_MAX = 50
const DESC_MAX = 200

const form = ref({
  name: "",
  description: "",
  startDate: "",
  endDate: "",
  priority: "" as "" | "urgent-important" | "important" | "urgent" | "none",
  repeatType: "none",
})

const repeatOptions = [
  { value: "none", label: "不重复" },
  { value: "daily", label: "每天" },
  { value: "weekly", label: "每周" },
  { value: "monthly", label: "每月" },
]

const nameCount = computed(() => form.value.name.length)
const descCount = computed(() => form.value.description.length)

const priorities = [
  { value: "urgent-important" as const, label: "重要且紧急", color: "bg-red-500" },
  { value: "important" as const, label: "重要不紧急", color: "bg-orange-500" },
  { value: "urgent" as const, label: "不重要紧急", color: "bg-blue-500" },
  { value: "none" as const, label: "不重要不紧急", color: "bg-green-500" },
]

// 日历
const {
  showCal, calMode, calYear, calMonth,
  calTitle, calDays, weekDays,
  isToday, isSameDay, isBeforeStart, formatDay,
  openCal: openCalBase, closeCal, handleCalWheel,
} = useCalendar()

const calPosition = ref({ top: 0, left: 0 })
const calPanelRef = ref<HTMLElement | null>(null)

function openCal(mode: "start" | "end", e: MouseEvent) {
  openCalBase(mode, form.value.startDate || undefined)
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const calW = 280
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - calW - 8))
  // 先放到一个临时位置让日历渲染
  calPosition.value = { top: rect.bottom + 4, left }
  nextTick(() => {
    if (!calPanelRef.value) return
    const calH = calPanelRef.value.offsetHeight
    // 优先上方弹出，空间不足时改到下方
    calPosition.value = {
      top: rect.top - calH - 4 >= 8 ? rect.top - calH - 4 : rect.bottom + 4,
      left,
    }
  })
  cleanupCalListeners()
  document.addEventListener("mousedown", handleCalClickOutside)
  window.addEventListener("resize", handleCalResize)
}

function handleCalClickOutside(e: MouseEvent) {
  if (calPanelRef.value && !calPanelRef.value.contains(e.target as Node)) {
    closeCal()
    cleanupCalListeners()
  }
}

function handleCalResize() {
  closeCal()
  cleanupCalListeners()
}

function selectDay(d: number) {
  const dateStr = formatDay(calYear.value, calMonth.value, d)
  if (form.value.repeatType !== "none") {
    form.value.startDate = dateStr
    form.value.endDate = dateStr
    closeCal()
    cleanupCalListeners()
  } else if (calMode.value === "start") {
    form.value.startDate = dateStr
    if (form.value.endDate && form.value.endDate < dateStr) {
      form.value.endDate = ""
    }
    closeCal()
    cleanupCalListeners()
  } else {
    if (dateStr >= form.value.startDate) {
      form.value.endDate = dateStr
      closeCal()
      cleanupCalListeners()
    }
  }
}

function cleanupCalListeners() {
  document.removeEventListener("mousedown", handleCalClickOutside)
  window.removeEventListener("resize", handleCalResize)
}

const nameInputRef = ref<HTMLInputElement | null>(null)
const descInputRef = ref<HTMLTextAreaElement | null>(null)

function close() {
  emit("update:modelValue", false)
}

function handleKeydown(e: KeyboardEvent) {
  if (!props.modelValue) return
  if (e.key === "Escape") {
    close()
    return
  }
  if (e.key === "Tab") {
    e.preventDefault()
    const target = e.target as HTMLElement
    if (target === nameInputRef.value) {
      descInputRef.value?.focus()
    } else {
      nameInputRef.value?.focus()
    }
  }
}

onMounted(() => {
  document.addEventListener("keydown", handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener("keydown", handleKeydown)
  document.removeEventListener("mousedown", handleCalClickOutside)
  window.removeEventListener("resize", handleCalResize)
})

function handleDelete() {
  emit("delete", props.item!.id)
  close()
}

function handleSave() {
  if (!form.value.name.trim()) {
    showToast("请输入事项名称")
    return
  }
  if (!form.value.startDate) {
    showToast("请选择开始日期")
    return
  }
  if (!form.value.endDate) {
    showToast("请选择结束日期")
    return
  }
  if (!form.value.priority) {
    showToast("请选择优先级")
    return
  }
  emit("save", {
    id: props.item!.id,
    name: form.value.name,
    description: form.value.description,
    startDate: form.value.startDate,
    endDate: form.value.endDate,
    priority: form.value.priority,
    repeatType: form.value.repeatType,
  })
  close()
}

watch(() => props.modelValue, (val) => {
  if (val && props.item) {
    form.value = {
      name: props.item.name,
      description: props.item.description,
      startDate: props.item.startDate,
      endDate: props.item.endDate,
      priority: props.item.priority,
      repeatType: props.item.repeatType || "none",
    }
    showCal.value = false
    calMode.value = "start"
    const today = new Date()
    calYear.value = today.getFullYear()
    calMonth.value = today.getMonth()
    nextTick(() => {
      nameInputRef.value?.focus()
    })
  }
})
</script>

<template>
  <div v-if="modelValue" class="fixed inset-0 z-50 flex items-center justify-center">
    <div class="absolute inset-0 bg-black/50" @click="close"></div>
    <div class="relative bg-card border border-border rounded-lg shadow-lg w-[520px] p-5">
      <h3 class="text-lg font-semibold text-card-foreground text-center mb-4">编辑事项</h3>

      <div class="flex flex-col gap-3">
        <!-- 事项名称 -->
        <div>
          <label class="text-sm font-medium text-card-foreground">事项名称 <span class="text-red-500">*</span></label>
          <div class="mt-1 relative">
            <input ref="nameInputRef" v-model="form.name" type="text" :maxlength="NAME_MAX" placeholder="请输入事项名称" class="w-full border border-border rounded-md px-3 py-1.5 pr-14 text-sm bg-transparent text-card-foreground outline-none focus:border-primary placeholder:text-muted-foreground/50" />
            <span class="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{{ nameCount }}/{{ NAME_MAX }}</span>
          </div>
        </div>

        <!-- 描述 -->
        <div>
          <label class="text-sm font-medium text-card-foreground">描述</label>
          <div class="mt-1 relative">
            <textarea ref="descInputRef" v-model="form.description" :maxlength="DESC_MAX" rows="3" placeholder="请输入事项描述" class="w-full border border-border rounded-md px-3 py-1.5 pb-5 text-sm bg-transparent text-card-foreground outline-none focus:border-primary resize-none placeholder:text-muted-foreground/50"></textarea>
            <span class="absolute right-2 bottom-2 text-xs text-muted-foreground">{{ descCount }}/{{ DESC_MAX }}</span>
          </div>
        </div>

        <!-- 日期段 -->
        <div>
          <label class="text-sm font-medium text-card-foreground">日期 <span class="text-red-500">*</span><span v-if="form.repeatType !== 'none'" class="text-xs text-muted-foreground ml-2">🔁{{ { daily: '每天', weekly: '每周', monthly: '每月' }[form.repeatType] }}</span></label>
          <div class="mt-1 flex items-center gap-2 text-sm">
            <input :value="form.startDate" readonly placeholder="开始日期" class="flex-1 min-w-0 border border-border rounded-md px-3 py-1.5 text-sm bg-transparent text-card-foreground outline-none cursor-pointer placeholder:text-muted-foreground/50" @click="openCal('start', $event)" />
            <span class="text-muted-foreground shrink-0">至</span>
            <input :value="form.endDate" readonly placeholder="结束日期" class="flex-1 min-w-0 border border-border rounded-md px-3 py-1.5 text-sm bg-transparent text-card-foreground outline-none cursor-pointer placeholder:text-muted-foreground/50" @click="openCal('end', $event)" />
          </div>
        </div>

        <!-- 日历弹出窗口（紧贴输入框上方弹出） -->
        <Teleport to="body">
          <div
            v-if="showCal"
            ref="calPanelRef"
            class="fixed z-[60] bg-card border border-border rounded-lg shadow-xl p-4 w-[280px] select-none"
            :style="{ top: calPosition.top + 'px', left: calPosition.left + 'px' }"
            @wheel.prevent="handleCalWheel"
          >
            <div class="text-center text-sm font-medium text-card-foreground mb-2">{{ calTitle }}</div>
            <div class="grid grid-cols-7 gap-0 text-center text-xs">
              <span v-for="d in weekDays" :key="d" class="py-1 text-muted-foreground">{{ d }}</span>
              <span
                v-for="(day, i) in calDays"
                :key="i"
                class="py-1 rounded transition-colors"
                :class="[
                  day === null ? 'invisible' : '',
                  day !== null && isSameDay(calYear, calMonth, day, form.startDate) ? 'bg-primary text-primary-foreground hover:bg-primary/90' : '',
                  day !== null && isSameDay(calYear, calMonth, day, form.endDate) && !isSameDay(calYear, calMonth, day, form.startDate) ? 'bg-primary text-primary-foreground hover:bg-primary/90' : '',
                  day !== null && calMode === 'end' && form.startDate && isBeforeStart(calYear, calMonth, day, form.startDate) ? 'text-muted-foreground/30 cursor-not-allowed' : 'cursor-pointer hover:bg-muted',
                  day !== null && !isSameDay(calYear, calMonth, day, form.startDate) && !isSameDay(calYear, calMonth, day, form.endDate) && !(calMode === 'end' && form.startDate && isBeforeStart(calYear, calMonth, day, form.startDate)) ? (isToday(calYear, calMonth, day) ? 'bg-primary/20 text-primary font-medium' : 'text-card-foreground') : ''
                ]"
                @click="day !== null && !(calMode === 'end' && form.startDate && isBeforeStart(calYear, calMonth, day, form.startDate)) && selectDay(day)"
              >{{ day }}</span>
            </div>
            <div class="mt-3 pt-3 border-t border-border flex items-center gap-2 text-xs">
              <span class="text-muted-foreground shrink-0">重复：</span>
              <button v-for="opt in repeatOptions" :key="opt.value"
                class="px-2 py-0.5 rounded transition-colors"
                :class="form.repeatType === opt.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-card-foreground bg-muted'"
                @click="form.repeatType = opt.value"
              >{{ opt.label }}</button>
            </div>
          </div>
        </Teleport>

        <!-- 优先级 -->
        <div>
          <label class="text-sm font-medium text-card-foreground">优先级 <span class="text-red-500">*</span></label>
          <div class="mt-1 flex items-center gap-2 flex-nowrap whitespace-nowrap">
            <label v-for="p in priorities" :key="p.value" class="flex items-center gap-1 cursor-pointer shrink-0">
              <input type="radio" v-model="form.priority" :value="p.value" class="accent-current shrink-0" />
              <span class="text-sm text-white rounded-full px-2.5 py-0.5" :class="p.color">{{ p.label }}</span>
            </label>
          </div>
        </div>
      </div>

      <!-- 底部按钮 -->
      <div class="flex items-center justify-between mt-5 gap-2">
        <button @click="handleDelete" class="text-sm px-3 py-1.5 rounded-md text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors">删除</button>
        <div class="flex gap-2">
          <button @click="close" class="text-sm px-4 py-1.5 rounded-md border border-border text-muted-foreground hover:text-card-foreground transition-colors">取消</button>
          <button @click="handleSave" class="text-sm px-4 py-1.5 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors">保存</button>
        </div>
      </div>
    </div>
  </div>
</template>
