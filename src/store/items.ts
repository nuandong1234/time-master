import { reactive, computed } from "vue"
import { formatDateTime, formatDate } from "@/lib/datetime"
import { dataStore } from "@/lib/data-store"
import { onItemCompleted, onItemUpdated, onItemDeleted } from "@/lib/workflow-item-sync"

export interface ItemComment {
  id: number
  content: string
  author: string
  createdAt: string
}

export interface Item {
  id: number
  name: string
  description: string
  startDate: string
  endDate: string
  priority: "urgent-important" | "important" | "urgent" | "none"
  createdAt: string
  done: boolean
  doneAt: string
  synced: boolean
  syncedDate: string
  sortOrder: number
  repeatType: "none" | "daily" | "weekly" | "monthly"
  workflowRef?: {
    projectId: number
    nodeId: number
  }
  comments?: ItemComment[]
}

const DATA_FILE = "data/items.json"

const state = reactive({
  items: [] as Item[],
  nextId: 1,
  loaded: false,
})

export async function loadItems(force = false, preloadedData?: any) {
  if (state.loaded && !force) return
  const data = preloadedData ?? await dataStore.read<any>(DATA_FILE)
  if (data) {
    state.items = data.items || []
    state.nextId = data.nextId || 1
  }
  state.loaded = true
}

async function saveItems() {
  await dataStore.write(DATA_FILE, {
    items: state.items,
    nextId: state.nextId,
  })
}

export async function addItem(data: { name: string; description: string; startDate: string; endDate: string; priority: string; repeatType?: string; workflowRef?: { projectId: number; nodeId: number }; synced?: boolean }) {
  const item: Item = {
    id: state.nextId++,
    name: data.name,
    description: data.description,
    startDate: data.startDate,
    endDate: data.endDate,
    priority: data.priority as Item["priority"],
    createdAt: formatDateTime(new Date()),
    done: false,
    doneAt: "",
    synced: data.synced ?? false,
    syncedDate: data.synced ?? false ? formatDateTime(new Date()) : "",
    sortOrder: state.items.filter(i => i.priority === (data.priority as Item["priority"])).length,
    repeatType: (data.repeatType as Item["repeatType"]) || "none",
    workflowRef: data.workflowRef,
  }
  state.items.push(item)
  await saveItems()
  return item.id
}

export async function reorderItems(_priority: string, orderedIds: number[]) {
  for (let i = 0; i < orderedIds.length; i++) {
    const item = state.items.find(it => it.id === orderedIds[i])
    if (item) item.sortOrder = i
  }
  await saveItems()
}

export async function completeItem(id: number) {
  const item = state.items.find(i => i.id === id)
  if (!item) return false
  if (item.done) return false
  item.done = true
  item.doneAt = formatDateTime(new Date())
  await saveItems()

  // 关联流程事项 → 同步推进流程
  if (item.workflowRef) {
    await onItemCompleted(item.workflowRef.projectId, item.workflowRef.nodeId)
    return true
  }

  if (item.repeatType && item.repeatType !== "none") {
    const next = nextRepeatDate(item.startDate, item.repeatType)
    if (next) {
      await addItem({
        name: item.name,
        description: item.description,
        startDate: next,
        endDate: next,
        priority: item.priority,
        repeatType: item.repeatType,
      })
    }
  }
  return true
}

/** 供 workflow.ts 调用的专用标记完成函数，跳过回调避免循环 */
export async function markItemAsDone(id: number) {
  const item = state.items.find(i => i.id === id)
  if (item && !item.done) {
    item.done = true
    item.doneAt = formatDateTime(new Date())
    await saveItems()
  }
}

function nextRepeatDate(currentDate: string, repeatType: "daily" | "weekly" | "monthly"): string | null {
  const d = new Date(currentDate)
  if (isNaN(d.getTime())) return null
  if (repeatType === "daily") {
    d.setDate(d.getDate() + 1)
  } else if (repeatType === "weekly") {
    d.setDate(d.getDate() + 7)
  } else if (repeatType === "monthly") {
    const origDay = d.getDate()
    d.setDate(1)
    d.setMonth(d.getMonth() + 1)
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    d.setDate(Math.min(origDay, lastDay))
  }
  return formatDate(d)
}

