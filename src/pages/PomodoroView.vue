<script setup lang="ts">
import { ref, reactive, computed, onMounted, onUnmounted, nextTick } from "vue"
import AddItemModal from "@/components/AddItemModal.vue"
import EditItemModal from "@/components/EditItemModal.vue"
import { useItems } from "@/store/items"
import type { Item } from "@/store/items"
import { showToast } from "@/store/toast"
import { isOverdue, getWorkflowProjectName } from "@/lib/item-utils"
import { usePomodoroTimer } from "@/composables/usePomodoroTimer"
import { usePomodoroStore } from "@/store/pomodoro"

const { todoItems, syncedItems, todayCompletedItems, addItem, syncItem, completeItem, updateItem, deleteItem, resetExpiredSynced, loadItems } = useItems()

const { pomodoroCompleted, totalFocusSeconds, lockedItemId } = usePomodoroStore()

onMounted(async () => {
  await loadItems()
  await resetExpiredSynced()
  document.addEventListener("keydown", handleTabBlock)
})

onUnmounted(() => {
  document.removeEventListener("keydown", handleTabBlock)
})

function handleTabBlock(e: KeyboardEvent) {
  if (e.key === "Tab") {
    e.preventDefault()
  }
}

const {
  focusMinutes, breakMinutes, totalRounds,
  currentRound, linkedItem, lockedItem, timerPhase, timerInterval,
  showCompleteConfirm, pendingCompleteItem,
  displayTime, timerProgress, phaseLabel, circumference,
  startPomodoro, togglePause, resetTimer,
  selectLinkedItem, handleWheel,
  handleConfirmComplete, handleCancelComplete,
} = usePomodoroTimer()

const showModal = ref(false)
const showEditModal = ref(false)
const editingItem = ref<Item | null>(null)
const expandedIds = reactive(new Set<number>())
const overflowIds = reactive(new Set<number>())

async function handleSync(id: number) {
  await syncItem(id)
  showToast("同步成功", "success")
}

async function handleComplete(id: number) {
  if (id === lockedItemId.value) { showToast("任务正在专注中，不能完成"); return }
  const ok = await completeItem(id)
  if (ok) showToast("任务完成", "success")
}

function checkDescOverflow(id: number, el: any) {
  if (!el) return
  nextTick(() => {
    if (el.scrollHeight > el.clientHeight) {
      overflowIds.add(id)
    } else {
      overflowIds.delete(id)
    }
  })
}

function toggleExpand(id: number) {
  if (expandedIds.has(id)) {
    expandedIds.delete(id)
    overflowIds.add(id)
  } else {
    expandedIds.add(id)
  }
}

function openModal() {
  showModal.value = true
}

function openEditModal(item: Item) {
  editingItem.value = item
  showEditModal.value = true
}

async function handleEditSave(data: { id: number; name: string; description: string; startDate: string; endDate: string; priority: string; repeatType: string }) {
  await updateItem(data.id, data)
  showToast('已保存', 'success')
}

function handleDeleteItem(id: number) {
  deleteItem(id)
}

async function handleCreate(data: { name: string; description: string; startDate: string; endDate: string; priority: string; repeatType: string }) {
  await addItem(data)
  showToast('事项已创建', 'success')
}

const priorityColors: Record<string, string> = {
  "urgent-important": "bg-red-500",
  "important": "bg-orange-500",
  "urgent": "bg-blue-500",
  "none": "bg-green-500",
}

const priorityLabels: Record<string, string> = {
  "urgent-important": "重要且紧急",
  "important": "重要不紧急",
  "urgent": "不重要紧急",
  "none": "不重要不紧急",
}

const priorityOrder: Record<string, number> = {
  "urgent-important": 0,
  "important": 1,
  "urgent": 2,
  "none": 3,
}

const sortedTodoItems = computed(() => {
  return [...todoItems.value].sort((a, b) => {
    const pa = priorityOrder[a.priority] ?? 4
    const pb = priorityOrder[b.priority] ?? 4
    if (pa !== pb) return pa - pb
    return a.createdAt.localeCompare(b.createdAt)
  })
})

const sortedSyncedItems = computed(() => {
  return [...syncedItems.value].sort((a, b) =>
    b.syncedDate.localeCompare(a.syncedDate)
  )
})
</script>

