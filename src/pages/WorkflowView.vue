﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿﻿<script setup lang="ts">
import { onMounted, onActivated, onUnmounted, ref, computed, watch, nextTick } from "vue"
import { useWorkflow, DONE_CATEGORY_ID, type WorkflowNode, type WorkflowProject, type WorkflowStep } from "@/store/workflow"
import { initWorkflow, activateNode } from "@/store/workflow"
import { showToast } from "@/store/toast"
import NodeDetailPanel from "@/components/NodeDetailPanel.vue"
import FlowConnectionsSvg from "@/components/flow/FlowConnectionsSvg.vue"
import { useWorkflowConnections } from "@/composables/useWorkflowConnections"
import { useWorkflowDrag } from "@/composables/useWorkflowDrag"
import { useWorkflowSearch } from "@/composables/useWorkflowSearch"
import { usePomodoroStore } from "@/store/pomodoro"


const {
  categories, projects, selectedProjectId,
  selectedStepIdx, selectedProject,
  selectedProjectSteps, 
  getDurationDays,
  selectProject, selectStep,
  addNodeToStep, addStepAfter, completeNodeAndAdvance, renameProject, removeNodeFromStep, addCategory, addProjectToCategory, renameCategory, removeCategory, deleteProject,
} = useWorkflow()

const { lockedItemId } = usePomodoroStore()

const flowGridRef = ref<HTMLElement | null>(null)
const flowColumnRef = ref<HTMLDivElement | null>(null)
const flowWrapperRef = ref<HTMLDivElement | null>(null)
const scrollContainerRef = ref<HTMLDivElement | null>(null)
let resizeObserver: ResizeObserver | null = null
let editingKey = ref("")

const collapsedCats = ref<Set<number>>(new Set())
const sortedCategories = computed(() => {
  return [...categories.value].sort((a, b) => {
    // 「已完成」目录始终在最后
    if (a.id === DONE_CATEGORY_ID) return 1
    if (b.id === DONE_CATEGORY_ID) return -1
    const c = a.createdAt.localeCompare(b.createdAt)
    if (c !== 0) return c
    return a.id - b.id
  })
})
const contextMenu = ref<{ x: number; y: number; catId?: number; catName?: string; projectId?: number; projectName?: string } | null>(null)
const renamingCatId = ref(0)
const renamingBusy = ref(false)
const renamingProjectId = ref(0)
const renamingProjectBusy = ref(false)
// 统一选中状态：null=未选中，{stepIdx,nodeIdx}=选中某个节点，{stepIdx:-1,nodeIdx:-1}=选中"结束"
const selectedNode = ref<{ stepIdx: number; nodeIdx: number } | null>(null)
const startReady = ref(false)

// 用于新建项目后自动弹出重命名
const pendingRenameProjectId = ref(0)
// 用于新建目录后自动弹出重命名
const pendingRenameCatId = ref(0)

const justActivated = ref<{ stepIdx: number; nodeIdx: number } | null>(null)

// ====== 组合式函数 ======
const {
  connectionPaths,
  svgDims,
  updateConnections,
  drawAfterLayout,
} = useWorkflowConnections(flowWrapperRef)

const {
  dragTarget,
  dragOver,
  isDragging,
  dragStartX,
  dragStartY,
  dragMouseX,
  dragMouseY,
  draggedNodeName,
  handleDocumentMouseMove,
  executeDragMove,
  resetDragState,
} = useWorkflowDrag(selectedProjectSteps, selectStep)

const {
  searchQuery,
  fuzzyMatch,
} = useWorkflowSearch()

// SVG 连线逻辑已提取到 useWorkflowConnections 组合式函数




// 锁定标记：始终指向当前进行中的节点（status === 'active'）
const activeNodePosition = computed(() => {
  const steps = selectedProjectSteps.value
  if (!steps.length) return null
  for (let si = 0; si < steps.length; si++) {
    const nodes = steps[si].nodes
    for (let ni = 0; ni < nodes.length; ni++) {
      if (nodes[ni].status === 'active') return { stepIdx: si, nodeIdx: ni }
    }
  }
  const allDone = steps.every(s => s.nodes.length > 0 && s.nodes.every(n => n.status === 'done'))
  if (allDone) return { stepIdx: -1, nodeIdx: -1 }
  return null
})

// 右侧详情面板节点数据：从统一选中状态派生
const detailPanelNode = computed(() => {
  if (!selectedNode.value) return null
  if (selectedNode.value.stepIdx < 0) return null
  const step = selectedProjectSteps.value[selectedNode.value.stepIdx]
  if (!step) return null
  return step.nodes[selectedNode.value.nodeIdx] || null
})

function closeContextMenu() {
  contextMenu.value = null
}

// Bug 6: pageX/pageY → clientX/clientY
function handleCtxMenu(e: MouseEvent, catId: number, catName: string) {
  if (catId === DONE_CATEGORY_ID) return
  e.preventDefault()
  e.stopPropagation()
  contextMenu.value = { x: e.clientX, y: e.clientY, catId, catName }
}

function handleProjectCtxMenu(e: MouseEvent, pid: number, pname: string) {
  e.preventDefault()
  e.stopPropagation()
  handleSelectProject(pid)
  contextMenu.value = { x: e.clientX, y: e.clientY, projectId: pid, projectName: pname }
}

function startRename(catId: number) {
  if (catId === DONE_CATEGORY_ID) return
  renamingCatId.value = catId
  contextMenu.value = null
  pendingRenameCatId.value = catId
}

function startRenameProject(pid: number) {
  renamingProjectId.value = pid
  contextMenu.value = null
  setTimeout(() => {
    const el = document.querySelector(`[data-rename="proj-${pid}"]`) as HTMLInputElement
    el?.focus()
    el?.select()
  }, 50)
}

