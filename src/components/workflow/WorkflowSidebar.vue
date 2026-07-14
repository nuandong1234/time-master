<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue"
import { useWorkflow, DONE_CATEGORY_ID, type WorkflowProject, type WorkflowStep, type WorkflowNode } from "@/store/workflow"
import { showToast } from "@/store/toast"
import { useWorkflowSearch } from "@/composables/useWorkflowSearch"

const emit = defineEmits<{
  'select-project': [id: number]
}>()

const {
  categories, projects,
  selectedProjectId, selectedProject,
  renameProject,
  addCategory, addProjectToCategory, renameCategory, removeCategory, deleteProject,
  copyProject,
  moveProjectToCategory,
} = useWorkflow()

const {
  searchQuery,
  fuzzyMatch,
} = useWorkflowSearch()

const collapsedCats = ref<Set<number>>(new Set())
const contextMenu = ref<{ x: number; y: number; catId?: number; catName?: string; projectId?: number; projectName?: string } | null>(null)
const renamingCatId = ref(0)
const renamingBusy = ref(false)
const renamingProjectId = ref(0)
const renamingProjectBusy = ref(false)
const pendingRenameProjectId = ref(0)
const pendingRenameCatId = ref(0)
const moveToSubmenuProjectId = ref(0)
let searchSnapshot: Set<number> | null = null

const sortedCategories = computed(() => {
  return [...categories.value].sort((a, b) => {
    if (a.id === DONE_CATEGORY_ID) return 1
    if (b.id === DONE_CATEGORY_ID) return -1
    const c = a.createdAt.localeCompare(b.createdAt)
    if (c !== 0) return c
    return a.id - b.id
  })
})

const targetCategoriesForMove = computed(() => {
  if (!contextMenu.value?.projectId) return []
  const project = projects.value.find(p => p.id === contextMenu.value!.projectId)
  if (!project) return []
  if (isProjectCompleted(project)) return []
  return categories.value.filter(c => c.id !== project.categoryId && c.id !== DONE_CATEGORY_ID)
})


function closeContextMenu() {
  contextMenu.value = null
}

function handleCtxMenu(e: MouseEvent, catId: number, catName: string) {
  if (catId === DONE_CATEGORY_ID) return
  e.preventDefault()
  e.stopPropagation()
  contextMenu.value = { x: e.clientX, y: e.clientY, catId, catName }
}

function handleProjectCtxMenu(e: MouseEvent, pid: number, pname: string) {
  e.preventDefault()
  e.stopPropagation()
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
  pendingRenameProjectId.value = pid
}

function doDeleteProject(pid: number) {
  deleteProject(pid)
  closeContextMenu()
}

function isProjectCompleted(project: WorkflowProject) {
  return project.steps.length > 0 && project.steps.every(
    (s: WorkflowStep) => s.nodes.length > 0 && s.nodes.every((n: WorkflowNode) => n.status === "done")
  )
}

async function handleMoveProject(projectId: number, targetCatId: number) {
  const project = projects.value.find(p => p.id === projectId)
  if (project && isProjectCompleted(project)) {
    showToast('已完成项目不可移动')
    closeContextMenu()
    return
  }
  await moveProjectToCategory(projectId, targetCatId)
  moveToSubmenuProjectId.value = 0
  closeContextMenu()

  const targetCat = categories.value.find(c => c.id === targetCatId)
  if (targetCat && collapsedCats.value.has(targetCat.id)) {
    const newSet = new Set(collapsedCats.value)
    newSet.delete(targetCat.id)
    collapsedCats.value = newSet
  }
}

async function doNewProject(catId: number) {
  await addProjectToCategory(catId)
  if (collapsedCats.value.has(catId)) {
    collapsedCats.value.delete(catId)
    collapsedCats.value = new Set(collapsedCats.value)
  }
  closeContextMenu()

  // 新建后自动弹出重命名
  const newId = selectedProjectId.value
  if (newId) {
    pendingRenameProjectId.value = newId
  }
}

async function handleAddCategory() {
  try {
    await addCategory()
  } catch (e) {
    showToast("新建目录失败: " + String(e), "error")
    return
  }
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
  if (renamingCatId.value === 0) return
  renamingBusy.value = true
  try {
    const ok = await renameCategory(catId, el.value)
    if (ok) {
      renamingCatId.value = 0
      await nextTick()
    } else {
      el.focus()
      el.select()
    }
  } catch (e) {
    console.error('重命名目录失败', e)
    renamingCatId.value = 0
  }
  renamingBusy.value = false
}

async function doRenameProject(pid: number, el: HTMLInputElement) {
  if (renamingProjectBusy.value) return
  if (renamingProjectId.value === 0) return
  renamingProjectBusy.value = true
  try {
    const ok = await renameProject(pid, el.value)
    if (ok) {
      renamingProjectId.value = 0
      await nextTick()
    } else {
      el.focus()
      el.select()
    }
  } catch (e) {
    console.error('重命名项目失败', e)
    renamingProjectId.value = 0
  }
  renamingProjectBusy.value = false
}

