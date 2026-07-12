// 工作流-事项同步协调层
// 集中管理所有跨模块同步规则（共 7 条）
// 使用静态 import，无循环依赖（items.ts 和 workflow.ts 都不再引用本文件）

import { completeItem as itemsCompleteItem, updateItem as itemsUpdateItem, markItemAsDone, deleteItem as itemsDeleteItem, clearDoneItems as itemsClearDone, useItems } from "@/store/items"
import { useWorkflow, getProjectById, completeNodeAndAdvance as wfCompleteNodeAndAdvance, updateNodeDetail as wfUpdateNodeDetail, saveWorkflow } from "@/store/workflow"

const allItems = useItems()
const wfState = useWorkflow()

// ─── 帮助函数 ───

async function clearNodeItemRef(projectId: number, nodeId: number) {
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

/**
 * 规则 1：事项完成 → 推进关联工作流节点
 * 规则 4：事项完成 → 推进关联节点，产生连锁激活
 */
export async function completeItem(id: number) {
  const item = allItems.items.find((i: { id: number }) => i.id === id)
  const workflowRef = item?.workflowRef

  const result = await itemsCompleteItem(id)

  if (workflowRef && result) {
    const project = getProjectById(workflowRef.projectId)
    if (project) {
      for (let si = 0; si < project.steps.length; si++) {
        const step = project.steps[si]
        for (let ni = 0; ni < step.nodes.length; ni++) {
          if (step.nodes[ni].id === workflowRef.nodeId && step.nodes[ni].status !== "done") {
            await completeNodeAndAdvance(si, ni, workflowRef.projectId)
            return true
          }
        }
      }
    }
  }

  return result
}

/**
 * 规则 2：事项编辑 → 同步更新关联工作流节点
 */
export async function updateItem(id: number, data: {
  name: string; description: string; startDate: string; endDate: string; priority: string; repeatType?: string
}) {
  const item = allItems.items.find((i: { id: number }) => i.id === id)
  const workflowRef = item?.workflowRef

  await itemsUpdateItem(id, data)

  if (workflowRef) {
    const project = getProjectById(workflowRef.projectId)
    if (project) {
      for (const step of project.steps) {
        for (const node of step.nodes) {
          if (node.id === workflowRef.nodeId) {
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
  }
}

/**
 * 规则 3：事项删除 → 清除关联工作流节点引用
 */
export async function deleteItem(id: number, force?: boolean) {
  const item = allItems.items.find((i: { id: number }) => i.id === id)
  const workflowRef = item?.workflowRef

  const result = await itemsDeleteItem(id, force)

  if (workflowRef && result) {
    await clearNodeItemRef(workflowRef.projectId, workflowRef.nodeId)
  }

  return result
}

/**
 * 规则 3（批量）：清除已完成事项 → 同步清除关联工作流节点引用
 */
export async function clearDoneItems() {
  // 先收集所有已完成且有 workflowRef 的事项
  const doneWithRef = allItems.items.filter(
    (i: { done: boolean; workflowRef?: { projectId: number; nodeId: number } }) => i.done && i.workflowRef
  )

  // 先执行 items 侧的删除
  // clearDoneItems 会遍历 done 事项并删除它们，
  // 但清理后我们就找不到 workflowRef 了，所以先记录
  const refs = doneWithRef
    .map((i: { workflowRef?: { projectId: number; nodeId: number } }) => i.workflowRef)
    .filter((r): r is { projectId: number; nodeId: number } => !!r)

  // 直接调用 items 的纯清除逻辑
  await itemsClearDone()

  // 清理工作流节点引用
  for (const ref of refs) {
    if (ref) {
      await clearNodeItemRef(ref.projectId, ref.nodeId)
    }
  }
}

/**
 * 规则 5：工作流节点完成 → 把关联事项标为完成
 * 规则 6：节点完成 → 同步更新事项日期/名称
 */
export async function completeNodeAndAdvance(stepIdx: number, nodeIdx: number, projectId?: number) {
  // 获取关联事项 ID：有 projectId 时从对应项目取，否则从当前选中项目取
  let linkedItemId: number | undefined
  if (projectId !== undefined) {
    const project = getProjectById(projectId)
    const step = project?.steps?.[stepIdx]
    linkedItemId = step?.nodes?.[nodeIdx]?.itemId
  } else {
    const steps = wfState.selectedProjectSteps?.value
    const step = steps?.[stepIdx]
    linkedItemId = step?.nodes?.[nodeIdx]?.itemId
  }

  await wfCompleteNodeAndAdvance(stepIdx, nodeIdx, projectId)

  if (linkedItemId) {
    await markItemAsDone(linkedItemId)
  }
}

/**
 * 规则 7：工作流节点编辑 → 同步更新关联事项
 */
export async function updateNodeDetail(
  stepIdx: number,
  nodeIdx: number,
  data: { name?: string; description?: string; assignee?: string; startDate?: string; endDate?: string; priority?: string }
) {
  // 获取当前节点的关联事项 ID
  const steps = wfState.selectedProjectSteps?.value
  const step = steps?.[stepIdx]
  const currentNode = step?.nodes?.[nodeIdx]
  const linkedItemId = currentNode?.itemId

  // 调用纯工作流逻辑
  await wfUpdateNodeDetail(stepIdx, nodeIdx, data)

  // 同步更新关联事项
  if (linkedItemId && (data.name !== undefined || data.description !== undefined || data.startDate !== undefined || data.endDate !== undefined || data.priority !== undefined)) {
    const node = (wfState.selectedProjectSteps?.value?.[stepIdx]?.nodes?.[nodeIdx])
    if (node) {
      await itemsUpdateItem(linkedItemId, {
        name: node.name,
        description: node.description || '',
        startDate: node.startDate || '',
        endDate: node.endDate || '',
        priority: node.priority || 'important',
      })
    }
  }
}