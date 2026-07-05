<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue"
import AddItemModal from "@/components/AddItemModal.vue"
import ItemDetailPanel from "@/components/ItemDetailPanel.vue"
import { useItems } from "@/store/items"
import type { Item } from "@/store/items"
import { showToast } from "@/store/toast"
import { isOverdue, getWorkflowProjectName } from "@/lib/item-utils"
import { useItemFilter } from "@/composables/useItemFilter"
import { useItemDrag } from "@/composables/useItemDrag"
import { usePomodoroStore } from "@/store/pomodoro"

const { addItem, completeItem, uncompleteItem, deleteItem, loadItems, clearDoneItems, updateItem, addItemComment } = useItems()
const { lockedItemId } = usePomodoroStore()

onMounted(() => { loadItems() })

const {
  activeTab, searchKeyword, overdueCount, currentItems, quadrants, getQuadrantItems,
} = useItemFilter()

const {
  dragItemId, dragOverKey, dragOverIndex, isDragging, dragX, dragY, dragItemName, onMouseDown, dragActive,
} = useItemDrag()

const showModal = ref(false)
const showClearConfirm = ref(false)
const viewMode = ref<"board" | "list">("board")
const selectedItem = ref<Item | null>(null)

// 看板卡片点击 → 打开详情面板（排除拖拽后的误触）
function handleCardClick(itemId: number) {
  if (dragActive()) return
  const { items } = useItems()
  const item = items.find(i => i.id === itemId)
  if (item) selectedItem.value = item
}

// Esc 关闭面板 + Tab 禁用焦点切换
function handleKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    selectedItem.value = null
  }
  if (e.key === "Tab") {
    e.preventDefault()
  }
}

onMounted(() => {
  document.addEventListener("keydown", handleKeydown)
})

onUnmounted(() => {
  document.removeEventListener("keydown", handleKeydown)
})

const tabTitle = computed(() => activeTab.value === "todo" ? "待我完成" : "已完成")

const priorityLabels: Record<string, string> = {
  "urgent-important": "重要且紧急",
  "important": "重要不紧急",
  "urgent": "不重要紧急",
  "none": "不重要不紧急",
}

const priorityColors: Record<string, string> = {
  "urgent-important": "bg-red-500",
  "important": "bg-orange-500",
  "urgent": "bg-blue-500",
  "none": "bg-green-500",
}

const { todoItems, syncedItems, doneItems } = useItems()

const listHeaders = computed(() =>
  activeTab.value === "todo"
    ? ["操作", "事项名称", "日期", "优先级", "创建日期"]
    : ["操作", "事项名称", "日期", "优先级", "完成日期"]
)

function openModal() { showModal.value = true }

async function handleComplete(id: number) {
  const ok = await completeItem(id)
  if (ok) showToast("任务完成", "success")
}

async function handleUncomplete(id: number) {
  const ok = await uncompleteItem(id)
  if (ok) showToast("已撤回", "success")
  else showToast("关联流程事项不可撤回")
}

async function handleDelete(id: number) {
  const ok = await deleteItem(id)
  if (ok) showToast("任务已删除", "success")
  else showToast("关联流程的事项无法删除")
}

async function handleClearDone() {
  if (doneItems.value.length === 0) return
  showClearConfirm.value = true
}

async function confirmClearDone() {
  showClearConfirm.value = false
  await clearDoneItems()
  showToast('已清空所有已完成事项', 'success')
  loadItems()
}

function cancelClearDone() { showClearConfirm.value = false }

async function handleCreate(data: { name: string; description: string; startDate: string; endDate: string; priority: string; repeatType: string }) {
  await addItem(data)
  showToast('事项已创建', 'success')
}

// ── 详情面板事件 ──
function handlePanelClose() {
  selectedItem.value = null
}

async function handlePanelComplete(id: number) {
  const ok = await completeItem(id)
  if (ok) {
    showToast("任务完成", "success")
    selectedItem.value = null
  }
}

async function handlePanelUncomplete(id: number) {
  const ok = await uncompleteItem(id)
  if (ok) {
    showToast("已撤回", "success")
    selectedItem.value = null
  } else {
    showToast("关联流程事项不可撤回")
  }
}