<template>
  <div class="h-full p-px grid grid-cols-3 grid-rows-[6fr_4fr] gap-px select-none">
    <section
      class="bg-card border border-border rounded-lg p-3 pr-0 row-span-2 flex flex-col"
    >
      <div class="flex items-center justify-between mb-2">
        <h3 class="text-lg font-semibold text-card-foreground">
          待办事项
        </h3>
        <button
          class="text-sm text-white hover:text-white/90 transition-colors border border-blue-400 dark:border-blue-500 bg-blue-400 dark:bg-blue-600 rounded-md px-3 py-1.5 mr-3"
          @click="openModal"
        >
          + 添加事项
        </button>
      </div>
      <div
        class="flex-1 overflow-auto"
      >
        <div v-if="todoItems.length === 0" class="flex items-center justify-center h-full text-xs text-muted-foreground">
          暂无待办事项
        </div>
        <div v-else class="flex flex-col gap-2">
          <div v-for="item in sortedTodoItems" :key="item.id" class="rounded-md p-3 hover:bg-muted/50" @dblclick="openEditModal(item)">
            <div class="flex items-start gap-2">
              <div class="flex-1 min-w-0">
                <div class="text-sm flex items-center gap-1.5 flex-wrap" :class="isOverdue(item.endDate) ? 'text-red-500' : 'text-card-foreground'">
                  <span class="cursor-pointer text-sm" @click="handleSync(item.id)">⬜</span>
                  <span class="text-base">{{ item.name }}</span>
                  <span v-if="item.workflowRef" class="shrink-0 text-[11px] text-muted-foreground" :title="'来自流程：' + getWorkflowProjectName(item.workflowRef.projectId)">🔗</span>
                  <span class="text-sm text-white rounded-full px-2 py-px" :class="priorityColors[item.priority]">{{ priorityLabels[item.priority] }}</span>
                </div>
                <div class="text-sm text-muted-foreground mt-1 flex items-center gap-0.5">
                  <svg class="size-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/></svg>
                  <template v-if="item.startDate === item.endDate">{{ item.startDate }}<span v-if="!item.done && item.repeatType && item.repeatType !== 'none'">  🔁 {{ { daily: '每天', weekly: '每周', monthly: '每月' }[item.repeatType] }}</span></template>
                  <template v-else>{{ item.startDate }} ~ {{ item.endDate }}</template>
                </div>
            <div v-if="item.description" class="mt-1.5 flex items-start gap-1">
                  <p :ref="(el: any) => checkDescOverflow(item.id, el)" class="text-sm text-card-foreground flex-1 min-w-0 whitespace-pre-line" :class="expandedIds.has(item.id) ? '' : 'line-clamp-1'">{{ item.description }}</p>
                  <button v-if="expandedIds.has(item.id) || overflowIds.has(item.id)" class="text-xs text-blue-400 hover:text-blue-500 shrink-0" @click.stop="toggleExpand(item.id)">{{ expandedIds.has(item.id) ? '收起' : '展开全部' }}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section
      class="bg-card border border-border rounded-lg p-3 pr-[5px] row-span-2 flex flex-col relative"
    >
      <h3 class="text-lg font-semibold text-card-foreground mb-2">
        今日待办
      </h3>
      <div class="flex-1 overflow-auto" @click.self="linkedItem = null">
        <div v-if="syncedItems.length === 0" class="flex items-center justify-center h-full text-xs text-muted-foreground">
          暂无今日任务
        </div>
        <div v-else class="flex flex-col gap-2">
          <div v-for="item in sortedSyncedItems" :key="item.id" class="rounded-md p-3 hover:bg-muted/50 cursor-pointer ring-2 ring-transparent transition-all" :class="(linkedItem?.id === item.id || lockedItem?.id === item.id) ? 'ring-primary bg-primary/5' : ''" @click="selectLinkedItem(item)">
            <div class="flex items-start gap-2">
              <div class="flex-1 min-w-0">
                <div class="text-sm flex items-center gap-1.5 flex-wrap" :class="isOverdue(item.endDate) ? 'text-red-500' : 'text-card-foreground'">
                  <span class="cursor-pointer text-sm" @click.stop="handleComplete(item.id)">⬜</span>
                  <span class="text-base">{{ item.name }}</span>
                  <span v-if="item.workflowRef" class="shrink-0 text-[11px] text-muted-foreground" :title="'来自流程：' + getWorkflowProjectName(item.workflowRef.projectId)">🔗</span>
                  <span class="text-sm text-white rounded-full px-2 py-px" :class="priorityColors[item.priority]">{{ priorityLabels[item.priority] }}</span>
                  <button v-if="linkedItem?.id === item.id && !lockedItem" class="ml-auto text-sm text-white bg-blue-400 hover:bg-blue-500 rounded-md px-4 py-1.5" @click.stop="startPomodoro">开始</button>
                  <button v-if="lockedItem?.id === item.id" class="ml-auto text-sm text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 rounded-md px-4 py-1.5 cursor-default">进行中</button>
                </div>
                <div class="text-sm text-muted-foreground mt-1 flex items-center gap-0.5">
                  <svg class="size-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/></svg>
                  <template v-if="item.startDate === item.endDate">{{ item.startDate }}<template v-if="!item.done && item.repeatType && item.repeatType !== 'none'">  🔁 {{ { daily: '每天', weekly: '每周', monthly: '每月' }[item.repeatType] }}</template></template>
                  <template v-else>{{ item.startDate }} ~ {{ item.endDate }}</template>
                </div>
                <div v-if="item.description" class="mt-1.5 flex items-start gap-1">
                  <p :ref="(el: any) => checkDescOverflow(item.id, el)" class="text-sm text-card-foreground flex-1 min-w-0 whitespace-pre-line" :class="expandedIds.has(item.id) ? '' : 'line-clamp-2'">{{ item.description }}</p>
                  <button v-if="expandedIds.has(item.id) || overflowIds.has(item.id)" class="text-xs text-blue-400 hover:text-blue-500 shrink-0" @click.stop="toggleExpand(item.id)">{{ expandedIds.has(item.id) ? '收起' : '展开全部' }}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section
      class="bg-card border border-border rounded-lg p-4 flex flex-col gap-3"
    >
      <h3 class="text-lg font-semibold text-card-foreground">
        番茄计时
      </h3>

      <div class="text-sm text-muted-foreground border border-border rounded-md px-3 py-2 text-center">
        <template v-if="linkedItem">
          <span class="text-card-foreground">{{ linkedItem.name }}</span>
        </template>
        <span v-else>无关联事项</span>
      </div>

      <div class="flex-1 flex items-center justify-center">
        <div class="relative size-48">
          <svg class="size-48 -rotate-90" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="42" fill="none" stroke="#e5e7eb" stroke-width="6" />
            <circle cx="50" cy="50" r="42" fill="none" stroke="#60a5fa" stroke-width="6" stroke-linecap="round" stroke-dasharray="263.89" :stroke-dashoffset="circumference * (1 - timerProgress)" class="transition-all duration-1000" />
          </svg>
          <div class="absolute inset-0 flex flex-col items-center justify-center">
            <span class="text-[40px] font-bold tabular-nums leading-none">{{ displayTime }}</span>
            <div class="flex items-center gap-1 mt-1.5">
              <svg v-if="timerPhase === 'idle' || timerPhase === 'ready'" class="size-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" /></svg>
              <svg v-else-if="timerPhase === 'focus'" class="size-3.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="2" /></svg>
              <span v-else class="text-lg text-green-400">☕️</span>
              <span class="text-sm" :class="timerPhase === 'break' ? 'text-green-400' : timerPhase === 'idle' || timerPhase === 'ready' ? 'text-muted-foreground' : 'text-blue-400'">{{ phaseLabel }}</span>
            </div>
            <span class="text-sm text-card-foreground">第 {{ currentRound }}/{{ totalRounds }} 组</span>
          </div>
        </div>
      </div>

      <div class="flex items-center justify-center gap-5">
        <button class="text-sm text-muted-foreground border border-border bg-muted rounded-md px-5 py-2 hover:text-foreground transition-colors" @click="togglePause">{{ timerPhase === 'focus' || timerPhase === 'break' ? (timerInterval ? '暂停' : '继续') : '暂停' }}</button>
        <button class="text-sm text-muted-foreground border border-border bg-muted rounded-md px-5 py-2 hover:text-foreground transition-colors" @click="resetTimer">重置</button>
      </div>

      <div class="border-t border-border pt-3 flex items-center justify-around gap-1 text-sm">
        <label class="flex items-center gap-0.5">
          <span class="text-muted-foreground shrink-0">专注：</span>
          <input type="number" v-model.number="focusMinutes" min="1" max="60" :disabled="timerPhase === 'focus' || timerPhase === 'break'"
            class="w-7 text-center text-card-foreground bg-muted border border-border rounded px-0.5 py-0.5 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none disabled:opacity-40"
            @keydown.prevent
            @wheel="handleWheel($event, 'focus')"
          />
          <span class="text-muted-foreground">分</span>
        </label>
        <label class="flex items-center gap-0.5">
          <span class="text-muted-foreground shrink-0">休息：</span>
          <input type="number" v-model.number="breakMinutes" min="1" max="30" :disabled="timerPhase === 'focus' || timerPhase === 'break'"
            class="w-7 text-center text-card-foreground bg-muted border border-border rounded px-0.5 py-0.5 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none disabled:opacity-40"
            @keydown.prevent
            @wheel="handleWheel($event, 'break')"
          />
          <span class="text-muted-foreground">分</span>
        </label>
        <label class="flex items-center gap-0.5">
          <span class="text-muted-foreground shrink-0">组数：</span>
          <input type="number" v-model.number="totalRounds" min="1" max="10" :disabled="timerPhase === 'focus' || timerPhase === 'break'"
            class="w-7 text-center text-card-foreground bg-muted border border-border rounded px-0.5 py-0.5 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none disabled:opacity-40"
            @keydown.prevent
            @wheel="handleWheel($event, 'rounds')"
          />
          <span class="text-muted-foreground">组</span>
        </label>
      </div>
    </section>

    <section
      class="bg-card border border-border rounded-lg p-3 flex flex-col"
    >
      <h3 class="text-lg font-semibold text-card-foreground mb-2">
        今日概览
      </h3>
      <div class="flex-1 grid grid-cols-2 grid-rows-2 gap-[10px]">
        <div class="bg-muted rounded-md flex flex-col items-center justify-center gap-0.5">
          <span class="text-sm text-muted-foreground">今日完成/今日待办</span>
          <span class="text-xl font-semibold text-card-foreground">{{ todayCompletedItems.length }}/{{ syncedItems.length }}</span>
        </div>
        <div class="bg-muted rounded-md flex flex-col items-center justify-center gap-0.5">
          <span class="text-sm text-muted-foreground">待完成事项</span>
          <span class="text-xl font-semibold text-card-foreground">{{ todoItems.length }}</span>
        </div>
        <div class="bg-muted rounded-md flex flex-col items-center justify-center gap-0.5">
          <span class="text-sm text-muted-foreground">已完成番茄</span>
          <span class="text-xl font-semibold text-card-foreground">{{ pomodoroCompleted }}</span>
        </div>
        <div class="bg-muted rounded-md flex flex-col items-center justify-center gap-0.5">
          <span class="text-sm text-muted-foreground">总专注时长</span>
          <span class="text-xl font-semibold text-card-foreground">{{ Math.round(totalFocusSeconds) < 60 ? Math.round(totalFocusSeconds) + '秒' : Math.floor(Math.round(totalFocusSeconds) / 60) + '分' + (Math.round(totalFocusSeconds) % 60 ? Math.round(totalFocusSeconds) % 60 + '秒' : '') }}</span>
        </div>
      </div>
    </section>

    <AddItemModal v-model="showModal" @create="handleCreate" />
    <EditItemModal v-model="showEditModal" :item="editingItem" @save="handleEditSave" @delete="handleDeleteItem" />

    <!-- 完成确认弹窗 -->
    <Teleport to="body">
      <div v-if="showCompleteConfirm" class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30" @click.self="handleCancelComplete">
        <div class="bg-card border border-border rounded-lg shadow-lg w-80 overflow-hidden">
          <!-- 顶部装饰条 -->
          <div class="h-[3px] bg-gradient-to-r from-green-400 to-green-500"></div>
          <div class="px-5 pt-6 pb-5">
            <!-- 图标 + 标题 -->
            <div class="flex items-center gap-2.5 mb-3.5">
              <div class="size-7 rounded-full bg-green-500 flex items-center justify-center shrink-0">
                <svg class="size-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12"/>
                </svg>
              </div>
              <span class="text-[15px] font-semibold text-card-foreground">番茄钟已完成</span>
            </div>
            <!-- 事项名 -->
            <p class="text-sm text-muted-foreground mb-4">
              是否将"<span class="font-semibold text-card-foreground">{{ pendingCompleteItem?.name }}</span>"标记为已完成？
            </p>
            <p v-if="pendingCompleteItem?.workflowRef" class="inline-flex items-center gap-1.5 text-xs text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md px-2.5 py-1 mb-4">
              <svg class="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              完成后将同步推进项目
            </p>
            <p v-else class="mb-4"></p>
            <div class="flex justify-end items-center gap-1.5 border-t border-border/50 pt-3.5">
              <button class="text-sm px-3.5 py-1.5 rounded-[7px] border border-border bg-card text-muted-foreground hover:text-card-foreground transition-colors" @click="handleCancelComplete">取消</button>
              <button class="text-sm px-[18px] py-1.5 rounded-[7px] bg-green-600 dark:bg-green-500 text-white font-medium hover:bg-green-500 dark:hover:bg-green-400 transition-colors" @click="handleConfirmComplete">标记完成</button>
            </div>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>