// 已移至 @/lib/datetime

export async function syncItem(id: number) {
  const item = state.items.find(i => i.id === id)
  if (item) {
    item.synced = true
    item.syncedDate = formatDateTime(new Date())
    await saveItems()
  }
}

export async function resetExpiredSynced() {
  const today = formatDate(new Date())
  let changed = false
  for (const item of state.items) {
    if (item.synced && !item.done && item.syncedDate && !item.syncedDate.startsWith(today)) {
      item.synced = false
      item.syncedDate = ""
      changed = true
    }
  }
  if (changed) await saveItems()
}

export async function updateItem(id: number, data: { name: string; description: string; startDate: string; endDate: string; priority: string; repeatType?: string }) {
  const item = state.items.find(i => i.id === id)
  if (item) {
    item.name = data.name
    item.description = data.description
    item.startDate = data.startDate
    item.endDate = data.endDate
    item.priority = data.priority as Item["priority"]
    if (data.repeatType !== undefined) {
      item.repeatType = data.repeatType as Item["repeatType"]
    }
    await saveItems()

    // 关联事项编辑 → 同步回节点
    if (item.workflowRef) {
      await onItemUpdated(item.workflowRef.projectId, item.workflowRef.nodeId, {
        name: data.name,
        description: data.description,
        startDate: data.startDate,
        endDate: data.endDate,
        priority: data.priority,
      })
    }
  }
}

export async function deleteItem(id: number, force?: boolean): Promise<boolean> {
  const item = state.items.find(i => i.id === id)
  // 关联流程事项不可手动删除
  if (item && item.workflowRef && !item.done && !force) {
    return false
  }
  const nodeId = item?.workflowRef?.nodeId
  const idx = state.items.findIndex(i => i.id === id)
  if (idx !== -1) {
    state.items.splice(idx, 1)
    await saveItems()
    // 通知 workflow 清理节点引用
    if (nodeId && item?.workflowRef) {
      await onItemDeleted(item.workflowRef.projectId, nodeId)
    }
  }
  return true
}

export async function uncompleteItem(id: number) {
  const item = state.items.find(i => i.id === id)
  if (!item) return false
  if (item.workflowRef) {
    return false
  }
  item.done = false
  item.doneAt = ""
  item.synced = false
  item.syncedDate = ""
  await saveItems()
  return true
}

const todoItems = computed(() => state.items.filter(i => !i.done && !i.synced))
const syncedItems = computed(() => state.items.filter(i => !i.done && i.synced))
const doneItems = computed(() => state.items.filter(i => i.done))
const todayCompletedItems = computed(() => {
  const today = formatDate(new Date())
  return state.items.filter(i => i.done && i.doneAt && i.doneAt.startsWith(today))
})

export async function clearDoneItems() {
  const doneIds = state.items.filter(i => i.done).map(i => i.id)
  for (const id of doneIds) {
    const idx = state.items.findIndex(i => i.id === id)
    if (idx !== -1) {
      const item = state.items[idx]
      const nodeId = item.workflowRef?.nodeId
      const projectId = item.workflowRef?.projectId
      state.items.splice(idx, 1)
      if (nodeId && projectId) {
        await onItemDeleted(projectId, nodeId)
      }
    }
  }
  await saveItems()
}

let nextCommentId = 1

export async function addItemComment(itemId: number, content: string) {
  const item = state.items.find(i => i.id === itemId)
  if (!item) return
  if (!item.comments) item.comments = []
  const comment: ItemComment = {
    id: nextCommentId++,
    content,
    author: "我",
    createdAt: formatDateTime(new Date()),
  }
  item.comments.push(comment)
  await saveItems()
}

export function useItems() {
  return {
    items: state.items,
    todoItems,
    syncedItems,
    doneItems,
    todayCompletedItems,
    loadItems,
    addItem,
    syncItem,
    resetExpiredSynced,
    updateItem,
    completeItem,
    reorderItems,
    deleteItem,
    uncompleteItem,
    clearDoneItems,
    addItemComment,
  }
}
