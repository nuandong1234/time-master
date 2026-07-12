import { ref, computed, nextTick, type Ref } from "vue"
import { useWorkflow } from "@/store/workflow"
import {
  activateNode,
  removeNodeFromStep,
  addNodeToStep,
  addStepAfter,
  selectProject as storeSelectProject,
  selectStep,
} from "@/store/workflow"
import { completeNodeAndAdvance } from "@/lib/workflow-item-sync"
import { showToast } from "@/store/toast"
import { usePomodoroStore } from "@/store/pomodoro"

/**
 * 工作流节点/步骤操作编排层
 *
 * 职责：编排 store 调用 + 后处理副效应（SVG 重绘、滚动定位、焦点管理），
 * 不包含纯数据逻辑（纯数据逻辑在 workflow.ts 中）。
 *
 * 接口即 WorkflowView 页面的功能清单。
 */
export function useWorkflowOperations(
  flowGridRef: Ref<HTMLElement | null>,
  scrollContainerRef: Ref<HTMLElement | null>,
  onDrawAfterLayout?: () => void,
) {
  const { selectedProject, selectedProjectSteps } = useWorkflow()
  const { lockedItemId } = usePomodoroStore()

  // ====== 选中状态 ======
  const selectedNode = ref<{ stepIdx: number; nodeIdx: number } | null>(null)
  const startReady = ref(false)
  const justActivated = ref<{ stepIdx: number; nodeIdx: number } | null>(null)

  // ====== 派生状态 ======

  /** 锁定标记：始终指向当前进行中的节点（status === 'active'） */
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

  /** 右侧详情面板节点数据：从统一选中状态派生 */
  const detailPanelNode = computed(() => {
    if (!selectedNode.value) return null
    if (selectedNode.value.stepIdx < 0) return null
    const step = selectedProjectSteps.value[selectedNode.value.stepIdx]
    if (!step) return null
    return step.nodes[selectedNode.value.nodeIdx] || null
  })

  /** 底部操作栏数据 */
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

  // ====== 滚动定位 ======

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
      onDrawAfterLayout?.()
      await new Promise(r => setTimeout(r, 100))
    }
    scrollToCurrentStep()
  }

  // ====== 节点/步骤操作 ======

  async function startFlow() {
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

          // 脉冲动画
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

  async function completeNode(stepIdx: number, nodeIdx: number) {
    await completeNodeAndAdvance(stepIdx, nodeIdx)
    showToast('任务完成', 'success')
    onDrawAfterLayout?.()

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

  async function completeCurrentNode() {
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
    await completeNode(stepIdx, nodeIdx)
  }

  function deselectNode() {
    selectedNode.value = null
    nextTick(() => flowGridRef.value?.focus())
  }

  /** 切换到项目（核心选中逻辑，不处理页面级 UI 状态如搜索/折叠） */
  function selectProject(id: number) {
    selectedNode.value = null
    startReady.value = false
    storeSelectProject(id)
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

  function addNode(stepIdx: number) {
    addNodeToStep(stepIdx).then(newIdx => {
      if (newIdx >= 0) {
        selectedNode.value = { stepIdx, nodeIdx: newIdx }
      } else {
        showToast('每个步骤最多5个节点')
      }
      onDrawAfterLayout?.()
      scrollToSelectedNode()
    })
    nextTick(() => flowGridRef.value?.focus())
  }

  async function addStep(currentStepIdx: number) {
    const steps = selectedProjectSteps.value
    if (steps.length) {
      addStepAfter(currentStepIdx)
    }
    nextTick(() => {
      selectStep(currentStepIdx + 1)
      selectedNode.value = { stepIdx: currentStepIdx + 1, nodeIdx: 0 }
      flowGridRef.value?.focus()
      scrollToSelectedNode()
      onDrawAfterLayout?.()
    })
  }

  async function deleteNode() {
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
      onDrawAfterLayout?.()
      scrollToSelectedNode()
    })
  }

  return {
    // 状态
    selectedNode,
    startReady,
    justActivated,

    // 派生
    activeNodePosition,
    detailPanelNode,
    bottomNodeInfo,

    // 操作
    startFlow,
    completeNode,
    completeCurrentNode,
    deselectNode,
    selectProject,
    addNode,
    addStep,
    deleteNode,

    // 滚动
    scrollToCurrentStep,
    scrollToSelectedNode,
    doLayoutAndScroll,
  }
}