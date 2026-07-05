import { ref, computed } from "vue"
import { useItems } from "@/store/items"
import { showToast } from "@/store/toast"
import { usePomodoroStore } from "@/store/pomodoro"

export function useItemDrag() {
  const { todoItems, syncedItems, updateItem } = useItems()
  const { lockedItemId } = usePomodoroStore()

  const dragItemId = ref<number | null>(null)
  const dragOverKey = ref<string | null>(null)
  const dragOverIndex = ref<number>(-1)
  const isDragging = ref(false)
  const dragX = ref(0)
  const dragY = ref(0)
  let dragStartX = 0
  let dragStartY = 0
  let dragActive = false // 本次鼠标操作是否产生过拖拽

  const dragItemName = computed(() => {
    if (!dragItemId.value) return ""
    const item = [...todoItems.value, ...syncedItems.value].find(i => i.id === dragItemId.value)
    return item ? item.name : ""
  })

  function onMouseDown(e: MouseEvent, itemId: number) {
    if (e.button !== 0) return
    // 已完成和专注中的事项不可拖拽
    if (itemId === lockedItemId.value) return
    const allItems = [...todoItems.value, ...syncedItems.value]
    if (!allItems.some(i => i.id === itemId)) return
    dragItemId.value = itemId
    dragStartX = e.clientX
    dragStartY = e.clientY
    dragX.value = e.clientX
    dragY.value = e.clientY
    isDragging.value = false
    dragActive = false

    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - dragStartX
      const dy = ev.clientY - dragStartY
      if (!isDragging.value && Math.abs(dx) + Math.abs(dy) > 5) {
        isDragging.value = true
        dragActive = true
      }
      if (!isDragging.value) return
      dragX.value = ev.clientX
      dragY.value = ev.clientY
      dragOverKey.value = null
      dragOverIndex.value = -1
      const quadrants = document.querySelectorAll("[data-quadrant]")
      for (const q of quadrants) {
        const rect = q.getBoundingClientRect()
        if (ev.clientX >= rect.left && ev.clientX <= rect.right && ev.clientY >= rect.top && ev.clientY <= rect.bottom) {
          dragOverKey.value = q.getAttribute("data-quadrant")
          const cards = q.querySelectorAll("[data-card-id]")
          let insertIdx = cards.length
          for (let i = 0; i < cards.length; i++) {
            const cardRect = cards[i].getBoundingClientRect()
            if (ev.clientY < cardRect.top + cardRect.height / 2) {
              insertIdx = i
              break
            }
          }
          dragOverIndex.value = Math.min(insertIdx, cards.length)
          break
        }
      }
    }

    const onUp = async () => {
      document.removeEventListener("mousemove", onMove)
      document.removeEventListener("mouseup", onUp)
      const itemId = dragItemId.value
      const wasDragging = isDragging.value
      if (wasDragging && itemId !== null && dragOverKey.value !== null) {
        const item = [...todoItems.value, ...syncedItems.value].find(i => i.id === itemId)
        if (item && item.priority !== dragOverKey.value) {
          await updateItem(item.id, {
            name: item.name,
            description: item.description,
            startDate: item.startDate,
            endDate: item.endDate,
            priority: dragOverKey.value,
          })
          showToast("优先级已更新", "success")
        }
      }
      dragItemId.value = null
      dragOverKey.value = null
      dragOverIndex.value = -1
      isDragging.value = false
      // 清除拖拽标志（延迟确保 click 事件能读取到）
      setTimeout(() => { dragActive = false }, 0)
    }

    document.addEventListener("mousemove", onMove)
    document.addEventListener("mouseup", onUp)
  }

  return {
    dragItemId, dragOverKey, dragOverIndex,
    isDragging, dragX, dragY, dragItemName,
    onMouseDown, dragActive: () => dragActive,
  }
}