async function handlePanelDelete(id: number) {
  const ok = await deleteItem(id)
  if (ok) {
    showToast("任务已删除", "success")
    selectedItem.value = null
  } else {
    showToast("关联流程的事项无法删除")
  }
}

async function handlePanelSave(data: { id: number; name: string; description: string; startDate: string; endDate: string; priority: string; repeatType: string }) {
  await updateItem(data.id, data)
}

async function handlePanelComment(data: { itemId: number; content: string }) {
  await addItemComment(data.itemId, data.content)
}
</script>

<template>
  <div class="h-full p-1 grid grid-cols-[180px_2px_1fr] gap-1 select-none">
    <div class="flex flex-col gap-2 min-h-0">
      <h2 class="text-lg font-semibold text-card-foreground shrink-0">
        概览
      </h2>

      <div class="grid grid-cols-2 gap-2 shrink-0">
        <div class="bg-card border border-border rounded-lg p-2 flex flex-col items-center justify-center gap-0">
          <span class="text-xs text-muted-foreground whitespace-nowrap select-none">已完成</span>
          <span class="text-lg font-semibold text-card-foreground select-none">{{ doneItems.length }}</span>
        </div>
        <div class="bg-card border border-border rounded-lg p-2 flex flex-col items-center justify-center gap-0">
          <span class="text-xs text-muted-foreground whitespace-nowrap select-none">待我完成</span>
          <span class="text-lg font-semibold text-card-foreground select-none">{{ todoItems.length + syncedItems.length }}</span>
        </div>
        <div class="bg-card border border-border rounded-lg p-2 flex flex-col items-center justify-center gap-0 invisible">
          <span class="text-xs whitespace-nowrap">&nbsp;</span>
          <span class="text-lg">&nbsp;</span>
        </div>
        <div class="bg-card border border-border rounded-lg p-2 flex flex-col items-center justify-center gap-0 invisible">
          <span class="text-xs whitespace-nowrap">&nbsp;</span>
          <span class="text-lg">&nbsp;</span>
        </div>
      </div>

      <div class="flex items-center gap-1 shrink-0">
        <div class="flex items-center gap-2 bg-card border border-border rounded-lg px-3 py-1.5 flex-1 min-w-0">
          <svg class="size-4 text-muted-foreground shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/></svg>
          <input
            v-model="searchKeyword"
            type="text"
            placeholder="搜索事项..."
            class="flex-1 text-sm bg-transparent outline-none text-card-foreground placeholder:text-muted-foreground/50 min-w-0 select-text"
          />
        </div>
        <button class="text-sm text-white hover:text-white/90 transition-colors border border-blue-400 bg-blue-400 rounded-md px-3 py-1.5 shrink-0 flex items-center justify-center" @click="openModal">
          +
        </button>
      </div>

      <div class="flex flex-col shrink-0 -mx-1">
        <button
          class="text-sm flex items-center gap-2 w-full px-[13px] py-2.5 border-l-[3px] transition-all duration-150"
          :class="activeTab === 'todo' ? 'bg-blue-50 dark:bg-blue-500/10 border-l-blue-500' : 'text-muted-foreground hover:text-card-foreground border-l-transparent'"
          @click="activeTab = 'todo'"
        >
          <svg class="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2m-6 9 2 2 4-4"/></svg>
          <span class="select-none">待我完成</span>
        </button>
        <button
          class="text-sm flex items-center gap-2 w-full px-[13px] py-2.5 border-l-[3px] transition-all duration-150"
          :class="activeTab === 'done' ? 'bg-blue-50 dark:bg-blue-500/10 border-l-blue-500' : 'text-muted-foreground hover:text-card-foreground border-l-transparent'"
          @click="activeTab = 'done'"
        >
          <svg class="size-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
          <span class="select-none">已完成</span>
        </button>
      </div>

    </div>

    <div class="w-px bg-border rounded-full shrink-0"></div>

    <div class="flex flex-col min-h-0">
      <div class="flex flex-col gap-1 shrink-0">
          <h3 class="text-base font-semibold text-card-foreground flex items-center gap-2">{{ tabTitle }}<span v-if="overdueCount > 0 && activeTab === 'todo'" class="inline-flex items-center justify-center size-5 rounded-full bg-red-500 text-white text-[11px] font-medium leading-none">{{ overdueCount }}</span></h3>
        <div class="flex items-center justify-between gap-1">
          <div class="flex items-center gap-1">
            <button
              class="flex items-center gap-1 px-2 py-1 rounded-none transition-colors text-sm border-b-2 select-none"
              :class="viewMode === 'board' ? 'text-card-foreground border-card-foreground' : 'text-muted-foreground border-transparent hover:text-card-foreground'"
              @click="viewMode = 'board'"
            >
              <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z"/></svg>
              看板
            </button>
            <button
              class="flex items-center gap-1 px-2 py-1 rounded-none transition-colors text-sm border-b-2 select-none"
              :class="viewMode === 'list' ? 'text-card-foreground border-card-foreground' : 'text-muted-foreground border-transparent hover:text-card-foreground'"
              @click="viewMode = 'list'"
            >
              <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z"/></svg>
              列表
            </button>
          </div>
          <button v-if="activeTab === 'done' && viewMode === 'list' && doneItems.length > 0"
            class="text-xs text-muted-foreground hover:text-card-foreground border border-border rounded-md px-2 py-0.5 transition-colors select-none shrink-0"
            @click="handleClearDone"
          >清空已完成</button>
        </div>
      </div>
      <div class="flex-1 overflow-auto pt-4 pb-1 border-t border-border">
        <div v-if="viewMode === 'board'" class="grid grid-cols-[1fr_1fr_1fr_1fr] gap-1 h-full px-1">
          <div v-for="q in quadrants" :key="q.key" class="flex flex-col min-h-0" :data-quadrant="q.key">
            <div class="flex justify-center items-center shrink-0 py-1 mb-2"><span class="text-white text-sm font-medium rounded-full px-3 py-0.5 select-none" :class="q.color">{{ q.label }}</span><span class="text-sm text-muted-foreground ml-1 select-none">{{ getQuadrantItems(q.key).length }}</span></div>
            <div class="flex-1 min-h-0 overflow-auto flex flex-col gap-1">
              <template v-for="(item, idx) in getQuadrantItems(q.key)" :key="item.id">
                <div v-if="isDragging && dragOverKey === q.key && dragOverIndex === idx" class="h-0.5 bg-primary rounded-full shrink-0"></div>
                <div :data-card-id="item.id" class="bg-card rounded-md p-2 select-none transition-colors duration-150 hover:bg-muted/50 cursor-pointer" :class="[!item.done && item.id !== lockedItemId ? 'active:cursor-grabbing' : '', isDragging && dragItemId === item.id ? 'opacity-30' : '']" @mousedown="onMouseDown($event, item.id)" @click.stop="handleCardClick(item.id)">
                  <div class="text-sm truncate flex items-center gap-1" :class="[activeTab === 'todo' && isOverdue(item.endDate) ? 'text-red-500' : 'text-card-foreground', item.done ? 'line-through' : '']"><span class="truncate">{{ item.name }}</span><span v-if="item.workflowRef" class="shrink-0 text-[11px] text-muted-foreground" :title="'来自流程：' + getWorkflowProjectName(item.workflowRef.projectId)">🔗</span><span v-if="!item.done && item.id === lockedItemId" class="shrink-0 text-[11px] text-green-500 bg-green-100 dark:bg-green-500/20 rounded px-1 leading-normal">专注中</span></div>
                  <div class="text-sm text-muted-foreground mt-0.5 flex items-center gap-0.5">
                    <svg class="size-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/></svg>
                    <template v-if="item.startDate === item.endDate">{{ item.startDate }}<span v-if="!item.done && item.repeatType && item.repeatType !== 'none'">  🔁</span></template>
                    <template v-else>{{ item.startDate }} ~ {{ item.endDate }}</template>
                  </div>
                </div>
              </template>
              <div v-if="isDragging && dragOverKey === q.key && dragOverIndex === getQuadrantItems(q.key).length" class="h-0.5 bg-primary rounded-full shrink-0"></div>
            </div>
          </div>
        </div>
        <div v-else class="flex flex-col h-full">
          <div class="grid grid-cols-[80px_1fr_200px_110px_140px] gap-3 px-3 py-2 border-b border-border text-sm font-medium text-muted-foreground shrink-0 select-none">
            <span v-for="header in listHeaders" :key="header" class="whitespace-nowrap text-center">{{ header }}</span>
          </div>
          <div class="flex-1 overflow-auto">
            <div v-if="currentItems.length === 0" class="flex items-center justify-center h-full text-xs text-muted-foreground">
              暂无事项
            </div>
            <div v-else class="flex flex-col">
              <div v-for="item in currentItems" :key="item.id" class="grid grid-cols-[80px_1fr_200px_110px_140px] gap-3 px-3 py-2.5 border-b border-border items-center hover:bg-muted/50">
                <div class="flex items-center justify-center gap-1.5">
                  <button v-if="!item.done && item.id !== lockedItemId" class="text-sm text-blue-500 hover:text-blue-600" @click="handleComplete(item.id)">完成</button>
                  <button v-if="item.done" class="text-sm text-blue-500 hover:text-blue-600" @click="handleUncomplete(item.id)">撤回</button>
                  <button v-if="item.id !== lockedItemId" class="text-sm text-red-500 hover:text-red-600" @click="handleDelete(item.id)">删除</button>
                </div>
                <span class="truncate text-center flex items-center justify-center gap-1 text-sm" :class="[activeTab === 'todo' && isOverdue(item.endDate) ? 'text-red-500' : 'text-card-foreground', item.done ? 'line-through' : '']"><span class="truncate">{{ item.name }}</span><span v-if="item.workflowRef" class="shrink-0 text-[11px] text-muted-foreground" :title="'来自流程：' + getWorkflowProjectName(item.workflowRef.projectId)">🔗</span><span v-if="!item.done && item.id === lockedItemId" class="shrink-0 text-[11px] text-green-500 bg-green-100 dark:bg-green-500/20 rounded px-1 leading-normal">专注中</span></span>
                <span class="whitespace-nowrap text-center flex items-center justify-center gap-0.5 text-sm" :class="activeTab === 'todo' && isOverdue(item.endDate) ? 'text-red-400' : 'text-muted-foreground'">
                  <svg class="size-3.5 inline-block mr-0.5 -mt-px" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5"/></svg>
                  <template v-if="item.startDate === item.endDate">{{ item.startDate }}<span v-if="!item.done && item.repeatType && item.repeatType !== 'none'">  🔁</span></template>
                  <template v-else>{{ item.startDate }} ~ {{ item.endDate }}</template>
                </span>
                <span class="text-white text-sm rounded-full px-1.5 py-0.5 text-center whitespace-nowrap" :class="priorityColors[item.priority]">{{ priorityLabels[item.priority] }}</span>
                <span class="text-muted-foreground text-sm whitespace-nowrap text-center">{{ item.done ? item.doneAt : item.createdAt }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <AddItemModal v-model="showModal" @create="handleCreate" />

    <ItemDetailPanel
      :item="selectedItem"
      :locked-item-id="lockedItemId"
      @close="handlePanelClose"
      @complete="handlePanelComplete"
      @uncomplete="handlePanelUncomplete"
      @delete="handlePanelDelete"
      @save="handlePanelSave"
      @comment="handlePanelComment"
    />

    <!-- 清空确认弹窗 -->
    <Teleport to="body">
      <div v-if="showClearConfirm" class="fixed inset-0 z-[9999] flex items-center justify-center bg-black/30" @click.self="cancelClearDone">
        <div class="bg-card border border-border rounded-lg shadow-lg p-5 w-80 select-none">
          <h4 class="text-base font-semibold text-card-foreground mb-3">清空已完成事项</h4>
          <p class="text-sm text-muted-foreground mb-5">确定要清空所有已完成事项吗？此操作不可撤销。</p>
          <div class="flex justify-end gap-2">
            <button class="text-sm px-4 py-1.5 rounded-md border border-border text-muted-foreground hover:text-card-foreground transition-colors" @click="cancelClearDone">取消</button>
            <button class="text-sm px-4 py-1.5 rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors" @click="confirmClearDone">清空</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- 拖拽浮动卡片 -->
    <div v-if="isDragging && dragItemName" class="fixed pointer-events-none z-[9999] bg-card rounded-md px-3 py-2 shadow-lg border border-border text-sm text-card-foreground opacity-80" :style="{ left: (dragX + 12) + 'px', top: (dragY + 12) + 'px' }">{{ dragItemName }}</div>

  </div>
</template>