function toggleCat(id: number) {
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

function dotColorByProject(p: WorkflowProject) {
  const allDone = p.steps.length > 0 && p.steps.every((s: WorkflowStep) => s.nodes.length > 0 && s.nodes.every((n: WorkflowNode) => n.status === "done"))
  if (allDone) return "bg-green-500"
  const hasActive = p.steps.some((s: WorkflowStep) => s.nodes.some((n: WorkflowNode) => n.status === "active"))
  if (hasActive) return "bg-amber-500"
  return "bg-gray-300 dark:bg-gray-600"
}

function getProjectsByCategory(catId: number) {
  const cat = categories.value.find(c => c.id === catId)
  if (!cat) return []
  let projs = cat.projectIds.map(id => getProjectById(id)).filter(Boolean) as NonNullable<ReturnType<typeof getProjectById>>[]
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    projs = projs.filter(p => fuzzyMatch(p.name.toLowerCase(), q))
  }
  if (catId === DONE_CATEGORY_ID) {
    projs.sort((a, b) => {
      const ta = a.completedAt || a.createdAt
      const tb = b.completedAt || b.createdAt
      return tb.localeCompare(ta)
    })
    return projs
  }
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

function handleSelectProject(id: number) {
  searchQuery.value = ""
  emit('select-project', id)
}

// 搜索前保存 collapsedCats 快照，清空时恢复
watch(searchQuery, (q) => {
  if (q) {
    if (searchSnapshot === null) {
      searchSnapshot = new Set(collapsedCats.value)
    }
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
    if (searchSnapshot !== null) {
      collapsedCats.value = searchSnapshot
      searchSnapshot = null
    }
  }
})

// 选中项目如果属于「已完成」目录，自动展开该目录
watch(() => selectedProject.value?.categoryId, (catId) => {
  if (catId === DONE_CATEGORY_ID && collapsedCats.value.has(DONE_CATEGORY_ID)) {
    const newSet = new Set(collapsedCats.value)
    newSet.delete(DONE_CATEGORY_ID)
    collapsedCats.value = newSet
  }
})

onMounted(() => {
  // collapsedCats 初始化使用 watch categories（等 initWorkflow 完成后再初始化）
  document.addEventListener("click", closeContextMenu)
})

// 等 categories 加载完成后初始化折叠状态（watch 不依赖生命周期顺序）
watch(categories, (cats) => {
  if (cats.length > 0 && collapsedCats.value.size === 0) {
    if (selectedProjectId.value && selectedProject.value) {
      const catId = selectedProject.value.categoryId
      collapsedCats.value = new Set(cats.map(c => c.id).filter(cid => cid !== catId))
    } else {
      collapsedCats.value = new Set(cats.map(c => c.id))
    }
  }
}, { once: true })

onUnmounted(() => {
  document.removeEventListener("click", closeContextMenu)
})
</script>

<template>
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
      <div class="flex items-center gap-2 mx-3 mb-1 bg-card border border-border rounded-lg px-3 py-1.5">
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
                @keydown.enter="(e) => (e.target as HTMLInputElement).blur()"
                @keydown.escape="renamingCatId = 0"
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
                @keydown.enter="(e) => (e.target as HTMLInputElement).blur()"
                @keydown.escape="renamingProjectId = 0"
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

    <!-- Context menu -->
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
        <button
          class="w-full text-left px-3 py-1.5 text-sm text-card-foreground hover:bg-muted cursor-pointer"
          @click="copyProject(contextMenu!.projectId!); closeContextMenu()"
        >复制项目</button>
        <!-- 移动到子菜单 -->
        <div
          v-if="contextMenu.projectId && !isProjectCompleted(projects.find(p => p.id === contextMenu!.projectId)!)"
          class="relative"
          @mouseenter="moveToSubmenuProjectId = contextMenu.projectId"
          @mouseleave="moveToSubmenuProjectId = 0"
        >
          <button
            class="w-full text-left px-3 py-1.5 text-sm text-card-foreground hover:bg-muted cursor-pointer flex items-center justify-between gap-2"
          >
            <span>移动到</span>
            <svg class="size-3 text-sidebar-foreground/40" viewBox="0 0 10 10" fill="currentColor">
              <path d="M3,1 L7,5 L3,9" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </button>
          <div
            v-if="moveToSubmenuProjectId === contextMenu.projectId"
            class="absolute left-full top-0 z-50 bg-card border border-border rounded-lg shadow-lg py-1 min-w-[120px] max-h-[300px] overflow-y-auto"
          >
            <button
              v-for="cat in targetCategoriesForMove"
              :key="cat.id"
              class="w-full text-left px-3 py-1.5 text-sm text-card-foreground hover:bg-muted cursor-pointer truncate"
              @click="handleMoveProject(contextMenu!.projectId!, cat.id)"
            >
              {{ cat.name }}
              <span v-if="cat.id === DONE_CATEGORY_ID" class="text-[11px] text-muted-foreground ml-1">(已完成)</span>
            </button>
            <div v-if="targetCategoriesForMove.length === 0" class="px-3 py-2 text-xs text-muted-foreground italic">没有其他目录</div>
          </div>
        </div>
        <div class="border-t border-border my-1"></div>
        <button
          class="w-full text-left px-3 py-1.5 text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 cursor-pointer"
          @click="doDeleteProject(contextMenu!.projectId!)"
        >删除项目</button>
      </template>
    </div>
  </aside>
</template>