function doDeleteProject(pid: number) {
  deleteProject(pid)
  closeContextMenu()
}

function doNewProject(catId: number) {
  addProjectToCategory(catId)
  if (collapsedCats.value.has(catId)) {
    collapsedCats.value.delete(catId)
    collapsedCats.value = new Set(collapsedCats.value)
  }
  closeContextMenu()
  selectedNode.value = null
  startReady.value = true
  selectStep(0)

  // 焦点放到流程网格上，让 Tab 能立即添加节点
  nextTick(() => {
    flowGridRef.value?.focus()
  })
}

function handleAddCategory() {
  addCategory()
  nextTick(() => {
    const last = categories.value[categories.value.length - 1]
    if (last) {
      collapsedCats.value = new Set(categories.value.map((c: { id: number }) => c.id).filter((cid: number) => cid !== last.id))
      startRename(last.id)
    }
  })
}

// 监听 pendingRenameProjectId，等 DOM 更新完成后弹出重命名
watch(pendingRenameProjectId, (pid) => {
  if (!pid) return
  nextTick(() => {
    const el = document.querySelector(`[data-rename="proj-${pid}"]`) as HTMLInputElement
    if (el) {
      el.focus()
      el.select()
    }
    pendingRenameProjectId.value = 0
  })
})

// 监听 pendingRenameCatId，等 DOM 更新完成后弹出重命名
watch(pendingRenameCatId, (cid) => {
  if (!cid) return
  nextTick(() => {
    const el = document.querySelector(`[data-rename="cat-${cid}"]`) as HTMLInputElement
    if (el) {
      el.focus()
      el.select()
    }
    pendingRenameCatId.value = 0
  })
})

async function doRename(catId: number, el: HTMLInputElement) {
  if (renamingBusy.value) return
  renamingBusy.value = true
  const ok = await renameCategory(catId, el.value)
  if (ok) {
    renamingCatId.value = 0
    await nextTick()
  }
  renamingBusy.value = false
}

async function doRenameProject(pid: number, el: HTMLInputElement) {
  if (renamingProjectBusy.value) return
  renamingProjectBusy.value = true
  const ok = await renameProject(pid, el.value)
  if (ok) {
    renamingProjectId.value = 0
    await nextTick()
  }
  renamingProjectBusy.value = false
}

function toggleCat(id: number) {
  // 只切换当前目录，不影响其他目录
  if (!collapsedCats.value.has(id)) {
    collapsedCats.value = new Set([...collapsedCats.value, id])
  } else {
    const newSet = new Set(collapsedCats.value)
    newSet.delete(id)
    collapsedCats.value = newSet
  }
}

function isCatCollapsed(id: number) {
  return collapsedCats.value.has(id)
}

async function doLayoutAndScroll() {
  const steps = selectedProjectSteps.value
  if (steps.length) {
    const hasActive = steps.some(s => s.nodes.some(n => n.status === "active"))
    const allDone = steps.every(s => s.nodes.length > 0 && s.nodes.every(n => n.status === "done"))
    if (!hasActive && !allDone) {
      startReady.value = true
      selectedNode.value = null
      selectStep(0)
    }
  }

  for (let i = 0; i < 3; i++) {
    drawAfterLayout()
    await new Promise(r => setTimeout(r, 100))
  }
  scrollToCurrentStep()
}

// ====== 拖拽事件管理 ======
let _savedMouseUpHandler: ((e: MouseEvent) => void) | null = null

function handleNodeMouseDown(stepIdx: number, nodeIdx: number, e: MouseEvent) {
  if (e.button !== 0) return
  const node = selectedProjectSteps.value[stepIdx]?.nodes[nodeIdx]
  if (!node) return

  // done 节点不可拖拽，仅切换选中
  if (node.status === 'done') {
    if (selectedNode.value?.stepIdx === stepIdx && selectedNode.value?.nodeIdx === nodeIdx) {
      selectedNode.value = null
    } else {
      selectedNode.value = { stepIdx, nodeIdx }
      selectStep(stepIdx)
      nextTick(() => scrollToSelectedNode())
      flowGridRef.value?.focus()
    }
    return
  }

  // active 节点可选中但不可拖拽
  if (node.status === 'active') {
    if (selectedNode.value?.stepIdx === stepIdx && selectedNode.value?.nodeIdx === nodeIdx) {
      selectedNode.value = null
    } else {
      selectedNode.value = { stepIdx, nodeIdx }
      selectStep(stepIdx)
      nextTick(() => scrollToSelectedNode())
      flowGridRef.value?.focus()
    }
    return
  }

  // 启动拖拽准备
  dragStartX.value = e.clientX
  dragStartY.value = e.clientY
  dragMouseX.value = e.clientX
  dragMouseY.value = e.clientY
  dragTarget.value = { stepIdx, nodeIdx }

  _savedMouseUpHandler = () => {
    document.removeEventListener('mousemove', handleDocumentMouseMove)
    document.removeEventListener('mousemove', handleDocumentMouseMove)
    document.removeEventListener('mouseup', _savedMouseUpHandler!)
    _savedMouseUpHandler = null
    document.body.style.cursor = ''

    // 未拖拽 → 点击选择
    if (!isDragging.value) {
      if (dragTarget.value) {
        const { stepIdx: si, nodeIdx: ni } = dragTarget.value
        if (selectedNode.value?.stepIdx === si && selectedNode.value?.nodeIdx === ni) {
          selectedNode.value = null
        } else {
          selectedNode.value = { stepIdx: si, nodeIdx: ni }
          selectStep(si)
          nextTick(() => scrollToSelectedNode())
          flowGridRef.value?.focus()
        }
      }
      resetDragState()
      return
    }

    // 执行拖拽移动
    executeDragMove(({ stepIdx: si, nodeIdx: ni }) => {
      selectedNode.value = { stepIdx: si, nodeIdx: ni }
      nextTick(() => scrollToSelectedNode())
    })
  }

  document.addEventListener('mousemove', handleDocumentMouseMove)
  document.addEventListener('mouseup', _savedMouseUpHandler)
}

