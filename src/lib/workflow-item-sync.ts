// 工作流-事项连接模块
// 管理工作流节点与事项之间的同步，独立于两个 store 之外
// 全部使用动态 import 避免循环依赖

/** 事项完成 → 推进工作流节点 */
export async function onItemCompleted(projectId: number, nodeId: number) {
  const { getProjectById, selectProject, completeNodeAndAdvance } = await import("@/store/workflow")
  const project = getProjectById(projectId)
  if (!project) return
  for (let si = 0; si < project.steps.length; si++) {
    const step = project.steps[si]
    for (let ni = 0; ni < step.nodes.length; ni++) {
      if (step.nodes[ni].id === nodeId && step.nodes[ni].status !== "done") {
        selectProject(projectId)
        await completeNodeAndAdvance(si, ni)
        return
      }
    }
  }
}

/** 事项编辑 → 同步回工作流节点 */
export async function onItemUpdated(projectId: number, nodeId: number, data: { name: string; description: string; startDate: string; endDate: string; priority: string }) {
  const { getProjectById, saveWorkflow } = await import("@/store/workflow")
  const project = getProjectById(projectId)
  if (!project) return
  for (const step of project.steps) {
    for (const node of step.nodes) {
      if (node.id === nodeId) {
        node.name = data.name
        node.description = data.description
        node.startDate = data.startDate
        node.endDate = data.endDate
        node.priority = data.priority as any
        await saveWorkflow()
        return
      }
    }
  }
}

/** 事项删除 → 清理工作流节点引用 */
export async function onItemDeleted(projectId: number, nodeId: number) {
  const { getProjectById, saveWorkflow } = await import("@/store/workflow")
  const project = getProjectById(projectId)
  if (!project) return
  for (const step of project.steps) {
    for (const node of step.nodes) {
      if (node.id === nodeId) {
        node.itemId = undefined
        await saveWorkflow()
        return
      }
    }
  }
}