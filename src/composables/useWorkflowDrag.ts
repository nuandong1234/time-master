import { ref, computed, type ComputedRef } from "vue"
import { moveNode, moveNodeAcrossSteps } from "@/store/workflow"
import { showToast } from "@/store/toast"
import type { WorkflowNode, WorkflowStep } from "@/store/workflow"

export function useWorkflowDrag(
  selectedProjectSteps: ComputedRef<WorkflowStep[]>,
  selectStepFn: (idx: number) => void,
) {
  const dragTarget = ref<{ stepIdx: number; nodeIdx: number } | null>(null)
  const dragOver = ref<{ stepIdx: number; nodeIdx: number; side: "left" | "right" } | null>(null)
  const isDragging = ref(false)
  const dragStartX = ref(0)
  const dragStartY = ref(0)
  const dragMouseX = ref(0)
  const dragMouseY = ref(0)

  const draggedNodeName = computed(() => {
    if (!dragTarget.value) return ''
    const node = selectedProjectSteps.value[dragTarget.value.stepIdx]?.nodes[dragTarget.value.nodeIdx]
    return node?.name || ''
  })

  function canDropAtNode(dragNode: WorkflowNode, targetNode: WorkflowNode, side: "left" | "right"): boolean {
    // 等待中节点不能拖到进行中/已完成的前面（左边），但可以拖到后面
    if (dragNode.status === "wait" && targetNode.status !== "wait" && side === "left") return false
    if (dragNode.status === "active" && targetNode.status === "done") return false
    return true
  }

  function canDropAtStepEnd(_dragNode: WorkflowNode, _toStep: WorkflowStep): boolean {
    return true
  }

  /** 在鼠标移动时更新拖拽目标位置 */
  function handleDocumentMouseMove(e: MouseEvent) {
    if (!dragTarget.value) return
    const dx = e.clientX - dragStartX.value
    const dy = e.clientY - dragStartY.value
    if (!isDragging.value && Math.abs(dx) + Math.abs(dy) > 5) {
      isDragging.value = true
      document.body.style.cursor = 'grabbing'
    }
    if (!isDragging.value) return

    dragMouseX.value = e.clientX
    dragMouseY.value = e.clientY

    let targetStepIdx = -1
    let targetNodeIdx = -1
    let side: "left" | "right" = "left"
    const stepEls = document.querySelectorAll<HTMLElement>('[data-flow-step]')

    for (const stepEl of stepEls) {
      const stepRect = stepEl.getBoundingClientRect()
      if (e.clientY >= stepRect.top && e.clientY <= stepRect.bottom) {
        targetStepIdx = parseInt(stepEl.getAttribute('data-flow-step') || '-1')
        const cards = stepEl.querySelectorAll<HTMLElement>('[data-node-idx]')
        let found = false
        for (let ci = 0; ci < cards.length; ci++) {
          const card = cards[ci]
          const rect = card.getBoundingClientRect()
          if (e.clientX >= rect.left && e.clientX <= rect.right) {
            const cardIdx = parseInt(card.getAttribute('data-node-idx') || '-1')
            const insideSide: "left" | "right" = e.clientX < rect.left + rect.width / 2 ? "left" : "right"
            if (insideSide === "right" && ci < cards.length - 1) break
            targetNodeIdx = cardIdx
            side = insideSide
            found = true
            break
          }
        }
        if (!found && cards.length > 0) {
          for (const card of cards) {
            const rect = card.getBoundingClientRect()
            const cardIdx = parseInt(card.getAttribute('data-node-idx') || '-1')
            if (e.clientX < rect.left) {
              targetNodeIdx = cardIdx
              side = "left"
              found = true
              break
            }
          }
          if (!found) {
            targetNodeIdx = parseInt(cards[cards.length - 1].getAttribute('data-node-idx') || '-1')
            side = "right"
          }
        } else if (!found) {
          targetNodeIdx = -1
          side = "right"
        }
        break
      }
    }

    dragOver.value = targetStepIdx >= 0
      ? { stepIdx: targetStepIdx, nodeIdx: targetNodeIdx, side }
      : null
  }

  /** 执行拖拽移动逻辑（不包含点击选择逻辑） */
  function executeDragMove(
    onAfterMove: (opts: { stepIdx: number; nodeIdx: number }) => void,
  ) {
    const from = dragTarget.value
    const to = dragOver.value
    if (!from || !to) {
      resetDragState()
      return
    }
    const dragNode = selectedProjectSteps.value[from.stepIdx]?.nodes[from.nodeIdx]

    if (to.nodeIdx === -1) {
      const toStep = selectedProjectSteps.value[to.stepIdx]
      if (!toStep || !canDropAtStepEnd(dragNode, toStep)) {
        showToast('当前节点无法移动到此处')
        resetDragState()
        return
      }
      const insertIdx = toStep.nodes.length
      if (from.stepIdx === to.stepIdx) {
        let targetIdx = insertIdx
        if (from.nodeIdx < targetIdx) targetIdx--
        if (from.nodeIdx !== targetIdx) {
          moveNode(from.stepIdx, from.nodeIdx, targetIdx)
          selectStepFn(from.stepIdx)
          onAfterMove({ stepIdx: from.stepIdx, nodeIdx: targetIdx })
        }
      } else {
        if (toStep.nodes.length >= 5) {
          showToast('每个步骤最多5个节点')
          resetDragState()
          return
        }
        const fromStep = selectedProjectSteps.value[from.stepIdx]
        const willDeleteSource = fromStep && fromStep.nodes.length === 1
        moveNodeAcrossSteps(from.stepIdx, from.nodeIdx, to.stepIdx, insertIdx)
        const adjustedTo = willDeleteSource && from.stepIdx < to.stepIdx ? to.stepIdx - 1 : to.stepIdx
        selectStepFn(adjustedTo)
        onAfterMove({ stepIdx: adjustedTo, nodeIdx: insertIdx })
      }
    } else {
      const targetNode = selectedProjectSteps.value[to.stepIdx]?.nodes[to.nodeIdx]
      if (!targetNode || !canDropAtNode(dragNode, targetNode, to.side)) {
        showToast('当前节点无法移动到此处')
        resetDragState()
        return
      }
      let targetIdx = to.nodeIdx
      if (to.side === 'right') targetIdx++

      if (from.stepIdx === to.stepIdx) {
        let adjustedIdx = targetIdx
        if (from.nodeIdx < adjustedIdx) adjustedIdx--
        if (from.nodeIdx !== adjustedIdx) {
          moveNode(from.stepIdx, from.nodeIdx, adjustedIdx)
          selectStepFn(from.stepIdx)
          onAfterMove({ stepIdx: from.stepIdx, nodeIdx: adjustedIdx })
        }
      } else {
        const toStep = selectedProjectSteps.value[to.stepIdx]
        if (toStep && toStep.nodes.length >= 5) {
          showToast('每个步骤最多5个节点')
          resetDragState()
          return
        }
        const fromStep = selectedProjectSteps.value[from.stepIdx]
        const willDeleteSource = fromStep && fromStep.nodes.length === 1
        moveNodeAcrossSteps(from.stepIdx, from.nodeIdx, to.stepIdx, targetIdx)
        const adjustedTo = willDeleteSource && from.stepIdx < to.stepIdx ? to.stepIdx - 1 : to.stepIdx
        selectStepFn(adjustedTo)
        const newNodeIdx = to.side === 'right' ? targetIdx - 1 : targetIdx
        onAfterMove({ stepIdx: adjustedTo, nodeIdx: newNodeIdx })
      }
    }
    resetDragState()
  }

  function resetDragState() {
    dragTarget.value = null
    dragOver.value = null
    isDragging.value = false
    document.body.style.cursor = ''
  }

  return {
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
  }
}