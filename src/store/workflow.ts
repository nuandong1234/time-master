import { reactive, computed } from "vue"
import { showToast } from "./toast"
import { addItem, deleteItem } from "./items"
import { now, nowDate } from "@/lib/datetime"
import { dataStore } from "@/lib/data-store"
import { createDebouncedSave } from "@/lib/debounced-save"

export const DONE_CATEGORY_ID = -1
export const DONE_CATEGORY_NAME = "已完成"

function ensureDoneCategory() {
  if (!state.categories.find(c => c.id === DONE_CATEGORY_ID)) {
    state.categories.push({
      id: DONE_CATEGORY_ID,
      name: DONE_CATEGORY_NAME,
      projectIds: [],
      createdAt: nowDate(),
    })
  }
}

/** 确保至少有一个普通目录（非「已完成」），没有则创建"默认" */
function ensureNormalCategory() {
  const hasNormal = state.categories.some(c => c.id !== DONE_CATEGORY_ID)
  if (!hasNormal) {
    state.categories.push({
      id: state.nextCategoryId++,
      name: "默认",
      projectIds: [],
      createdAt: now(),
    })
  }
}

/** 将已完成项目移动到"已完成"目录 */
function moveDoneProjectsToDoneCategory() {
  const doneCat = state.categories.find(c => c.id === DONE_CATEGORY_ID)
  if (!doneCat) return
  for (const proj of state.projects) {
    if (proj.categoryId !== DONE_CATEGORY_ID && proj.steps.length > 0 && proj.steps.every(s => s.nodes.length > 0 && s.nodes.every(n => n.status === "done"))) {
      // 从原目录移除
      const oldCat = state.categories.find(c => c.id === proj.categoryId)
      if (oldCat) {
        const pi = oldCat.projectIds.indexOf(proj.id)
        if (pi !== -1) oldCat.projectIds.splice(pi, 1)
      }
      // 移到"已完成"目录
      proj.categoryId = DONE_CATEGORY_ID
      doneCat.projectIds.push(proj.id)
    }
  }
}

export interface ActivityLogEntry {
  id: number
  type: "comment" | "system"
  author?: string
  content: string
  timestamp: string
  images?: string[]
}

export interface WorkflowNode {
  id: number
  name: string
  status: "done" | "active" | "wait"
  description?: string
  assignee?: string
  startDate?: string
  endDate?: string
  completedAt?: string
  activityLog?: ActivityLogEntry[]
  itemId?: number
  priority?: "urgent-important" | "important" | "urgent" | "none"
}

export interface WorkflowStep {
  id: number
  nodes: WorkflowNode[]
}

export interface WorkflowProject {
  id: number
  name: string
  categoryId: number
  status: "active" | "done" | "wait"
  steps: WorkflowStep[]
  createdAt: string
  completedAt?: string
  activatedAt?: string
  firstActivatedAt?: string
}

export interface WorkflowCategory {
  id: number
  name: string
  projectIds: number[]
  createdAt: string
}

const state = reactive({
  categories: [] as WorkflowCategory[],
  projects: [] as WorkflowProject[],
  nextCategoryId: 1,
  nextProjectId: 1,
  nextStepId: 1,
  nextNodeId: 1,
  selectedProjectId: 0,
  selectedStepIdx: 0,
  loaded: false,
})

