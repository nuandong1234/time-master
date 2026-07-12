/**
 * 工作流页面键盘快捷键模块
 *
 * 只负责快捷键映射，不包含操作逻辑。
 * 依赖 useWorkflowOperations 提供的操作函数。
 */
export function useWorkflowKeyboard(
  operations: {
    addNode: (stepIdx: number) => void
    addStep: (currentStepIdx: number) => void
    deleteNode: () => void
  },
  getCurrentStepIdx: () => number,
) {

  function handleKeydown(e: KeyboardEvent) {
    // Alt+A：添加节点
    if (e.code === "KeyA" && e.altKey) {
      e.preventDefault()
      operations.addNode(getCurrentStepIdx())
      return
    }

    if (e.key === "Enter") {
      e.preventDefault()
      operations.addStep(getCurrentStepIdx())
      return
    }

    if (e.key === "Delete") {
      operations.deleteNode()
    }
  }

  /** Tab 在页面内不可切换焦点 */
  function handleTabBlock(e: KeyboardEvent) {
    if (e.key === "Tab") {
      e.preventDefault()
    }
  }

  return {
    handleKeydown,
    handleTabBlock,
  }
}