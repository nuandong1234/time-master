<script setup lang="ts">
import { onMounted, onActivated, onUnmounted, ref, computed, watch, nextTick } from "vue"
import { useWorkflow, type WorkflowNode } from "@/store/workflow"
import { initWorkflow } from "@/store/workflow"
import NodeDetailPanel from "@/components/NodeDetailPanel.vue"
import FlowConnectionsSvg from "@/components/flow/FlowConnectionsSvg.vue"
import WorkflowSidebar from "@/components/workflow/WorkflowSidebar.vue"
import { useWorkflowConnections } from "@/composables/useWorkflowConnections"
import { useWorkflowDrag } from "@/composables/useWorkflowDrag"
import { useWorkflowOperations } from "@/composables/useWorkflowOperations"
import { useWorkflowKeyboard } from "@/composables/useWorkflowKeyboard"


const {
  selectedStepIdx, selectedProject,
  selectedProjectSteps,
  selectedProjectId,
  getDurationDays,
  selectStep,
} = useWorkflow()

const flowGridRef = ref<HTMLElement | null>(null)
const flowColumnRef = ref<HTMLDivElement | null>(null)
const flowWrapperRef = ref<HTMLDivElement | null>(null)
const scrollContainerRef = ref<HTMLDivElement | null>(null)
const refreshTick = ref(0)
let refreshTimer: ReturnType<typeof setInterval> | undefined

const {
  connectionPaths,
  svgDims,
  updateConnections,
  drawAfterLayout,
} = useWorkflowConnections(flowWrapperRef)

const ops = useWorkflowOperations(flowGridRef, scrollContainerRef, drawAfterLayout)

const {
  selectedNode,
  startReady,
  justActivated,
  activeNodePosition,
  detailPanelNode,
  bottomNodeInfo,
  deselectNode,
  startFlow,
  completeCurrentNode,
  scrollToCurrentStep,
  scrollToSelectedNode,
} = ops

const kbd = useWorkflowKeyboard(
  { addNode: ops.addNode, addStep: ops.addStep, deleteNode: ops.deleteNode },
  () => selectedStepIdx.value,
)

let resizeObserver: ResizeObserver | null = null
let editingKey = ref("")

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

// SVG 连线逻辑已提取到 useWorkflowConnections 组合式函数
// activeNodePosition、detailPanelNode 已移至 useWorkflowOperations

function isNodeOverdue(node: WorkflowNode) {
  if (node.status !== 'active' || !node.endDate) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = new Date(node.endDate)
  end.setHours(0, 0, 0, 0)
  return end < today
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
  flowGridRef.value?.focus()
  document.addEventListener("keydown", kbd.handleTabBlock)

  let rafPendingId: number | null = null
  resizeObserver = new ResizeObserver(() => {
    if (rafPendingId !== null) return
    rafPendingId = requestAnimationFrame(() => {
      rafPendingId = null
      updateConnections()
    })
  })
  const observe = (el: Element | null) => el && resizeObserver?.observe(el)
  observe(flowColumnRef.value)
  observe(flowWrapperRef.value)
  observe(scrollContainerRef.value)
  observe(flowGridRef.value)

  await ops.doLayoutAndScroll()

  refreshTimer = setInterval(() => {
    refreshTick.value++
  }, 60_000)
})

onActivated(() => {
  nextTick(() => {
    drawAfterLayout()
    scrollToCurrentStep()
    flowGridRef.value?.focus()
  })
})

watch(selectedProjectSteps, () => {
  updateConnections()
}, { deep: true })

watch(selectedProjectId, (id) => {
  if (id) ops.selectProject(id)
  updateConnections()
})

onUnmounted(() => {
  document.removeEventListener("keydown", kbd.handleTabBlock)
  if (_savedMouseUpHandler) {
    document.removeEventListener("mouseup", _savedMouseUpHandler)
  }
  document.removeEventListener("mousemove", handleDocumentMouseMove)
  resizeObserver?.disconnect()
  clearInterval(refreshTimer)
})

const duration = computed(() => {
  const p = selectedProject.value
  refreshTick.value // 定时刷新天数
  return p ? getDurationDays(p.firstActivatedAt || p.createdAt) : 0
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

// handleKeydown 已移至 useWorkflowKeyboard
// handleStartClick、handleCompleteNode 已移至 useWorkflowOperations

function handleSelectProject(id: number) {
  editingKey.value = ""
  ops.selectProject(id)
  scrollToCurrentStep()
}

// handleScrollContainerClick、scrollToCurrentStep、scrollToSelectedNode、
// bottomNodeInfo、handleTabBlock、handleCompleteCurrentNode 已移至 composable

</script>

<template>
  <div class="flex h-full" @focusin="editingKey = 'editing'" @focusout="editingKey = ''">
    <WorkflowSidebar @select-project="handleSelectProject" />

<div class="flex-1 flex flex-col min-w-0">
      <template v-if="selectedProject">
<div class="flex items-center gap-3 px-6 py-[16px] border-b border-border shrink-0"
        >
        <span class="text-base font-semibold text-foreground select-none">{{ selectedProject.name }}</span>
        <span
          class="text-[11px] px-2.5 py-0.5 rounded-full select-none"
          :class="projectStatusColor(projectStatusByNodes)"
        >● {{ runTimeDisplay }}</span>
        <span class="ml-auto flex items-center gap-3 text-[11px] text-muted-foreground select-none">
          <span class="flex items-center gap-1">
            <kbd class="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-[10px]">Alt+A</kbd>
            <span>添加节点</span>
          </span>
          <span class="flex items-center gap-1">
            <kbd class="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-[10px]">Enter</kbd>
            <span>添加步骤</span>
          </span>
          <span class="flex items-center gap-1">
            <kbd class="px-1.5 py-0.5 rounded bg-muted border border-border font-mono text-[10px]">Delete</kbd>
            <span>删除节点</span>
          </span>
        </span>
      </div>

      <div class="flex-1 flex min-h-0 overflow-hidden">
        <div ref="flowColumnRef" class="flex flex-col flex-1 min-w-0 relative">
          <div
            ref="scrollContainerRef"
            class="flex-1 overflow-auto pt-6 pb-20 scroll-container"
            @click="deselectNode"
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
                @keydown="kbd.handleKeydown"
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
                      @click="startFlow"
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
            @click="completeCurrentNode"
          >
            <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="m4.5 12.75 6 6 9-13.5"/>
            </svg>
            <span class="select-none">{{ bottomNodeInfo.status === 'active' ? '完成任务' : bottomNodeInfo.status === 'done' ? '已完成' : '不可操作' }}</span>
          </button>
        </div>
        </div>

        <!-- 右侧详情面板 -->
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