function assignState(data: any) {
  state.categories.splice(0, state.categories.length, ...(data.categories || []))
  state.projects.splice(0, state.projects.length, ...(data.projects || []))
  state.nextCategoryId = data.nextCategoryId || 1
  state.nextProjectId = data.nextProjectId || 1
  state.nextStepId = data.nextStepId || 1
  state.nextNodeId = data.nextNodeId || 1
  state.selectedProjectId = data.selectedProjectId || 0
  state.selectedStepIdx = data.selectedStepIdx || 0
  // 数据迁移：旧分类缺少 createdAt 的用当前时间兜底
  for (const cat of state.categories) {
    if (!cat.createdAt) cat.createdAt = nowDate()
  }
  // 数据迁移：旧项目缺少 activatedAt / completedAt / firstActivatedAt 的用当前时间兜底
  for (const proj of state.projects) {
    const hasActive = proj.steps.some(s => s.nodes.some(n => n.status === "active"))
    if (!proj.activatedAt && hasActive) {
      proj.activatedAt = now()
    }
    if (!proj.firstActivatedAt) {
      const hasStarted = proj.steps.some(s => s.nodes.some(n => n.status !== "wait"))
      if (hasStarted) proj.firstActivatedAt = proj.activatedAt || proj.createdAt
    }
    if (!proj.completedAt) {
      const allDone = proj.steps.length > 0 && proj.steps.every(s => s.nodes.length > 0 && s.nodes.every(n => n.status === "done"))
      if (allDone) proj.completedAt = proj.createdAt
    }
  }
}

const _saveWorkflow = createDebouncedSave('workflow', async () => {
  await dataStore.saveWorkflow({
    categories: state.categories,
    projects: state.projects,
    nextCategoryId: state.nextCategoryId,
    nextProjectId: state.nextProjectId,
    nextStepId: state.nextStepId,
    nextNodeId: state.nextNodeId,
    selectedProjectId: state.selectedProjectId,
    selectedStepIdx: state.selectedStepIdx,
  })
})

export async function saveWorkflow() {
  try {
    await _saveWorkflow()
  } catch (e) {
    console.error('[workflow] 保存工作流失败', e)
    showToast('保存工作流失败: ' + String(e), 'error')
    throw e
  }
}

async function loadWorkflow(preloadedData?: any) {
  const data = preloadedData
  if (data) {
    assignState(data)
    return true
  }
  return false
}

export async function initWorkflow(force = false, preloadedData?: any) {
  if (!state.loaded || force) {
    const loaded = await loadWorkflow(preloadedData)
    if (!loaded) {
      // 无数据，保持空数据，等用户第一次操作时自动创建文件
    }
    // 确保"已完成"目录存在
    ensureDoneCategory()
    // 确保至少有一个普通目录
    ensureNormalCategory()
    // 迁移：将已有的已完成项目移入"已完成"目录
    moveDoneProjectsToDoneCategory()
    state.loaded = true
  }
}

function dedupName(base: string, existingNames: string[]): string {
  if (!existingNames.includes(base)) return base
  const seqNums = existingNames.map(n => n.match(new RegExp(`^${base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d+)$`))).filter(Boolean).map(m => parseInt(m![1]))
  let nextSeq = 2
  while (seqNums.includes(nextSeq)) nextSeq++
  return `${base} ${nextSeq}`
}

export async function addCategory(name?: string) {
  const id = state.nextCategoryId++
  const catName = name || dedupName("新目录", state.categories.map(c => c.name))
  state.categories.push({
    id,
    name: catName,
    projectIds: [],
    createdAt: now(),
  })
  await saveWorkflow()
  showToast('已新建目录', 'success')
}

export async function renameCategory(id: number, name: string): Promise<boolean> {
  if (id === DONE_CATEGORY_ID) return false
  const trimmed = name.trim()
  if (!trimmed) { showToast('名称不能为空'); return false }
  const exists = state.categories.some(c => c.id !== id && c.name === trimmed)
  if (exists) { showToast('名称已存在'); return false }
  const cat = state.categories.find(c => c.id === id)
  if (cat) cat.name = trimmed
  await saveWorkflow()
  return true
}