onMounted(async () => {
  await initWorkflow()
  // 首次加载：展开上次选中的项目所在的目录
  if (categories.value.length > 0 && collapsedCats.value.size === 0) {
    if (selectedProjectId.value && selectedProject.value) {
      const catId = selectedProject.value.categoryId
      collapsedCats.value = new Set(categories.value.map(c => c.id).filter(cid => cid !== catId))
    } else {
      collapsedCats.value = new Set(categories.value.map(c => c.id))
    }
  }
  flowGridRef.value?.focus()
  document.addEventListener("click", closeContextMenu)
  document.addEventListener("keydown", handleTabBlock)

  resizeObserver = new ResizeObserver(() => {
    updateConnections()
  })
  const observe = (el: Element | null) => el && resizeObserver?.observe(el)
  observe(flowColumnRef.value)
  observe(flowWrapperRef.value)
  observe(scrollContainerRef.value)
  observe(flowGridRef.value)

  await doLayoutAndScroll()
})

onActivated(() => {
  nextTick(() => {
    drawAfterLayout()
    scrollToCurrentStep()
    flowGridRef.value?.focus()
  })
})

// 搜索前保存 collapsedCats 快照，清空时恢复
let searchSnapshot: Set<number> | null = null

watch(searchQuery, (q) => {
  if (q) {
    // 首次搜索：保存快照
    if (searchSnapshot === null) {
      searchSnapshot = new Set(collapsedCats.value)
    }
    // 展开匹配目录，收起不匹配目录
    const matchingIds = new Set<number>()
    for (const cat of categories.value) {
      const projs = cat.projectIds.map(id => getProjectById(id)).filter(Boolean) as NonNullable<ReturnType<typeof getProjectById>>[]
      const hasMatch = projs.some(p => fuzzyMatch(p.name.toLowerCase(), q.toLowerCase()))
      if (hasMatch) {
        matchingIds.add(cat.id)
      }
    }
    collapsedCats.value = new Set(categories.value.map(c => c.id).filter(cid => !matchingIds.has(cid)))
  } else {
    // 恢复快照
    if (searchSnapshot !== null) {
      collapsedCats.value = searchSnapshot
      searchSnapshot = null
    }
  }
})

watch(selectedProjectSteps, () => {
  updateConnections()
}, { deep: true })

watch(selectedProjectId, () => {
  updateConnections()
})

// 选中项目如果属于「已完成」目录，自动展开该目录
watch(() => selectedProject.value?.categoryId, (catId) => {
  if (catId === DONE_CATEGORY_ID && collapsedCats.value.has(DONE_CATEGORY_ID)) {
    const newSet = new Set(collapsedCats.value)
    newSet.delete(DONE_CATEGORY_ID)
    collapsedCats.value = newSet
  }
})

onUnmounted(() => {
  document.removeEventListener("click", closeContextMenu)
  document.removeEventListener("keydown", handleTabBlock)
  if (_savedMouseUpHandler) {
    document.removeEventListener("mouseup", _savedMouseUpHandler)
  }
  document.removeEventListener("mousemove", handleDocumentMouseMove)
  resizeObserver?.disconnect()
})

const duration = computed(() => {
  const p = selectedProject.value
  return p ? getDurationDays(p.createdAt) : 0
})

const runTimeDisplay = computed(() => {
  const steps = selectedProjectSteps.value
  if (!steps.length) return ""
  const allWait = steps.every(s => s.nodes.every(n => n.status === "wait"))
  const allDone = steps.every(s => s.nodes.length > 0 && s.nodes.every(n => n.status === "done"))
  if (allWait) return "未开始"
  if (allDone) return `总共 ${duration.value}天`
  return `进行中 ${duration.value}天`
})

const projectStatusByNodes = computed(() => {
  const steps = selectedProjectSteps.value
  if (!steps.length) return "wait"
  const allDone = steps.every(s => s.nodes.length > 0 && s.nodes.every(n => n.status === "done"))
  if (allDone) return "done"
  const allWait = steps.every(s => s.nodes.every(n => n.status === "wait"))
  if (allWait) return "wait"
  return "active"
})

function projectStatusColor(status: string) {
  if (status === "done") return "text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700"
  if (status === "active") return "text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-700"
  return "text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
}

function dotColorByProject(p: WorkflowProject) {
  const allDone = p.steps.length > 0 && p.steps.every((s: WorkflowStep) => s.nodes.length > 0 && s.nodes.every((n: WorkflowNode) => n.status === "done"))
  if (allDone) return "bg-green-500"
  const hasActive = p.steps.some((s: WorkflowStep) => s.nodes.some((n: WorkflowNode) => n.status === "active"))
  if (hasActive) return "bg-amber-500"
  return "bg-gray-300 dark:bg-gray-600"
}

function getProjectById(id: number) {
  return projects.value.find(p => p.id === id)
}

function getActiveNodeOverdueDays(project: WorkflowProject) {
  if (!project.steps.length) return null
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  for (const step of project.steps) {
    for (const node of step.nodes) {
      if (node.status === 'active' && node.endDate) {
        const end = new Date(node.endDate)
        end.setHours(0, 0, 0, 0)
        const diff = Math.floor((today.getTime() - end.getTime()) / 86400000)
        if (diff > 0) return diff
        return null
      }
    }
  }
  return null
}

function isNodeOverdue(node: WorkflowNode) {
  if (node.status !== 'active' || !node.endDate) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = new Date(node.endDate)
  end.setHours(0, 0, 0, 0)
  return end < today
}

