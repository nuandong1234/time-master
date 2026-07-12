import { ref, computed } from "vue"
import { useItems } from "@/store/items"
import { usePomodoroStore } from "@/store/pomodoro"
import { isOverdue } from "@/lib/item-utils"

export function useItemFilter() {
  const { todoItems, syncedItems, doneItems } = useItems()
  const { lockedItemId } = usePomodoroStore()

  const activeTab = ref<"todo" | "done">("todo")
  const searchKeyword = ref("")

  const overdueCount = computed(() => {
    return [...todoItems.value, ...syncedItems.value].filter(i => isOverdue(i.endDate)).length
  })

  const currentItems = computed(() => {
    // 依赖 lockedItemId：当番茄钟锁定任务变化时，列表需重新渲染以更新拖拽限制状态
    lockedItemId.value
    const items = activeTab.value === "todo" ? [...todoItems.value, ...syncedItems.value] : doneItems.value
    const sorted = [...items]
    if (activeTab.value === "todo") {
      sorted.sort((a, b) => {
        const c = a.createdAt.localeCompare(b.createdAt)
        if (c !== 0) return c
        return a.id - b.id
      })
    } else {
      sorted.sort((a, b) => {
        const c = a.doneAt.localeCompare(b.doneAt)
        if (c !== 0) return c
        return a.id - b.id
      })
    }
    const keyword = searchKeyword.value.trim().toLowerCase()
    if (!keyword) return sorted
    /** 模糊匹配：检查 text 中是否有 query 的所有字符（按顺序） */
    function fuzzyMatch(text: string, query: string): boolean {
      let qi = 0
      for (let ti = 0; ti < text.length && qi < query.length; ti++) {
        if (text[ti] === query[qi]) qi++
      }
      return qi === query.length
    }
    return sorted.filter(i =>
      fuzzyMatch(i.name.toLowerCase(), keyword) ||
      fuzzyMatch(i.description.toLowerCase(), keyword)
    )
  })

  const quadrants = [
    { key: "urgent-important" as const, label: "重要且紧急", color: "bg-red-500" },
    { key: "important" as const, label: "重要不紧急", color: "bg-orange-500" },
    { key: "urgent" as const, label: "不重要紧急", color: "bg-blue-500" },
    { key: "none" as const, label: "不重要不紧急", color: "bg-green-500" },
  ]

  function getQuadrantItems(key: string) {
    return currentItems.value.filter(i => i.priority === key)
  }

  return {
    activeTab, searchKeyword, overdueCount, currentItems, quadrants, getQuadrantItems,
  }
}