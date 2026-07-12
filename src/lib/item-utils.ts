import { getProjectById } from "@/store/workflow"

export function getWorkflowProjectName(projectId: number): string {
  const project = getProjectById(projectId)
  return project ? project.name : "项目"
}

export function isOverdue(endDate: string): boolean {
  if (!endDate) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = new Date(endDate)
  end.setHours(0, 0, 0, 0)
  return end < today
}
