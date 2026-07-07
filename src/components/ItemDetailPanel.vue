<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from "vue"
import type { Item } from "@/store/items"
import { showToast } from "@/store/toast"
import { isOverdue, getWorkflowProjectName } from "@/lib/item-utils"
import { useCalendar } from "@/composables/useCalendar"

onUnmounted(() => {
  document.removeEventListener("mousedown", handleCalClickOutside)
})

const props = defineProps<{
  item: Item | null
  lockedItemId: number | null
}>()

const emit = defineEmits<{
  close: []
  complete: [id: number]
  uncomplete: [id: number]
  delete: [id: number]
  save: [data: {
    id: number
    name: string
    description: string
    startDate: string
    endDate: string
    priority: string
    repeatType: string
  }]
  comment: [data: { itemId: number; content: string }]
}>()

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
  calPosition.value = { top: rect.bottom + 4, left }
  // 先移除旧监听器再注册，防止重复注册导致泄漏
  document.removeEventListener("mousedown", handleCalClickOutside)
  document.addEventListener("mousedown", handleCalClickOutside)
}

function handleCalClickOutside(e: MouseEvent) {
  if (calPanelRef.value && !calPanelRef.value.contains(e.target as Node)) {
    closeCal()
    document.removeEventListener("mousedown", handleCalClickOutside)
  }
}

function selectDay(d: number) {
  const dateStr = formatDay(calYear.value, calMonth.value, d)
  if (form.value.repeatType !== "none") {
    form.value.startDate = dateStr
    form.value.endDate = dateStr
    closeCal()
    saveField("startDate")
  } else if (calMode.value === "start") {
    form.value.startDate = dateStr
    if (form.value.endDate && form.value.endDate < dateStr) {
      form.value.endDate = ""
    }
    closeCal()
    saveField("startDate")
  } else {
    if (dateStr >= form.value.startDate) {
      form.value.endDate = dateStr
      closeCal()
      saveField("endDate")
    }
  }
}

// 计算属性
const isLocked = computed(() => props.item?.id === props.lockedItemId)
const isOverdueItem = computed(() => props.item ? isOverdue(props.item.endDate) : false)
const isReadonly = computed(() => props.item?.done ?? false)
const isPriorityDisabled = computed(() => isReadonly.value || isLocked.value)
const workflowProjectName = computed(() => {
  if (!props.item?.workflowRef) return ""
  return getWorkflowProjectName(props.item.workflowRef.projectId)
})

// 评论
const commentText = ref("")
const visibleLogCount = ref(3)

const sortedComments = computed(() => {
  if (!props.item?.comments) return []
  return [...props.item.comments].sort((a, b) => b.id - a.id)
})

const displayComments = computed(() => {
  return sortedComments.value.slice(0, visibleLogCount.value)
})

const hasMoreComments = computed(() => {
  return visibleLogCount.value < sortedComments.value.length
})

function loadMoreComments() {
  visibleLogCount.value += 5
}

// 保存（对齐 NodeDetailPanel：失焦/修改即存，无保存按钮）
function saveField(field: string) {
  if (isReadonly.value || !props.item) return
  const data: any = { id: props.item.id }
  switch (field) {
    case "name": data.name = form.value.name; break
    case "description": data.description = form.value.description; break
    case "startDate": data.startDate = form.value.startDate; data.endDate = form.value.endDate; break
    case "endDate": data.startDate = form.value.startDate; data.endDate = form.value.endDate; break
    case "priority": data.priority = form.value.priority; break
    case "repeatType": data.repeatType = form.value.repeatType; break
  }
  // 补全未修改的字段
  if (data.name === undefined) data.name = form.value.name
  if (data.description === undefined) data.description = form.value.description
  if (data.startDate === undefined) data.startDate = form.value.startDate
  if (data.endDate === undefined) data.endDate = form.value.endDate
  if (data.priority === undefined) data.priority = form.value.priority
  if (data.repeatType === undefined) data.repeatType = form.value.repeatType
  emit("save", data)
  if (field === "priority") showToast("优先级已更新", "success")
}

// 同步 props → form
watch(() => props.item, (val) => {
  if (val) {
    form.value = {
      name: val.name,
      description: val.description,
      startDate: val.startDate,
      endDate: val.endDate,
      priority: val.priority,
      repeatType: val.repeatType || "none",
    }
    showCal.value = false
    commentText.value = ""
    visibleLogCount.value = 3
  }
}, { immediate: true })

function close() {
  emit("close")
}

function handleComplete() {
  if (props.item && !isLocked.value) {
    emit("complete", props.item.id)
  }
}

function handleUncomplete() {
  if (props.item) {
    emit("uncomplete", props.item.id)
  }
}