function getProjectsByCategory(catId: number) {
  const cat = categories.value.find(c => c.id === catId)
  if (!cat) return []
  let projs = cat.projectIds.map(id => getProjectById(id)).filter(Boolean) as NonNullable<ReturnType<typeof getProjectById>>[]
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    projs = projs.filter(p => fuzzyMatch(p.name.toLowerCase(), q))
  }
  // 「已完成」目录：按 completedAt 降序（最新完成在上）
  if (catId === DONE_CATEGORY_ID) {
    projs.sort((a, b) => {
      const ta = a.completedAt || a.createdAt
      const tb = b.completedAt || b.createdAt
      return tb.localeCompare(ta)
    })
    return projs
  }
  // 普通目录：active > wait > done，同状态内按各自关键时间升序（最旧在上）
  projs.sort((a, b) => {
    const aActive = a.steps.some(s => s.nodes.some(n => n.status === "active"))
    const bActive = b.steps.some(s => s.nodes.some(n => n.status === "active"))
    const aDone = a.steps.length > 0 && a.steps.every(s => s.nodes.length > 0 && s.nodes.every(n => n.status === "done"))
    const bDone = b.steps.length > 0 && b.steps.every(s => s.nodes.length > 0 && s.nodes.every(n => n.status === "done"))
    const aGroup = aActive ? 0 : aDone ? 2 : 1
    const bGroup = bActive ? 0 : bDone ? 2 : 1
    if (aGroup !== bGroup) return aGroup - bGroup
    if (aGroup === 0) {
      const ta = a.activatedAt || a.createdAt
      const tb = b.activatedAt || b.createdAt
      return ta.localeCompare(tb)
    }
    if (aGroup === 2) {
      const ta = a.completedAt || a.createdAt
      const tb = b.completedAt || b.createdAt
      return ta.localeCompare(tb)
    }
    return a.createdAt.localeCompare(b.createdAt)
  })
  return projs
}



type FlowItem =
  | { type: "start" }
  | { type: "step"; stepIndex: number }
  | { type: "connector"; aboveCount: number; belowCount: number }
  | { type: "end" }

const flowItems = computed<FlowItem[]>(() => {
  const steps = selectedProjectSteps.value
  const items: FlowItem[] = []

  items.push({ type: "start" })
  if (steps.length > 0) {
    items.push({ type: "connector", aboveCount: 1, belowCount: steps[0].nodes.length })
  }

  for (let i = 0; i < steps.length; i++) {
    items.push({ type: "step", stepIndex: i })
    if (i < steps.length - 1) {
      items.push({ type: "connector", aboveCount: steps[i].nodes.length, belowCount: steps[i + 1].nodes.length })
    }
  }

  if (steps.length > 0) {
    const lastIdx = steps.length - 1
    items.push({ type: "connector", aboveCount: steps[lastIdx].nodes.length, belowCount: 1 })
  }
  items.push({ type: "end" })

  return items
})

watch(flowItems, () => {
  drawAfterLayout()
}, { deep: true })

async function handleKeydown(e: KeyboardEvent) {
  // Alt+A：添加节点
  if (e.code === "KeyA" && e.altKey) {
    e.preventDefault()
    const currentStepIdx = selectedStepIdx.value
    addNodeToStep(currentStepIdx).then(newIdx => {
      if (newIdx >= 0) { selectedNode.value = { stepIdx: currentStepIdx, nodeIdx: newIdx } }
      else showToast('每个步骤最多5个节点')
      drawAfterLayout()
      scrollToSelectedNode()
    })
    nextTick(() => flowGridRef.value?.focus())
  } else if (e.key === "Enter") {
    e.preventDefault()
    const currentStepIdx = selectedStepIdx.value
    const steps = selectedProjectSteps.value
    if (steps.length) {
      addStepAfter(currentStepIdx)
    }
    nextTick(() => {
      selectStep(currentStepIdx + 1)
      selectedNode.value = { stepIdx: currentStepIdx + 1, nodeIdx: 0 }
      flowGridRef.value?.focus()
      scrollToSelectedNode()
      drawAfterLayout()
    })
  } else if (e.key === "Delete") {
    const steps = selectedProjectSteps.value
    if (!steps.length || !selectedNode.value) return
    const { stepIdx, nodeIdx } = selectedNode.value
    if (stepIdx < 0) return
    const step = steps[stepIdx]
    if (!step) return
    const node = step.nodes[nodeIdx]
    if (!node || node.status === 'done' || node.status === 'active') return
    // 至少保留一个节点
    if (step.nodes.length <= 1 && steps.length <= 1) {
      showToast('至少保留一个节点')
      return
    }
    const willRemoveStep = step.nodes.length === 1
    await removeNodeFromStep(stepIdx, nodeIdx)
    showToast('节点已删除', 'success')
    const remainingSteps = selectedProjectSteps.value
    if (remainingSteps.length) {
      if (willRemoveStep) {
        // 步骤被删除，选中上一个步骤的最后一个节点
        const prevStepIdx = Math.min(Math.max(0, stepIdx - 1), remainingSteps.length - 1)
        const prevStep = remainingSteps[prevStepIdx]
        selectStep(prevStepIdx)
        selectedNode.value = prevStep?.nodes.length
          ? { stepIdx: prevStepIdx, nodeIdx: prevStep.nodes.length - 1 }
          : null
      } else {
        // 同步骤内删除，选中上一个节点
        const targetStep = remainingSteps[stepIdx]
        selectStep(stepIdx)
        selectedNode.value = targetStep?.nodes.length
          ? { stepIdx, nodeIdx: Math.max(0, nodeIdx - 1) }
          : null
      }
    } else {
      selectedNode.value = null
    }

    nextTick(() => {
      drawAfterLayout()
      scrollToSelectedNode()
    })
  }
}