export async function removeCategory(id: number) {
  if (id === DONE_CATEGORY_ID) {
    showToast("「已完成」目录不可删除")
    return
  }
  const normalCount = state.categories.filter(c => c.id !== DONE_CATEGORY_ID).length
  if (normalCount <= 1) {
    showToast("至少保留一个目录")
    return
  }
  const idx = state.categories.findIndex(c => c.id === id)
  if (idx === -1) return
  const cat = state.categories[idx]
  // 删除目录下所有项目及其关联事项
  for (const pid of [...cat.projectIds]) {
    const pi = state.projects.findIndex(p => p.id === pid)
    if (pi !== -1) {
      const proj = state.projects[pi]
      // 收集并删除所有节点关联的事项
      const itemIds: number[] = []
      for (const step of proj.steps) {
        for (const node of step.nodes) {
          if (node.itemId) itemIds.push(node.itemId)
        }
      }
      for (const itemId of itemIds) {
        await deleteItem(itemId, true)
      }
      state.projects.splice(pi, 1)
    }
  }
  state.categories.splice(idx, 1)
  if (state.selectedProjectId && !state.projects.find(p => p.id === state.selectedProjectId)) {
    state.selectedProjectId = state.projects.length > 0 ? state.projects[0].id : 0
  }
  await saveWorkflow()
  showToast('已删除目录', 'success')
}

function sortProjectsBySidebar(projects: WorkflowProject[]): WorkflowProject[] {
  return [...projects].sort((a, b) => {
    const ag = a.steps.some(s => s.nodes.some(n => n.status === 'active')) ? 0
      : a.steps.length > 0 && a.steps.every(s => s.nodes.length > 0 && s.nodes.every(n => n.status === 'done')) ? 2 : 1
    const bg = b.steps.some(s => s.nodes.some(n => n.status === 'active')) ? 0
      : b.steps.length > 0 && b.steps.every(s => s.nodes.length > 0 && s.nodes.every(n => n.status === 'done')) ? 2 : 1
    if (ag !== bg) return ag - bg
    const ta = ag === 0 ? (a.activatedAt || a.createdAt) : ag === 2 ? (a.completedAt || a.createdAt) : a.createdAt
    const tb = bg === 0 ? (b.activatedAt || b.createdAt) : bg === 2 ? (b.completedAt || b.createdAt) : b.createdAt
    return tb.localeCompare(ta)
  })
}

export async function deleteProject(id: number) {
  const idx = state.projects.findIndex(p => p.id === id)
  if (idx === -1) return
  const proj = state.projects[idx]
  const cat = state.categories.find(c => c.id === proj.categoryId)
  let pi = -1

  // 删除前确定被删项目在侧边栏排序后的下一个项目
  let nextProjectId = 0
  if (proj && cat) {
    const siblings = cat.projectIds
      .map(pid => state.projects.find(p => p.id === pid))
      .filter((p): p is WorkflowProject => p !== undefined)
    const sorted = sortProjectsBySidebar(siblings)
    const pos = sorted.indexOf(proj)
    if (pos >= 0 && pos < sorted.length - 1) {
      nextProjectId = sorted[pos + 1].id
    } else if (pos > 0) {
      nextProjectId = sorted[pos - 1].id
    }
  }

  if (cat) {
    pi = cat.projectIds.indexOf(id)
    if (pi !== -1) cat.projectIds.splice(pi, 1)
  }

  // 删除项目前先收集所有关联事项 ID 并删除
  const itemIds: number[] = []
  for (const step of proj.steps) {
    for (const node of step.nodes) {
      if (node.itemId) itemIds.push(node.itemId)
    }
  }
  for (const itemId of itemIds) {
    await deleteItem(itemId, true)
  }

  state.projects.splice(idx, 1)
  if (state.selectedProjectId === id) {
    state.selectedProjectId = nextProjectId
  }
  await saveWorkflow()
  showToast('已删除项目', 'success')
}