function handleDelete() {
  if (props.item && !isLocked.value) {
    emit("delete", props.item.id)
  }
}

function handleCommentSubmit() {
  if (!commentText.value.trim() || !props.item) return
  emit("comment", { itemId: props.item.id, content: commentText.value.trim() })
  commentText.value = ""
}

function formatTimeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "刚刚"
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}天前`
  const date = new Date(ts)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${month}-${day}`
}

function handleCommentKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault()
    handleCommentSubmit()
  }
}
</script>

<template>
  <div
    v-if="item"
    class="fixed inset-0 z-40 bg-black/30"
    @click.self="close"
  >
    <!-- 面板 -->
    <div
      class="absolute top-0 right-0 h-full w-[380px] bg-card border-l border-border shadow-lg flex flex-col animate-slide-in"
      @click.stop
    >
      <!-- 头部：关闭 + 操作按钮 -->
      <div class="shrink-0 flex items-center justify-between px-4 pt-4 pb-2 border-b border-border">
        <div class="flex items-center gap-1.5">
          <button
            v-if="!item.done && !isLocked"
            class="text-sm px-3 py-1 rounded border border-blue-500 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
            @click="handleComplete"
          >完成</button>
          <button
            v-if="item.done"
            class="text-sm px-3 py-1 rounded border border-blue-500 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
            @click="handleUncomplete"
          >撤回</button>
          <button
            v-if="!isLocked"
            class="text-sm px-3 py-1 rounded border border-red-500 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
            @click="handleDelete"
          >删除</button>
        </div>
        <button
          class="shrink-0 size-6 flex items-center justify-center rounded hover:bg-muted text-muted-foreground hover:text-card-foreground transition-colors"
          @click="close"
        >
          <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <!-- 标题 -->
      <div class="shrink-0 px-4 pt-3 pb-1">
        <input
          v-model="form.name"
          type="text"
          :maxlength="NAME_MAX"
          :readonly="isReadonly"
          class="flex-1 min-w-0 text-base font-semibold bg-transparent border-none outline-none truncate text-card-foreground"
          :class="[isOverdueItem && !isReadonly ? 'text-red-500' : '', isReadonly ? 'line-through text-muted-foreground cursor-default' : 'hover:bg-muted hover:rounded-md hover:px-1 hover:-mx-1 focus:bg-card focus:border focus:border-solid focus:border-cyan-400 focus:rounded-md focus:px-1 focus:-mx-1 transition-all duration-150']"
          placeholder="事项名称"
          @blur="saveField('name')"
        />
        <div class="flex items-center gap-1.5 mt-1 flex-wrap">
          <span v-if="isLocked" class="text-[11px] text-green-500 bg-green-100 dark:bg-green-500/20 rounded px-1.5 leading-normal">🎯 专注中</span>
          <span v-if="isOverdueItem && !isReadonly" class="text-[11px] text-red-500 bg-red-100 dark:bg-red-500/20 rounded px-1.5 leading-normal">已逾期</span>
          <span v-if="item.workflowRef" class="text-[11px] text-muted-foreground bg-muted rounded px-1.5 leading-normal">🔗 {{ workflowProjectName }}</span>
          <!-- 🔁 不再显示在标题区，只显示在日期后面 -->
        </div>
      </div>

      <!-- 内容 -->
      <div class="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-4">
        <!-- 日期 -->
        <div>
          <label class="text-sm font-medium text-card-foreground">
            日期
            <span v-if="form.repeatType !== 'none'" class="text-xs text-muted-foreground ml-1">🔁 {{ { daily: '每天', weekly: '每周', monthly: '每月' }[form.repeatType] }}</span>
          </label>
          <div class="mt-1 flex items-center gap-2 text-sm">
            <input
              :value="form.startDate"
              readonly
              placeholder="开始日期"
              class="flex-1 min-w-0 border border-border rounded-md px-3 py-1.5 text-sm bg-transparent text-card-foreground outline-none placeholder:text-muted-foreground/50"
              :class="isReadonly ? 'cursor-default' : 'cursor-pointer'"
              :disabled="isReadonly"
              @click="!isReadonly && openCal('start', $event)"
            />
            <span class="text-muted-foreground shrink-0">至</span>
            <input
              :value="form.endDate"
              readonly
              placeholder="结束日期"
              class="flex-1 min-w-0 border border-border rounded-md px-3 py-1.5 text-sm bg-transparent text-card-foreground outline-none placeholder:text-muted-foreground/50"
              :class="isReadonly ? 'cursor-default' : 'cursor-pointer'"
              :disabled="isReadonly"
              @click="!isReadonly && openCal('end', $event)"
            />
          </div>
        </div>

        <!-- 日历弹窗（紧贴输入框下方） -->
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
              <button
                v-for="opt in repeatOptions" :key="opt.value"
                class="px-2 py-0.5 rounded transition-colors"
                :class="form.repeatType === opt.value ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-card-foreground bg-muted'"
                @click="form.repeatType = opt.value; saveField('repeatType')"
              >{{ opt.label }}</button>
            </div>
          </div>
        </Teleport>

        <!-- 描述 -->
        <div>
          <label class="text-sm font-medium text-card-foreground">描述</label>
          <div v-if="isReadonly" class="text-sm text-muted-foreground leading-relaxed px-1 py-1 min-h-[40px]">
            {{ form.description || '暂无内容' }}
          </div>
          <div v-else class="mt-1 relative">
            <textarea
              v-model="form.description"
              :maxlength="DESC_MAX"
              rows="3"
              placeholder="添加描述..."
              class="w-full text-sm bg-muted border border-border rounded-lg px-3 py-2 pb-5 resize-none outline-none transition-colors min-h-[60px] focus:border-cyan-400 focus:bg-card"
              @blur="saveField('description')"
            ></textarea>
            <span class="absolute right-2 bottom-2 text-xs text-muted-foreground">{{ form.description.length }}/{{ DESC_MAX }}</span>
          </div>
        </div>

        <!-- 优先级（2×2 布局） -->
        <div>
          <label class="text-sm font-medium text-card-foreground">优先级</label>
          <div class="mt-1 grid grid-cols-2 gap-1.5">
            <label
              v-for="p in priorities" :key="p.value"
              class="flex items-center gap-2 cursor-pointer select-none px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors"
              :class="isPriorityDisabled ? 'pointer-events-none' : ''"
            >
              <input
                type="radio"
                v-model="form.priority"
                :value="p.value"
                :disabled="isPriorityDisabled"
                class="accent-current shrink-0"
                @change="saveField('priority')"
              />
              <span class="text-sm text-white rounded-full px-2.5 py-0.5" :class="p.color">{{ p.label }}</span>
            </label>
          </div>
        </div>

        <!-- 评论（对齐 NodeDetailPanel 风格） -->
        <div class="pt-3 border-t border-border">
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-1.5 text-sm text-muted-foreground">
              <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
              <span>{{ sortedComments.length }} 条评论</span>
            </div>
          </div>

          <!-- 评论输入 -->
          <div v-if="!isReadonly" class="mb-4">
            <div class="flex items-center gap-2">
              <div class="flex-1 relative">
                <input
                  v-model="commentText"
                  class="w-full text-sm bg-muted border border-border rounded-lg px-3 py-2 pr-14 outline-none focus:border-cyan-400 focus:bg-card transition-colors"
                  placeholder="请输入评论..."
                  @keydown="handleCommentKeydown"
                />
              </div>
              <button
                class="shrink-0 size-8 rounded-md bg-cyan-500 text-white flex items-center justify-center hover:bg-cyan-600 transition-colors disabled:opacity-30"
                :disabled="!commentText.trim()"
                @click="handleCommentSubmit"
              >
                <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3 6l3 6M6 12l3 6 3-6M18 6 6 18" />
                </svg>
              </button>
            </div>
          </div>

          <div v-if="displayComments.length > 0" class="space-y-3">
            <div
              v-for="c in displayComments"
              :key="c.id"
              class="flex items-start gap-2.5"
            >
              <span class="size-7 rounded-full text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">💬</span>
              <div class="flex-1 min-w-0">
                <div class="text-[13px] leading-relaxed">
                  <span class="font-medium text-card-foreground">{{ c.author }}</span>
                  <span class="text-muted-foreground mx-0.5">于</span>
                  <span class="text-muted-foreground">{{ c.createdAt.replace('T', ' ').slice(0, 16) }}</span>
                  <span class="text-muted-foreground ml-1">评论了</span>
                  <span class="font-medium text-card-foreground ml-1 break-words">{{ c.content }}</span>
                </div>
                <div class="text-[10px] text-muted-foreground mt-0.5">{{ formatTimeAgo(c.createdAt) }}</div>
              </div>
            </div>
            <button
              v-if="hasMoreComments"
              class="w-full text-xs text-cyan-500 cursor-pointer hover:text-cyan-600 transition-colors py-2 flex items-center justify-center gap-0.5"
              @click="loadMoreComments"
            >
              查看更多 <span>▼</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
@keyframes slide-in {
  from {
    transform: translateX(100%);
  }
  to {
    transform: translateX(0);
  }
}

.animate-slide-in {
  animation: slide-in 0.2s ease-out;
}
</style>