async function handleStartClick() {
  if (!startReady.value) {
    const steps = selectedProjectSteps.value
    if (!steps.length || steps.every(s => s.nodes.every(n => n.status === "done"))) {
      showToast("流程已全部完成，无需启动")
    } else if (steps.some(s => s.nodes.some(n => n.status === "active"))) {
      showToast("流程已在进行中")
    } else {
      showToast("流程暂不可启动")
    }
    return
  }
  startReady.value = false
  const steps = selectedProjectSteps.value
  for (let si = 0; si < steps.length; si++) {
    for (let ni = 0; ni < steps[si].nodes.length; ni++) {
      if (steps[si].nodes[ni].status === "wait") {
        await activateNode(si, ni)
        selectStep(si)
        selectedNode.value = { stepIdx: si, nodeIdx: ni }

        // 脉冲动画 + 滚动到激活节点
        justActivated.value = { stepIdx: si, nodeIdx: ni }
        setTimeout(() => { justActivated.value = null }, 1200)

        nextTick(() => {
          scrollToSelectedNode()
          flowGridRef.value?.focus()
          showToast(`开始流程：${selectedProject.value?.name || ''}`, 'info')
        })
        return
      }
    }
  }
}

async function handleCompleteNode(stepIdx: number, nodeIdx: number) {
  await completeNodeAndAdvance(stepIdx, nodeIdx)
  showToast('任务完成', 'success')
  drawAfterLayout()

  const steps = selectedProjectSteps.value
  const step = steps[stepIdx]
  if (step) {
    const nextNode = step.nodes[nodeIdx + 1]
    if (nextNode) {
      selectedNode.value = { stepIdx, nodeIdx: nodeIdx + 1 }
      scrollToSelectedNode()
      return
    }
  }
  const nextStep = steps[stepIdx + 1]
  if (nextStep && nextStep.nodes.length > 0) {
    selectStep(stepIdx + 1)
    selectedNode.value = { stepIdx: stepIdx + 1, nodeIdx: 0 }
  } else {
    selectedNode.value = { stepIdx, nodeIdx }
  }
  scrollToSelectedNode()
}

function handleSelectProject(id: number) {
  if (id === selectedProjectId.value) return
  editingKey.value = ""
  selectedNode.value = null
  startReady.value = false
  searchQuery.value = ""
  selectProject(id)
  const steps = selectedProjectSteps.value
  if (steps.length) {
    const hasActive = steps.some(s => s.nodes.some(n => n.status === "active"))
    const allDone = steps.every(s => s.nodes.length > 0 && s.nodes.every(n => n.status === "done"))

    if (!hasActive && !allDone) {
      startReady.value = true
      selectedNode.value = null
      selectStep(0)
      nextTick(() => flowGridRef.value?.focus())
      scrollToCurrentStep()
      return
    }

    const stepIdx = steps.findIndex(s => s.nodes.some(n => n.status === "active"))
    const idx = stepIdx >= 0 ? stepIdx : 0
    selectStep(idx)
    selectedNode.value = null
  }
  scrollToCurrentStep()
}

function handleScrollContainerClick() {
  selectedNode.value = null
  nextTick(() => flowGridRef.value?.focus())
}

function scrollToCurrentStep() {
  nextTick(() => {
    const el = flowGridRef.value?.querySelector('[data-current-step]')
    el?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
  })
}