export async function copyProject(id: number) {
  const orig = state.projects.find(p => p.id === id)
  if (!orig) return

  // 深拷贝项目结构（纯数据，无函数）
  const clone = JSON.parse(JSON.stringify(orig)) as WorkflowProject

  // 生成新 ID
  clone.id = state.nextProjectId++
  clone.name = dedupName(orig.name, state.projects.map(p => p.name))

  // 重置项目级状态
  clone.status = "wait"
  clone.completedAt = undefined
  clone.activatedAt = undefined
  clone.firstActivatedAt = undefined
  clone.createdAt = now()

  // 重置步骤和节点
  for (const step of clone.steps) {
    step.id = state.nextStepId++
    for (const node of step.nodes) {
      node.id = state.nextNodeId++
      node.status = "wait"
      node.itemId = undefined
      node.activityLog = []
      node.completedAt = undefined
      node.startDate = undefined
      node.endDate = undefined
    }
  }

  // 加入同一目录末尾
  const cat = state.categories.find(c => c.id === orig.categoryId)
  if (cat) {
    cat.projectIds.push(clone.id)
  }

  state.projects.push(clone)
  state.selectedProjectId = clone.id
  state.selectedStepIdx = 0

  await saveWorkflow()
  showToast('已复制项目', 'success')
}

export async function addProjectToCategory(catId: number) {
  if (catId === DONE_CATEGORY_ID) return
  const cat = state.categories.find(c => c.id === catId)
  if (!cat) return
  const id = state.nextProjectId++
  const existingNames = state.projects.filter(p => cat.projectIds.includes(p.id)).map(p => p.name)
  const projectName = dedupName("新项目", existingNames)
  const project: WorkflowProject = {
    id,
    name: projectName,
    categoryId: catId,
    status: "wait",
    createdAt: now(),
    steps: [
      { id: state.nextStepId++, nodes: [{ id: state.nextNodeId++, name: "新节点", status: "wait" }] },
    ],
  }
  state.projects.push(project)
  cat.projectIds.push(id)
  state.selectedProjectId = id
  state.selectedStepIdx = 0
  const defaultNode = project.steps[0].nodes[0]
  addSystemLogEntry(defaultNode, `添加「${defaultNode.name}」`)
  await saveWorkflow()
}

export function selectProject(id: number) {
  state.selectedProjectId = id
  state.selectedStepIdx = 0
}

export function selectStep(idx: number) {
  state.selectedStepIdx = idx
}

const selectedProject = computed(() => {
  return state.projects.find(p => p.id === state.selectedProjectId)
})

const selectedProjectSteps = computed(() => {
  return selectedProject.value?.steps || []
})

const selectedProjectCategory = computed(() => {
  const p = selectedProject.value
  if (!p) return null
  return state.categories.find(c => c.id === p.categoryId)
})

function getProjectStatusInfo(project: WorkflowProject) {
  const total = project.steps.reduce((s, st) => s + st.nodes.length, 0)
  const done = project.steps.reduce((s, st) => s + st.nodes.filter(n => n.status === "done").length, 0)
  return { total, done }
}

function calcStepCenters(step: WorkflowStep, containerWidth: number) {
  const cardW = 150
  const gap = 20
  const n = step.nodes.length
  if (!n) return []
  const totalW = n * cardW + (n - 1) * gap
  const startOffset = Math.max(10, (containerWidth - totalW) / 2)
  return step.nodes.map((_, i) => startOffset + i * (cardW + gap) + cardW / 2)
}

export async function addNodeToStep(stepIdx: number): Promise<number> {
  const project = selectedProject.value
  if (!project) return -1
  const step = project.steps[stepIdx]
  if (!step) return -1
  if (step.nodes.length >= 5) {
    return -1
  }
  const existingNames = project.steps.flatMap(s => s.nodes.map(n => n.name))
  const nodeName = dedupName("新节点", existingNames)
  step.nodes.push({
    id: state.nextNodeId++,
    name: nodeName,
    status: "wait",
  })
  const newNode = step.nodes[step.nodes.length - 1]
  addSystemLogEntry(newNode, `添加「${nodeName}」`)
  await saveWorkflow()
  showToast('已添加节点', 'success')
  return step.nodes.length - 1
}

