<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue"
import type { WorkflowNode, WorkflowProject } from "@/store/workflow"
import { updateNodeDetail, addNodeComment } from "@/store/workflow"
import { useCalendar } from "@/composables/useCalendar"

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now()
  }, 60000)
})

onUnmounted(() => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
  document.removeEventListener("mousedown", handleCalClickOutside)
})

function formatTimeAgo(ts: string): string {
  const diff = now.value - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return `刚刚`
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}天前`
  const date = new Date(ts)
  const currentYear = new Date().getFullYear()
  const isThisYear = date.getFullYear() === currentYear
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  if (isThisYear) return `${month}-${day}`
  return `${date.getFullYear()}-${month}-${day}`
}

function parseSystemContent(content: string): { action: string; verb: string; target: string } {
  const firstStart = content.indexOf('「')
  const firstEnd = content.indexOf('」')
  if (firstStart === -1 || firstEnd === -1) {
    return { action: '', verb: '', target: content }
  }
  const secondStart = content.indexOf('「', firstEnd)
  if (secondStart !== -1) {
    const secondEnd = content.indexOf('」', secondStart)
    if (secondEnd !== -1) {
      return {
        action: content.slice(0, secondStart),
        verb: '',
        target: content.slice(secondStart + 1, secondEnd),
      }
    }
  }
  // 处理「X」重命名为「Y」已去掉了旧名称的括号，变成 "旧名称 重命名为「新名称」"
  const prefix = content.slice(0, firstStart).trim()
  const renameIdx = prefix.lastIndexOf('重命名为')
  if (renameIdx !== -1) {
    return {
      action: prefix.slice(0, renameIdx).trim(),
      verb: '重命名为',
      target: content.slice(firstStart + 1, firstEnd),
    }
  }
  return {
    action: prefix,
    verb: '',
    target: content.slice(firstStart + 1, firstEnd),
  }
}

const props = defineProps<{
  node: WorkflowNode | null
  stepIdx: number
  nodeIdx: number
  project: WorkflowProject | null
}>()

// ====== 编辑字段 ======
const editName = ref("")
const editStartDate = ref("")
const editEndDate = ref("")
const editDescription = ref("")

// 评论
const commentText = ref("")
const commentAuthor = ref("我")
const pendingImages = ref<string[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)
const previewImage = ref<string | null>(null)
const previewOverlayRef = ref<HTMLDivElement | null>(null)

const previewScale = ref(1)

watch(previewImage, (val) => {
  if (val) {
    previewScale.value = 1
    nextTick(() => {
      previewOverlayRef.value?.focus()
    })
  }
})

function handlePreviewWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  previewScale.value = Math.max(0.5, Math.min(3, previewScale.value + delta))
}

// 展开/收起
const visibleLogCount = ref(3)

watch(() => props.node, (node) => {
  if (node) {
    editName.value = node.name || ""
    editStartDate.value = node.startDate || ""
    editEndDate.value = node.endDate || ""
    editDescription.value = node.description || ""
    visibleLogCount.value = 3
  }
}, { immediate: true })

const sortedLog = computed(() => {
  if (!props.node?.activityLog) return []
  return [...props.node.activityLog]
    .filter(e => e.type === "comment")
    .sort((a, b) => {
      const c = b.timestamp.localeCompare(a.timestamp)
      if (c !== 0) return c
      return b.id - a.id
    })
})

// 项目所有动态（无选中节点时显示）
const projectActivityLog = computed(() => {
  if (!props.project) return []
  const logs: { entry: import("@/store/workflow").ActivityLogEntry; nodeName: string }[] = []

  for (const step of props.project.steps) {
    for (const node of step.nodes) {
      if (node.activityLog) {
        for (const entry of node.activityLog) {
          logs.push({ entry, nodeName: node.name })
        }
      }
    }
  }
  return logs.sort((a, b) => {
    const tsCmp = b.entry.timestamp.localeCompare(a.entry.timestamp)
    if (tsCmp !== 0) return tsCmp
    return b.entry.id - a.entry.id
  })
})

const displayLog = computed(() => {
  return sortedLog.value.slice(0, visibleLogCount.value)
})

const hasMoreLogs = computed(() => {
  return visibleLogCount.value < sortedLog.value.length
})

const completedAtDisplay = computed(() => {
  if (!props.node?.completedAt) return ''
  const parts = props.node.completedAt.split(' ')[0].split('-')
  if (parts.length !== 3) return props.node.completedAt
  return `${parts[0]}年${parts[1]}月${parts[2]}日`
})

function loadMoreLogs() {
  visibleLogCount.value += 5
}

function saveField(field: string) {
  if (!props.node) return
  const data: any = {}
  switch (field) {
    case "name": data.name = editName.value; break
    case "startDate": data.startDate = editStartDate.value; break
    case "endDate": data.endDate = editEndDate.value; break
    case "description": data.description = editDescription.value; break
  }
  updateNodeDetail(props.stepIdx, props.nodeIdx, data)
}

// 日历选择
const calPosition = ref({ top: 0, left: 0 })
const calPanelRef = ref<HTMLElement | null>(null)

const {
  showCal, calMode, calYear, calMonth,
  calTitle, calDays, weekDays,
  isToday, isSameDay, isBeforeStart, formatDay,
  openCal: openCalBase, closeCal, handleCalWheel,
} = useCalendar()

function openCal(mode: "start" | "end", e: MouseEvent) {
  if (props.node?.status === "done") return
  const dateStr = mode === "start" ? editStartDate.value : editEndDate.value
  openCalBase(mode, dateStr || undefined)
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  const panelW = 230
  const left = Math.max(8, Math.min(rect.left, window.innerWidth - panelW - 8))
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
  if (calMode.value === "start") {
    editStartDate.value = dateStr
    if (editEndDate.value && editEndDate.value < dateStr) {
      editEndDate.value = ""
    }
  } else {
    if (editStartDate.value && dateStr >= editStartDate.value) {
      editEndDate.value = dateStr
    }
  }
  closeCal()
  document.removeEventListener("mousedown", handleCalClickOutside)
  saveField(calMode.value === "start" ? "startDate" : "endDate")
}

async function sendComment() {
  const text = commentText.value.trim()
  if (!text && pendingImages.value.length === 0) return
  if (!props.node) return
  try {
    await addNodeComment(props.stepIdx, props.nodeIdx, commentAuthor.value, text, pendingImages.value.length > 0 ? pendingImages.value : undefined)
    commentText.value = ""
    pendingImages.value = []
  } catch {
    // 保存失败不清空
  }
}

function handleCommentKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault()
    sendComment()
  }
}

function handleCommentPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.type.startsWith("image/")) {
      e.preventDefault()
      const file = item.getAsFile()
      if (!file) continue
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        pendingImages.value.push(dataUrl)
      }
      reader.readAsDataURL(file)
      break
    }
  }
}

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files) return
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (!file.type.startsWith("image/")) continue
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      pendingImages.value.push(dataUrl)
    }
    reader.readAsDataURL(file)
  }
  input.value = ""
}

function removePendingImage(idx: number) {
  pendingImages.value.splice(idx, 1)
}

</script>

<template>
  <div class="flex flex-col h-full min-h-0 select-none">
    <!-- 节点详情模式 -->
    <template v-if="node">
      <div class="flex-1 overflow-auto px-5 py-4 space-y-4">
        <!-- 名称 + 完成时间 -->
        <div class="flex items-baseline justify-between gap-3">
          <input
          data-tab-cycle="name"
          v-model="editName"
          class="flex-1 min-w-0 text-base font-semibold bg-transparent border-none outline-none truncate"
            :class="node.status === 'done' ? 'line-through text-muted-foreground cursor-default' : 'text-card-foreground hover:bg-muted hover:rounded-md hover:px-1 hover:-mx-1 focus:bg-card focus:border focus:border-solid focus:border-cyan-400 focus:rounded-md focus:px-1 focus:-mx-1 transition-all duration-150'"
            :readonly="node.status === 'done'"
            @blur="saveField('name')"
          />
          <span v-if="node.status === 'done' && completedAtDisplay" class="text-sm text-muted-foreground shrink-0 whitespace-nowrap select-none">完成于 {{ completedAtDisplay }}</span>
        </div>

        <!-- 用户 + 日期行 -->
        <div class="flex items-center justify-between text-sm text-muted-foreground">
          <div class="flex items-center gap-2 shrink-0">
            <span class="size-8 rounded-full bg-blue-100 text-blue-600 text-sm font-semibold flex items-center justify-center shrink-0 select-none">系</span>
            <span class="select-none whitespace-nowrap text-sm">系统</span>
          </div>
          <div class="flex items-center gap-1.5 text-sm">
            <template v-if="node.status === 'done'">
              <span class="text-muted-foreground">{{ editStartDate || '开始日期' }}</span>
              <span v-if="editStartDate && editEndDate && editStartDate !== editEndDate" class="text-muted-foreground">→</span>
              <span v-if="editStartDate && editEndDate && editStartDate !== editEndDate" class="text-muted-foreground">{{ editEndDate }}</span>
            </template>
            <template v-else>
              <span
                class="cursor-pointer hover:text-card-foreground transition-colors"
                @click="(e: MouseEvent) => openCal('start', e)"
              >{{ editStartDate || '开始日期' }}</span>
              <span v-if="!editStartDate || !editEndDate || editStartDate !== editEndDate" class="text-muted-foreground">→</span>
              <span
                v-if="!editStartDate || !editEndDate || editStartDate !== editEndDate"
                class="cursor-pointer hover:text-card-foreground transition-colors"
                @click="(e: MouseEvent) => openCal('end', e)"
              >{{ editEndDate || '结束日期' }}</span>
            </template>
            <!-- 日历下拉浮层 -->
            <Teleport to="body">
              <div
                v-if="showCal"
                ref="calPanelRef"
                class="fixed z-[60] bg-card border border-border rounded-lg shadow-xl p-3 w-[230px] select-none"
                :style="{ top: calPosition.top + 'px', left: calPosition.left + 'px' }"
                @wheel.prevent="handleCalWheel"
              >
                <div class="text-center text-xs font-medium mb-1.5">{{ calTitle }}</div>
                <div class="grid grid-cols-7 gap-0 text-center text-[11px]">
                  <span v-for="d in weekDays" :key="d" class="py-0.5 text-muted-foreground">{{ d }}</span>
                  <span
                    v-for="(day, i) in calDays"
                    :key="i"
                    class="py-0.5 rounded transition-colors"
                    :class="[
                      day === null ? 'invisible' : '',
                      day !== null && isSameDay(calYear, calMonth, day, editStartDate) ? 'bg-primary text-primary-foreground' : '',
                      day !== null && isSameDay(calYear, calMonth, day, editEndDate) && !isSameDay(calYear, calMonth, day, editStartDate) ? 'bg-primary text-primary-foreground' : '',
                      day !== null && calMode === 'end' && editStartDate && isBeforeStart(calYear, calMonth, day, editStartDate) ? 'text-muted-foreground/30 cursor-not-allowed' : 'cursor-pointer hover:bg-muted',
                      day !== null && !isSameDay(calYear, calMonth, day, editStartDate) && !isSameDay(calYear, calMonth, day, editEndDate) ? (isToday(calYear, calMonth, day) ? 'bg-primary/20 text-primary font-medium' : '') : ''
                    ]"
                    @click="day !== null && selectDay(day)"
                  >{{ day }}</span>
                </div>
              </div>
            </Teleport>
          </div>
        </div>

        <!-- 描述 -->
        <div class="mb-4 relative">
          <div
            v-if="node.status === 'done'"
            class="text-sm text-muted-foreground leading-relaxed px-1 py-1 min-h-[60px]"
          >
            {{ editDescription || '暂无描述' }}
          </div>
          <textarea
            v-else
            data-tab-cycle="desc"
            v-model="editDescription"
            :maxlength="200"
            class="w-full text-sm bg-muted border border-border rounded-lg px-3 py-2 pb-5 resize-none outline-none transition-colors min-h-[60px] focus:border-cyan-400 focus:bg-card"
            placeholder="添加描述..."
            rows="3"
            @blur="saveField('description')"
          ></textarea>
          <span v-if="node.status !== 'done'" class="absolute right-2 bottom-2 text-xs text-muted-foreground">{{ editDescription.length }}/200</span>
        </div>

        <!-- 评论区 -->
        <div>
          <!-- 评论头部 -->
          <div class="flex items-center justify-between mb-3">
            <div class="flex items-center gap-1.5 text-sm text-muted-foreground">
              <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
              </svg>
              <span>{{ sortedLog.length }} 条评论</span>
            </div>
          </div>

          <!-- 评论输入 -->
          <div class="mb-4">
            <!-- 待上传图片预览 -->
            <div v-if="pendingImages.length > 0" class="flex flex-wrap gap-2 mb-2">
              <div v-for="(img, idx) in pendingImages" :key="idx" class="relative group">
                <img :src="img" class="w-16 h-16 object-cover rounded-lg border border-border cursor-pointer" @click="previewImage = img" />
                <button class="absolute -top-1.5 -right-1.5 size-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" @click.stop="removePendingImage(idx)">×</button>
              </div>
            </div>
            <div class="flex items-center gap-2">
              <div class="flex-1 relative">
                <input
                  data-tab-cycle="comment"
                  v-model="commentText"
                  class="w-full text-sm bg-muted border border-border rounded-lg px-3 py-2 pr-14 outline-none focus:border-cyan-400 focus:bg-card transition-colors"
                  placeholder="请输入评论..."
                  @keydown="handleCommentKeydown"
                  @paste="handleCommentPaste"
                />
                <button
                  class="absolute right-2 top-1/2 -translate-y-1/2 size-7 rounded flex items-center justify-center text-muted-foreground hover:text-card-foreground cursor-pointer transition-colors"
                  title="上传图片"
                  @click.stop="fileInputRef?.click()"
                >
                  <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                    <path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Zm16.5-13.5h.008v.008h-.008V7.5Z" />
                  </svg>
                </button>
                <input ref="fileInputRef" type="file" accept="image/*" multiple class="hidden" @change="handleFileSelect" />
              </div>
              <button
                class="shrink-0 px-3 py-1.5 rounded-md bg-cyan-500 text-white text-sm flex items-center gap-1 hover:bg-cyan-600 cursor-pointer transition-colors"
                title="发送评论"
                @click="sendComment"
              >
                <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3 6l3 6M6 12l3 6 3-6M18 6 6 18"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- 评论列表 -->
          <div v-if="sortedLog.length > 0" class="space-y-4">
            <div
              v-for="entry in displayLog"
              :key="entry.id"
              class="flex items-start gap-2.5"
            >
              <span
                class="size-7 rounded-full text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5"
                :class="entry.type === 'system' ? 'bg-muted text-muted-foreground' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'"
              >{{ entry.type === 'system' ? '⚡' : '💬' }}</span>
              <div class="flex-1 min-w-0">
                <div class="text-[13px] leading-relaxed">
                  <span class="font-medium" :class="entry.type === 'system' ? 'text-muted-foreground' : 'text-card-foreground'">{{ entry.type === 'system' ? '系统' : (entry.author || '我') }}</span>
                  <span class="text-muted-foreground mx-0.5">于</span>
                  <span class="text-muted-foreground">{{ entry.timestamp.replace('T', ' ').slice(0, 16) }}</span>
                  <template v-if="entry.type === 'comment'">
                    <span class="text-muted-foreground ml-1">评论了</span>
                    <span class="font-medium text-card-foreground ml-1 break-words">{{ entry.content }}</span>
                    <div v-if="entry.images && entry.images.length > 0" class="flex flex-wrap gap-2 mt-2">
                      <img v-for="(img, imgIdx) in entry.images" :key="imgIdx" :src="img" class="max-w-[200px] max-h-[150px] rounded-lg border border-gray-200 cursor-pointer object-cover" @click="previewImage = img" />
                    </div>
                  </template>
                  <template v-else>
                    <template v-if="parseSystemContent(entry.content).verb">
                      <span class="font-medium text-card-foreground ml-1">{{ parseSystemContent(entry.content).action }}</span>
                      <span class="text-muted-foreground ml-1">重命名为</span>
                      <span class="font-medium text-card-foreground ml-0">「{{ parseSystemContent(entry.content).target }}」</span>
                    </template>
                    <template v-else>
                      <span class="text-muted-foreground ml-1">{{ parseSystemContent(entry.content).action }}</span>
                      <span class="font-medium text-card-foreground ml-1">{{ parseSystemContent(entry.content).target }}</span>
                    </template>
                  </template>
                </div>
                <div class="text-[10px] text-muted-foreground mt-0.5">{{ formatTimeAgo(entry.timestamp) }}<span class="opacity-0">{{ now }}</span></div>
              </div>
            </div>
            <button
              v-if="hasMoreLogs"
              class="w-full text-xs text-cyan-500 cursor-pointer hover:text-cyan-600 transition-colors py-2 flex items-center justify-center gap-0.5"
              @click="loadMoreLogs"
            >
              查看更多 <span>▼</span>
            </button>
          </div>
        </div>
      </div>
    </template>

    <!-- 流程动态模式（未选中节点） -->
    <template v-else>
      <div class="flex-1 overflow-auto px-5 py-4">
        <div class="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">
          <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>全部动态</span>
        </div>

        <div v-if="projectActivityLog.length === 0" class="text-xs text-muted-foreground py-10 text-center">
          暂无动态
        </div>
        <div v-else class="space-y-4">
          <div
            v-for="item in projectActivityLog"
            :key="item.entry.id"
            class="flex items-start gap-2.5"
          >
            <span
              class="size-7 rounded-full text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5"
              :class="item.entry.type === 'system' ? 'bg-muted text-muted-foreground' : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'"
            >{{ item.entry.type === 'system' ? '⚡' : '💬' }}</span>
            <div class="flex-1 min-w-0">
              <div class="text-[13px] leading-relaxed">
                <span class="font-medium" :class="item.entry.type === 'system' ? 'text-muted-foreground' : 'text-card-foreground'">{{ item.entry.type === 'system' ? '系统' : (item.entry.author || '我') }}</span>
                <span class="text-muted-foreground mx-1">于</span>
                <span class="text-muted-foreground">{{ item.entry.timestamp.replace('T', ' ').slice(0, 16) }}</span>
                <template v-if="item.entry.type === 'comment'">
                  <span class="text-muted-foreground ml-1">评论了</span>
                  <span class="font-semibold text-card-foreground ml-1 break-words">{{ item.entry.content }}</span>
                  <div v-if="item.entry.images && item.entry.images.length > 0" class="flex flex-wrap gap-2 mt-2">
                    <img v-for="(img, imgIdx) in item.entry.images" :key="imgIdx" :src="img" class="max-w-[200px] max-h-[150px] rounded-lg border border-border cursor-pointer object-cover" @click="previewImage = img" />
                  </div>
                </template>
                <template v-else>
                  <template v-if="parseSystemContent(item.entry.content).verb">
                    <span class="font-semibold text-card-foreground ml-1">{{ parseSystemContent(item.entry.content).action }}</span>
                    <span class="text-muted-foreground ml-1">重命名为</span>
                    <span class="font-semibold text-card-foreground ml-0">「{{ parseSystemContent(item.entry.content).target }}」</span>
                  </template>
                  <template v-else>
                    <span class="text-muted-foreground ml-1">{{ parseSystemContent(item.entry.content).action }}</span>
                    <span class="font-semibold text-card-foreground ml-1">{{ parseSystemContent(item.entry.content).target }}</span>
                  </template>
                </template>
              </div>
              <div class="text-[10px] text-muted-foreground mt-0.5">{{ formatTimeAgo(item.entry.timestamp) }}<span class="opacity-0">{{ now }}</span></div>
            </div>
          </div>
        </div>
      </div>
    </template>
  </div>

  <!-- 大图预览遮罩 -->
  <Teleport to="body">
    <div v-if="previewImage" ref="previewOverlayRef" tabindex="-1" class="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center outline-none" @click="previewImage = null" @keydown.escape="previewImage = null" @wheel="handlePreviewWheel">
      <img :src="previewImage" class="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl transition-transform duration-150 ease-out" :style="{ transform: `scale(${previewScale})` }" @click.stop @wheel.stop="handlePreviewWheel" />
      <div class="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-xs bg-black/40 px-2.5 py-1 rounded-full pointer-events-none select-none">
        {{ Math.round(previewScale * 100) }}%
      </div>
      <button class="absolute top-4 right-4 size-8 bg-white/20 text-white rounded-full text-lg flex items-center justify-center cursor-pointer hover:bg-white/40 transition-colors" @click="previewImage = null">×</button>
    </div>
  </Teleport>
</template>