function scrollToSelectedNode() {
  nextTick(() => {
    if (!selectedNode.value || selectedNode.value.stepIdx < 0) return
    const stepEl = flowGridRef.value?.querySelector(`[data-flow-step="${selectedNode.value.stepIdx}"]`)
    if (!stepEl) return
    const nodeEl = stepEl.querySelector(`[data-node-idx="${selectedNode.value.nodeIdx}"]`) as HTMLElement | null
    if (!nodeEl) return
    // 确保节点在可视区域内（水平+垂直）
    const container = scrollContainerRef.value
    if (container) {
      const cr = container.getBoundingClientRect()
      const nr = nodeEl.getBoundingClientRect()
      const isOffscreenRight = nr.right > cr.right
      const isOffscreenLeft = nr.left < cr.left
      if (isOffscreenRight || isOffscreenLeft) {
        nodeEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
      } else {
        nodeEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    } else {
      nodeEl.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
    }
  })
}

// 拖拽逻辑已提取到 useWorkflowDrag 组合式函数

// 底部操作栏：从统一选中状态派生
const bottomNodeInfo = computed(() => {
  if (!selectedNode.value || selectedNode.value.stepIdx < 0) return null
  const steps = selectedProjectSteps.value
  if (!steps.length) return null
  const { stepIdx, nodeIdx } = selectedNode.value
  const step = steps[stepIdx]
  if (!step) return null
  const node = step.nodes[nodeIdx]
  if (!node) return null
  return { name: node.name, status: node.status, stepIdx, nodeIdx }
})

/** Tab 在页面内不可切换焦点 */
function handleTabBlock(e: KeyboardEvent) {
  if (e.key === "Tab") {
    e.preventDefault()
  }
}

async function handleCompleteCurrentNode() {
  if (!selectedNode.value || selectedNode.value.stepIdx < 0) return
  const { stepIdx, nodeIdx } = selectedNode.value
  const step = selectedProjectSteps.value[stepIdx]
  if (!step) return
  const node = step.nodes[nodeIdx]
  if (!node || node.status !== 'active') return
  if (node.itemId && node.itemId === lockedItemId.value) {
    showToast("该事项正在番茄钟专注中，不能完成")
    return
  }
  await handleCompleteNode(stepIdx, nodeIdx)
}

</script>

<template>
  <div class="flex h-full" @focusin="editingKey = 'editing'" @focusout="editingKey = ''">
    <aside
      class="w-[220px] shrink-0 bg-card border-r border-sidebar-border flex flex-col h-full"
    >
      <div
        class="flex items-center justify-between px-5 py-[14px] border-b border-sidebar-border"
      >
        <span class="text-lg font-semibold text-card-foreground select-none">项目目录</span>
        <button
          class="size-7 rounded-md border border-sidebar-border flex items-center justify-center text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 cursor-pointer"
          title="新建目录"
          @click="handleAddCategory"
        >+</button>
      </div>
      <div class="flex-1 overflow-auto py-2">
        <div class="flex items-center gap-2 mx-3 mb-1 bg-sidebar-accent/30 border border-sidebar-border rounded-lg px-3 py-1.5">
          <svg class="size-4 text-sidebar-foreground/40 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z"/></svg>
          <input
            data-tab-cycle="search"
            v-model="searchQuery"
            type="text"
            placeholder="搜索流程..."
            class="flex-1 text-sm bg-transparent outline-none text-sidebar-foreground/80 placeholder:text-sidebar-foreground/30 min-w-0"
          />
        </div>
        <div
            v-for="cat in sortedCategories"
            :key="cat.id"
            class="border-b border-sidebar-border/30 last:border-b-0"
          >
            <div
              class="flex items-center gap-2 px-4 py-2.5 select-none cursor-pointer"
              @click="toggleCat(cat.id)"
              @contextmenu="handleCtxMenu($event, cat.id, cat.name)"
            >
              <svg
                class="size-2.5 shrink-0 text-sidebar-foreground/40 transition-transform duration-150"
                :class="isCatCollapsed(cat.id) ? '' : 'rotate-90'"
                viewBox="0 0 10 10" fill="currentColor"
              >
                <path d="M3,1 L7,5 L3,9" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
              <template v-if="renamingCatId === cat.id">
                <input
                  :data-rename="'cat-' + cat.id"
                  type="text"
                  :value="cat.name"
                  class="text-sm font-semibold text-sidebar-foreground/70 bg-transparent border border-blue-400 rounded px-1 py-0 outline-none w-full"
                  @blur="(e) => doRename(cat.id, e.target as HTMLInputElement)"
                  @keydown.enter="(e) => doRename(cat.id, e.target as HTMLInputElement)"
                  @click.stop
                />
              </template>
              <span v-else class="text-sm font-semibold text-sidebar-foreground/70 tracking-wide select-none">{{ cat.name }}</span>
            </div>
            <div v-if="!isCatCollapsed(cat.id)">
              <div
              v-for="p in getProjectsByCategory(cat.id)"
              :key="p.id"
              class="flex items-center gap-2.5 px-5 py-2.5 cursor-pointer border-l-[3px] transition-all duration-150 min-w-0"
              :class="p.id === selectedProjectId ? 'bg-blue-50 dark:bg-blue-500/10 border-l-blue-500' : 'border-l-transparent hover:bg-sidebar-accent/50'"
              @click="handleSelectProject(p.id)"
              @contextmenu="handleProjectCtxMenu($event, p.id, p.name)"
            >
              <div
                class="size-2 rounded-full shrink-0"
                :class="dotColorByProject(p)"
              ></div>
              <template v-if="renamingProjectId === p.id">
                <input
                  :data-rename="'proj-' + p.id"
                  type="text"
                  :value="p.name"
                  class="text-sm text-sidebar-foreground/80 bg-transparent border border-blue-400 rounded px-1 py-0 outline-none flex-1 min-w-0 max-w-full"
                  @blur="(e) => doRenameProject(p.id, e.target as HTMLInputElement)"
                  @keydown.enter="(e) => doRenameProject(p.id, e.target as HTMLInputElement)"
                  @click.stop
                />
              </template>
              <span v-else class="text-sm text-sidebar-foreground/80 flex-1 truncate min-w-0 select-none">{{ p.name }}</span>
              <span v-if="getActiveNodeOverdueDays(p)" class="text-[13px] shrink-0 select-none text-red-500">过期{{ getActiveNodeOverdueDays(p) }}天</span>
            </div>
            <div v-if="!isCatCollapsed(cat.id) && getProjectsByCategory(cat.id).length === 0">
              <div class="px-5 py-3 text-[11px] text-sidebar-foreground/30 italic pointer-events-none select-none">暂无项目</div>
            </div>
          </div>
        </div>
      </div>

      <!-- Bug 6: absolute → fixed, pageX/pageY → clientX/clientY -->
      <div
        v-if="contextMenu"
        class="fixed z-50 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[120px]"
        :style="{ left: contextMenu.x + 'px', top: contextMenu.y + 'px' }"
        @click.stop
      >
        <template v-if="contextMenu.catId !== undefined && contextMenu.catId !== DONE_CATEGORY_ID">
          <button
            class="w-full text-left px-3 py-1.5 text-sm text-card-foreground hover:bg-muted cursor-pointer"
            @click="doNewProject(contextMenu!.catId!)"
          >新建项目</button>
          <button
            class="w-full text-left px-3 py-1.5 text-sm text-card-foreground hover:bg-muted cursor-pointer"
            @click="startRename(contextMenu!.catId!)"
          >重命名</button>
          <div class="border-t border-border my-1"></div>
          <button
            class="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer"
            @click="removeCategory(contextMenu!.catId!); closeContextMenu()"
          >删除目录</button>
        </template>
        <template v-else-if="contextMenu.projectId !== undefined">
          <button
            class="w-full text-left px-3 py-1.5 text-sm text-card-foreground hover:bg-muted cursor-pointer"
            @click="startRenameProject(contextMenu!.projectId!)"
          >重命名</button>
          <div class="border-t border-border my-1"></div>
          <button
            class="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer"
            @click="doDeleteProject(contextMenu!.projectId!)"
          >删除流程</button>
        </template>
      </div>
    </aside>

<div class="flex-1 flex flex-col min-w-0">
      <template v-if="selectedProject">
<div class="flex items-center gap-3 px-6 py-[16px] border-b border-border shrink-0"
        >
        <span class="text-base font-semibold text-foreground select-none">{{ selectedProject.name }}</span>
        <span
          class="text-[11px] px-2.5 py-0.5 rounded-full select-none"
          :class="projectStatusColor(projectStatusByNodes)"
        >● {{ runTimeDisplay }}</span>
      </div>

      <div class="flex-1 flex min-h-0 overflow-hidden">
        <div ref="flowColumnRef" class="flex flex-col flex-1 min-w-0 relative">
          <div
            ref="scrollContainerRef"
            class="flex-1 overflow-auto pt-6 pb-20 scroll-container"
            @click="handleScrollContainerClick"
          >
            <div ref="flowWrapperRef" class="relative px-4 mx-auto w-fit">
              <FlowConnectionsSvg
                :paths="connectionPaths"
                :width="svgDims.w"
                :height="svgDims.h"
              />
              <div
                ref="flowGridRef"
                tabindex="-1"
                class="flex flex-col outline-none relative"
                style="z-index:2"
                @keydown="handleKeydown"
              >
                <template v-for="(item, idx) in flowItems" :key="idx">
                  <div
                    v-if="item.type === 'start'"
                    class="flex pt-2 justify-center"
                  >
                    <div
                      data-flow-start
                      class="w-[130px] px-4 py-3 rounded-xl border bg-card flex flex-col items-center gap-1.5 select-none transition-all duration-150"
                      :class="startReady && !activeNodePosition ? 'border-green-400 ring-1 ring-green-400' : 'border-border'"
                      @click="handleStartClick"
                    >
                      <span class="text-sm font-semibold" :class="startReady && !activeNodePosition ? 'text-green-500' : 'text-muted-foreground'">开始</span>
                    </div>
                  </div>

                  <div
                    v-else-if="item.type === 'end'"
                    class="flex pt-2 justify-center"
                  >
                    <div
                      data-flow-end
                      class="w-[130px] px-4 py-3 rounded-xl border bg-card flex flex-col items-center gap-1.5 select-none transition-all duration-150"
                      :class="(selectedNode?.stepIdx === -1) || (activeNodePosition && activeNodePosition.stepIdx === -1) ? 'border-green-400 ring-1 ring-green-400' : 'border-border'"
                    >
                      <span class="text-sm font-semibold" :class="(selectedNode?.stepIdx === -1) || (activeNodePosition && activeNodePosition.stepIdx === -1) ? 'text-green-500' : 'text-muted-foreground'">结束</span>
                    </div>
                  </div>

                  <div
                    v-else-if="item.type === 'connector'"
                    class="flex h-[44px]"
                    @click="selectedNode = null"
                  >
                    <div class="flex flex-nowrap gap-5">
                      <div v-for="si in Math.max(item.aboveCount, item.belowCount)" :key="si" class="w-[130px]"></div>
                    </div>
                  </div>

                  <div
                    v-else-if="item.type === 'step'"
                    class="flex justify-center outline-none"
                    :data-flow-step="item.stepIndex"
                    :data-current-step="item.stepIndex === selectedStepIdx ? 'true' : undefined"
                    @click="selectedNode = null"
                  >
                    <div class="pt-2 flex">
                      <div class="flex flex-nowrap items-center justify-center">
                        <template v-for="(node, ni) in selectedProjectSteps[item.stepIndex]?.nodes || []" :key="node.id">
                          <div v-if="ni > 0" class="shrink-0 w-5"></div>
                          <!-- 插入指示线（在节点左侧） -->
                          <div
                            v-if="isDragging && dragOver?.stepIdx === item.stepIndex && dragOver?.nodeIdx === ni && dragOver?.side === 'left' && !(dragTarget?.stepIdx === item.stepIndex && dragTarget?.nodeIdx === ni)"
                            class="w-1 self-stretch rounded-full bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.5)] shrink-0 pointer-events-none"
                          ></div>
                          <div
                            :data-node-idx="ni"
                            class="w-[130px] px-3 py-3 rounded-xl border flex flex-col items-center gap-1 relative z-10 select-none"
                            :class="[
                              node.status === 'active' && isNodeOverdue(node) ? 'border-red-400 bg-card' : node.status === 'active' ? 'border-green-400 bg-green-50 dark:bg-green-900/20' : 'border-border bg-card',
                              item.stepIndex === selectedNode?.stepIdx && ni === selectedNode?.nodeIdx ? '!border-blue-500 !bg-blue-50 dark:!bg-blue-900/20 ring-1 ring-blue-500' : '',
                              node.status === 'active' && isNodeOverdue(node) && !(item.stepIndex === selectedNode?.stepIdx && ni === selectedNode?.nodeIdx) ? 'ring-1 ring-red-400' : '',
                              node.status === 'active' && !isNodeOverdue(node) && !(item.stepIndex === selectedNode?.stepIdx && ni === selectedNode?.nodeIdx) ? 'ring-1 ring-green-400' : '',
                              isDragging && dragTarget?.stepIdx === item.stepIndex && dragTarget?.nodeIdx === ni ? 'cursor-grabbing' : 'cursor-pointer',
                              isDragging && dragTarget?.stepIdx === item.stepIndex && dragTarget?.nodeIdx === ni ? 'opacity-30' : '',
                              justActivated?.stepIdx === item.stepIndex && justActivated?.nodeIdx === ni ? 'animate-node-pulse' : '',
                            ]"
                            @mousedown.prevent="handleNodeMouseDown(item.stepIndex, ni, $event)"
                            @click.stop
                          >
                            <div class="flex items-center gap-1 w-full justify-center">
                              <span
                                v-if="node.status === 'wait'"
                                class="size-3 rounded-full shrink-0"
                                :class="item.stepIndex === selectedNode?.stepIdx && ni === selectedNode?.nodeIdx ? 'bg-blue-500' : 'bg-gray-400'"
                              ></span>
                              <span
                                v-else-if="node.status === 'active'"
                                class="size-3 rounded-full shrink-0"
                                :class="isNodeOverdue(node) ? 'bg-red-500' : 'bg-green-500'"
                              ></span>
                              <span
                                v-else-if="node.status === 'done'"
                                class="text-sm shrink-0 font-bold"
                                :class="item.stepIndex === selectedNode?.stepIdx && ni === selectedNode?.nodeIdx ? 'text-blue-400' : 'text-gray-400 dark:text-gray-500'"
                              >✓</span>
                              <span
                                class="text-sm font-semibold text-center truncate max-w-full"
                                :title="node.name"
                                :class="[
                                  node.status === 'done' ? 'text-gray-400 dark:text-gray-500' :
                                  item.stepIndex === selectedNode?.stepIdx && ni === selectedNode?.nodeIdx ? 'text-blue-600' :
                                  node.status === 'active' && isNodeOverdue(node) ? 'text-red-600' :
                                  node.status === 'active' ? 'text-green-800 dark:text-green-400' :
                                  'text-gray-800 dark:text-gray-300'
                                ]"
                              >{{ node.name }}</span>
                            </div>
                          </div>
                          <!-- 插入指示线（在节点右侧） -->
                          <div
                            v-if="isDragging && dragOver?.stepIdx === item.stepIndex && dragOver?.nodeIdx === ni && dragOver?.side === 'right' && !(dragTarget?.stepIdx === item.stepIndex && dragTarget?.nodeIdx === ni)"
                            class="w-1 self-stretch rounded-full bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.5)] shrink-0 pointer-events-none"
                          ></div>
                        </template>
                        <!-- 末尾插入指示线 -->
                        <div
                          v-if="isDragging && dragOver?.stepIdx === item.stepIndex && dragOver?.nodeIdx === -1"
                          class="w-1 self-stretch rounded-full bg-blue-400 shadow-[0_0_8px_rgba(59,130,246,0.5)] shrink-0 pointer-events-none"
                        ></div>
                      </div>
                    </div>
                  </div>
                </template>
              </div>
            </div>
          </div>
        <!-- 浮层底部操作栏 -->
        <div
          v-if="bottomNodeInfo"
          class="absolute bottom-8 left-4 right-4 rounded-lg border border-border bg-card px-5 py-3 flex items-center justify-between shadow-lg"
          @click.stop
        >
          <div class="flex items-center gap-2 min-w-0">
            <span class="text-sm text-muted-foreground shrink-0 select-none">当前：</span>
            <span class="text-sm font-medium text-card-foreground truncate select-none">{{ bottomNodeInfo.name }}</span>
          </div>
          <button
            class="px-4 py-1.5 text-sm rounded-lg flex items-center gap-1.5 transition-colors shrink-0 select-none"
            :class="bottomNodeInfo.status === 'active'
              ? 'bg-blue-500 hover:bg-blue-600 text-white cursor-pointer shadow-sm'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed'"
            :disabled="bottomNodeInfo.status !== 'active'"
            @click="handleCompleteCurrentNode"
          >
            <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/>
            </svg>
            <span class="select-none">{{ bottomNodeInfo.status === 'active' ? '完成任务' : bottomNodeInfo.status === 'done' ? '已完成' : '不可操作' }}</span>
          </button>
        </div>
        </div>

        <!-- 右侧详情面板（与流程图同一容器） -->
        <div
          v-if="selectedProject"
          class="w-[320px] border-l border-border bg-card shrink-0 flex flex-col overflow-y-auto"
        >
      <NodeDetailPanel
        :node="detailPanelNode"
        :step-idx="selectedNode?.stepIdx ?? 0"
        :node-idx="selectedNode?.nodeIdx ?? 0"
        :project="selectedProject"
        @close="selectedNode = null"
      />
    </div>
      </div>
    </template>
    <template v-else>
      <div class="flex-1 flex items-center justify-center select-none">
        <div class="text-center">
          <div class="text-4xl mb-4 text-gray-300 dark:text-gray-600">📋</div>
          <div class="text-base font-medium text-muted-foreground mb-2">还没有项目</div>
          <div class="text-sm text-muted-foreground">在左侧目录中右键新建项目</div>
        </div>
      </div>
    </template>
  </div>
  <!-- 拖拽幽灵元素 -->
  <div
    v-if="isDragging && dragTarget"
    class="fixed pointer-events-none z-[9999] bg-card rounded-lg px-3 py-2 shadow-xl border border-border text-sm text-card-foreground opacity-90"
    :style="{ left: (dragMouseX + 12) + 'px', top: (dragMouseY + 12) + 'px' }"
  >{{ draggedNodeName }}</div>
  </div>
</template>

<style scoped>
@keyframes node-pulse {
  0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
  100% { box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
}
.animate-node-pulse {
  animation: node-pulse 0.6s ease-out 1;
}

/* Scrollbar styling for the flow chart area */
.scroll-container::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
.scroll-container::-webkit-scrollbar-track {
  background: transparent;
}
.scroll-container::-webkit-scrollbar-thumb {
  background: #d1d5db;
  border-radius: 3px;
}
.scroll-container::-webkit-scrollbar-thumb:hover {
  background: #9ca3af;
}
</style>