export async function addStepAfter(stepIdx: number) {
  const project = selectedProject.value
  if (!project) return
  const existingNames = project.steps.flatMap(s => s.nodes.map(n => n.name))
  const nodeName = dedupName("新节点", existingNames)
  const newStep: WorkflowStep = {
    id: state.nextStepId++,
    nodes: [
      { id: state.nextNodeId++, name: nodeName, status: "wait" },
    ],
  }
  project.steps.splice(stepIdx + 1, 0, newStep)
  const firstNode = newStep.nodes[0]
  addSystemLogEntry(firstNode, `添加「${nodeName}」`)
  await saveWorkflow()
  showToast('已添加节点', 'success')
}

export async function updateNodeName(stepIdx: number, nodeIdx: number, name: string) {
  const project = selectedProject.value
  if (!project) return
  const step = project.steps[stepIdx]
  if (!step) return
  const node = step.nodes[nodeIdx]
  if (!node) return
  node.name = name || "未命名"
  await saveWorkflow()
}

let idCounter = 0

function nextLogId(): number {
  return Date.now() * 1000 + (idCounter++ % 1000)
}

// 已移至 @/lib/datetime

function ensureActivityLog(node: WorkflowNode) {
  if (!node.activityLog) node.activityLog = []
}

export function addSystemLogEntry(node: WorkflowNode, content: string) {
  ensureActivityLog(node)
  node.activityLog!.push({
    id: nextLogId(),
    type: "system",
    content,
    timestamp: now(),
  })
}

// ─── 关联事项辅助函数 ───
async function createItemForNode(node: WorkflowNode, projectId: number) {
  if (node.itemId) return // 已有关联事项
  const itemId = await addItem({
    name: node.name,
    description: node.description || '',
    startDate: node.startDate || nowDate(),
    endDate: node.endDate || nowDate(),
    priority: node.priority || 'important',
    repeatType: 'none',
    workflowRef: { projectId, nodeId: node.id },
    synced: true,
  })
  node.itemId = itemId
  await saveWorkflow()
}

export async function activateNode(stepIdx: number, nodeIdx: number) {
  const project = selectedProject.value
  if (!project) return
  const step = project.steps[stepIdx]
  if (!step) return
  const node = step.nodes[nodeIdx]
  if (!node || node.status !== "wait") return

  node.status = "active"
  addSystemLogEntry(node, `开始「${node.name}」`)

  // 节点激活时自动填充日期
  if (!node.startDate) node.startDate = nowDate()

  // 记录激活时间（秒级精度），每次节点激活都更新为最新操作时间，用于排序
  project.activatedAt = now()
  // 首次激活时间，只记录一次，用于计算进行中天数
  if (!project.firstActivatedAt) project.firstActivatedAt = now()

  await saveWorkflow()

  // 节点 active → 自动创建关联事项
  await createItemForNode(node, project.id)
}

export async function completeNodeAndAdvance(stepIdx: number, nodeIdx: number, projectId?: number) {
  const project = projectId ? state.projects.find(p => p.id === projectId) : selectedProject.value
  if (!project) return
  const step = project.steps[stepIdx]
  if (!step) return
  const node = step.nodes[nodeIdx]
  if (!node) return

  node.status = "done"
  node.completedAt = nowDate()
  if (!node.startDate) node.startDate = nowDate()
  if (!node.endDate) node.endDate = nowDate()
  addSystemLogEntry(node, `完成「${node.name}」`)

  const nextNode = step.nodes[nodeIdx + 1]
  if (nextNode) {
    nextNode.status = "active"
    addSystemLogEntry(nextNode, `开始「${nextNode.name}」`)
    await saveWorkflow()
    // 下一节点 active → 创建关联事项
    await createItemForNode(nextNode, project.id)
    return
  }

  const nextStep = project.steps[stepIdx + 1]
  if (nextStep && nextStep.nodes.length > 0) {
    nextStep.nodes[0].status = "active"
    addSystemLogEntry(nextStep.nodes[0], `开始「${nextStep.nodes[0].name}」`)
    await saveWorkflow()
    // 下一节点 active → 创建关联事项
    await createItemForNode(nextStep.nodes[0], project.id)
    return
  }

  // 同步更新 project.status
  const allDone = project.steps.every(s => s.nodes.length > 0 && s.nodes.every(n => n.status === "done"))
  if (allDone) {
    project.status = "done"
    project.completedAt = now()
    // 自动移入「已完成」目录
    const oldCat = state.categories.find(c => c.id === project.categoryId)
    const doneCat = state.categories.find(c => c.id === DONE_CATEGORY_ID)
    if (oldCat && doneCat && project.categoryId !== DONE_CATEGORY_ID) {
      const pi = oldCat.projectIds.indexOf(project.id)
      if (pi !== -1) oldCat.projectIds.splice(pi, 1)
      doneCat.projectIds.push(project.id)
      project.categoryId = DONE_CATEGORY_ID
    }
  }

  await saveWorkflow()
}

export async function updateNodeDetail(
  stepIdx: number,
  nodeIdx: number,
  data: { name?: string; description?: string; assignee?: string; startDate?: string; endDate?: string; priority?: string }
) {
  const project = selectedProject.value
  if (!project) return
  const step = project.steps[stepIdx]
  if (!step) return
  const node = step.nodes[nodeIdx]
  if (!node) return

  // 记录节点重命名
  const prevName = node.name
  if (data.name !== undefined) node.name = data.name
  if (data.description !== undefined) node.description = data.description
  if (data.assignee !== undefined) node.assignee = data.assignee
  if (data.startDate !== undefined) node.startDate = data.startDate
  if (data.endDate !== undefined) node.endDate = data.endDate
  if (data.priority !== undefined) node.priority = data.priority as WorkflowNode["priority"]

  if (data.name !== undefined && data.name !== prevName) {
    addSystemLogEntry(node, `${prevName} 重命名为「${data.name}」`)
  }

  await saveWorkflow()
}

export async function addNodeComment(stepIdx: number, nodeIdx: number, author: string, content: string, images?: string[]) {
  const project = selectedProject.value
  if (!project) return
  const step = project.steps[stepIdx]
  if (!step) return
  const node = step.nodes[nodeIdx]
  if (!node) return

  ensureActivityLog(node)
  const entry: ActivityLogEntry = {
    id: nextLogId(),
    type: "comment",
    author,
    content,
    timestamp: now(),
  }
  if (images && images.length > 0) {
    entry.images = images
  }
  node.activityLog!.push(entry)
  await saveWorkflow()
}

export async function renameProject(id: number, name: string): Promise<boolean> {
  const trimmed = name.trim()
  if (!trimmed) { showToast('名称不能为空'); return false }
  const p = state.projects.find(p => p.id === id)
  if (!p) return false
  const exists = state.projects.filter(proj => proj.categoryId === p.categoryId && proj.id !== id).some(proj => proj.name === trimmed)
  if (exists) { showToast('名称已存在'); return false }
  p.name = trimmed
  await saveWorkflow()
  showToast('已重命名', 'success')
  return true
}

export async function moveProjectToCategory(projectId: number, targetCategoryId: number) {
  const project = state.projects.find(p => p.id === projectId)
  if (!project) return
  const oldCat = state.categories.find(c => c.id === project.categoryId)
  const newCat = state.categories.find(c => c.id === targetCategoryId)
  if (!oldCat || !newCat) return
  if (oldCat.id === newCat.id) return

  // 从原目录移除
  const pi = oldCat.projectIds.indexOf(projectId)
  if (pi !== -1) oldCat.projectIds.splice(pi, 1)

  // 更新项目的 categoryId
  project.categoryId = targetCategoryId

  // 添加到目标目录
  newCat.projectIds.push(projectId)

  // 如果目标目录是「已完成」，自动标记完成状态
  if (targetCategoryId === DONE_CATEGORY_ID) {
    project.status = "done"
    project.completedAt = project.completedAt || now()
  }

  // 如果从「已完成」移出到普通目录，重置完成状态
  if (oldCat.id === DONE_CATEGORY_ID && targetCategoryId !== DONE_CATEGORY_ID) {
    project.status = project.steps.some(s => s.nodes.some(n => n.status === 'active')) ? "active" : "wait"
    project.completedAt = undefined
  }

  await saveWorkflow()
  showToast('已移动', 'success')
}

export async function removeNodeFromStep(stepIdx: number, nodeIdx: number) {
  const project = selectedProject.value
  if (!project) return
  const step = project.steps[stepIdx]
  if (!step) return
  if (step.nodes.length <= 1) {
    if (project.steps.length <= 1) return
    project.steps.splice(stepIdx, 1)
    if (state.selectedStepIdx >= project.steps.length) {
      state.selectedStepIdx = project.steps.length - 1
    }
    await saveWorkflow()
    return
  }
  step.nodes.splice(nodeIdx, 1)
  await saveWorkflow()
}

export async function moveNode(stepIdx: number, fromIdx: number, toIdx: number) {
  const project = selectedProject.value
  if (!project) return
  if (fromIdx === toIdx) return
  const step = project.steps[stepIdx]
  if (!step) return
  const [node] = step.nodes.splice(fromIdx, 1)
  step.nodes.splice(toIdx, 0, node)
  await saveWorkflow()
}

export async function moveNodeAcrossSteps(fromStepIdx: number, fromNodeIdx: number, toStepIdx: number, toNodeIdx: number) {
  const project = selectedProject.value
  if (!project) return
  const fromStep = project.steps[fromStepIdx]
  const toStep = project.steps[toStepIdx]
  if (!fromStep || !toStep) return
  // 目标步骤已满5个节点则不允许移入
  if (fromStepIdx !== toStepIdx && toStep.nodes.length >= 5) return
  const [node] = fromStep.nodes.splice(fromNodeIdx, 1)
  toStep.nodes.splice(toNodeIdx, 0, node)
  // 如果源步骤变空了，自动删除
  if (fromStep.nodes.length === 0) {
    project.steps.splice(fromStepIdx, 1)
    // 修正 selectedStepIdx
    if (state.selectedStepIdx >= project.steps.length) {
      state.selectedStepIdx = Math.max(0, project.steps.length - 1)
    }
  }
  await saveWorkflow()
}

export function getDurationDays(startDate: string) {
  const start = new Date(startDate)
  const now = new Date()
  const diff = Math.floor((now.getTime() - start.getTime()) / (1000 * 60 * 60 * 24))
  return Math.max(1, diff)
}

/** 根据 projectId 获取项目信息 */
export function getProjectById(id: number): WorkflowProject | undefined {
  return state.projects.find(p => p.id === id)
}

export function useWorkflow() {
  return {
    categories: computed(() => state.categories as WorkflowCategory[]),
    projects: computed(() => state.projects as WorkflowProject[]),
    selectedProjectId: computed(() => state.selectedProjectId),
    selectedStepIdx: computed(() => state.selectedStepIdx),
    selectedProject,
    selectedProjectSteps,
    selectedProjectCategory,
    getProjectStatusInfo,
    calcStepCenters,
    initWorkflow,
    addCategory,
    renameCategory,
    removeCategory,
    addProjectToCategory,
    moveProjectToCategory,
    deleteProject,
    copyProject,
    selectProject,
    selectStep,
    addNodeToStep,
    addStepAfter,
    updateNodeName,
    completeNodeAndAdvance,
    activateNode,
    updateNodeDetail,
    addNodeComment,
    renameProject,
    removeNodeFromStep,
    moveNode,
    moveNodeAcrossSteps,
    getDurationDays,
  }
}