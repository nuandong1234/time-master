<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from "vue"

export interface Comment {
  id: number
  author: string
  content: string
  timestamp: string
  images?: string[]
}

const props = defineProps<{
  comments: Comment[]
  readonly?: boolean
}>()

const emit = defineEmits<{
  submit: [content: string, images?: string[]]
}>()

// ====== 时间格式化 ======

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  timer = setInterval(() => {
    now.value = Date.now()
  }, 60000)
})

onUnmounted(() => {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
})

function formatTimeAgo(ts: string): string {
  const diff = now.value - new Date(ts).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return "刚刚"
  if (mins < 60) return `${mins}分钟前`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}小时前`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}天前`
  const date = new Date(ts)
  const currentYear = new Date().getFullYear()
  const isThisYear = date.getFullYear() === currentYear
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  if (isThisYear) return `${month}-${day}`
  return `${date.getFullYear()}-${month}-${day}`
}

// ====== 输入状态 ======

const commentText = ref("")
const pendingImages = ref<string[]>([])
const fileInputRef = ref<HTMLInputElement | null>(null)

// ====== 图片预览 ======

const previewImage = ref<string | null>(null)
const previewOverlayRef = ref<HTMLDivElement | null>(null)
const previewScale = ref(1)

watch(previewImage, (val) => {
  if (val) {
    previewScale.value = 1
    nextTick(() => {
      previewOverlayRef.value?.focus()
    })
  }
})

function handlePreviewWheel(e: WheelEvent) {
  e.preventDefault()
  const delta = e.deltaY > 0 ? -0.1 : 0.1
  previewScale.value = Math.max(0.5, Math.min(3, previewScale.value + delta))
}

// ====== 分页 ======

const visibleLogCount = ref(3)

const sortedComments = computed(() => {
  return [...props.comments].sort((a, b) => {
    const c = b.timestamp.localeCompare(a.timestamp)
    if (c !== 0) return c
    return b.id - a.id
  })
})

const displayComments = computed(() => {
  return sortedComments.value.slice(0, visibleLogCount.value)
})

const hasMore = computed(() => {
  return visibleLogCount.value < sortedComments.value.length
})

function loadMore() {
  visibleLogCount.value += 5
}

// ====== 发送评论 ======

function sendComment() {
  const text = commentText.value.trim()
  if (!text && pendingImages.value.length === 0) return
  emit("submit", text, pendingImages.value.length > 0 ? [...pendingImages.value] : undefined)
  commentText.value = ""
  pendingImages.value = []
}

function handleCommentKeydown(e: KeyboardEvent) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault()
    sendComment()
  }
}

// ====== 图片粘贴 ======

function handleCommentPaste(e: ClipboardEvent) {
  const items = e.clipboardData?.items
  if (!items) return
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.type.startsWith("image/")) {
      e.preventDefault()
      const file = item.getAsFile()
      if (!file) continue
      const reader = new FileReader()
      reader.onload = () => {
        const dataUrl = reader.result as string
        pendingImages.value.push(dataUrl)
      }
      reader.readAsDataURL(file)
      break
    }
  }
}

// ====== 图片上传 ======

function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement
  const files = input.files
  if (!files) return
  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    if (!file.type.startsWith("image/")) continue
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      pendingImages.value.push(dataUrl)
    }
    reader.readAsDataURL(file)
  }
  input.value = ""
}

function removePendingImage(idx: number) {
  pendingImages.value.splice(idx, 1)
}
</script>

<template>
  <div>
    <!-- 评论头部 -->
    <div class="flex items-center justify-between mb-3">
      <div class="flex items-center gap-1.5 text-sm text-muted-foreground">
        <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
        </svg>
        <span>{{ sortedComments.length }} 条评论</span>
      </div>
    </div>

    <!-- 评论输入（只读模式隐藏） -->
    <div v-if="!readonly" class="mb-4">
      <!-- 待上传图片预览 -->
      <div v-if="pendingImages.length > 0" class="flex flex-wrap gap-2 mb-2">
        <div v-for="(img, idx) in pendingImages" :key="idx" class="relative group">
          <img :src="img" class="w-16 h-16 object-cover rounded-lg border border-border cursor-pointer" @click="previewImage = img" />
          <button class="absolute -top-1.5 -right-1.5 size-4 bg-red-500 text-white rounded-full text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer" @click.stop="removePendingImage(idx)">×</button>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <div class="flex-1 relative">
          <input
            v-model="commentText"
            class="w-full text-sm bg-muted border border-border rounded-lg px-3 py-2 pr-14 outline-none focus:border-cyan-400 focus:bg-card transition-colors"
            placeholder="请输入评论..."
            @keydown="handleCommentKeydown"
            @paste="handleCommentPaste"
          />
          <button
            class="absolute right-2 top-1/2 -translate-y-1/2 size-7 rounded flex items-center justify-center text-muted-foreground hover:text-card-foreground cursor-pointer transition-colors"
            title="上传图片"
            @click.stop="fileInputRef?.click()"
          >
            <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21Zm16.5-13.5h.008v.008h-.008V7.5Z" />
            </svg>
          </button>
          <input ref="fileInputRef" type="file" accept="image/*" multiple class="hidden" @change="handleFileSelect" />
        </div>
        <button
          class="shrink-0 px-3 py-1.5 rounded-md bg-cyan-500 text-white text-sm flex items-center gap-1 hover:bg-cyan-600 cursor-pointer transition-colors"
          title="发送评论"
          @click="sendComment"
        >
          <svg class="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M6 12 3 6l3 6M6 12l3 6 3-6M18 6 6 18"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- 评论列表 -->
    <div v-if="displayComments.length > 0" class="space-y-4">
      <div
        v-for="entry in displayComments"
        :key="entry.id"
        class="flex items-start gap-2.5"
      >
        <span class="size-7 rounded-full text-xs font-semibold flex items-center justify-center shrink-0 mt-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">💬</span>
        <div class="flex-1 min-w-0">
          <div class="text-[13px] leading-relaxed">
            <span class="font-medium text-card-foreground">{{ entry.author }}</span>
            <span class="text-muted-foreground mx-0.5">于</span>
            <span class="text-muted-foreground">{{ entry.timestamp.replace("T", " ").slice(0, 16) }}</span>
            <span class="text-muted-foreground ml-1">评论了</span>
            <span class="font-medium text-card-foreground ml-1 break-words">{{ entry.content }}</span>
          </div>
          <div v-if="entry.images && entry.images.length > 0" class="flex flex-wrap gap-2 mt-2">
            <img
              v-for="(img, imgIdx) in entry.images"
              :key="imgIdx"
              :src="img"
              class="max-w-[200px] max-h-[150px] rounded-lg border border-border cursor-pointer object-cover"
              @click="previewImage = img"
            />
          </div>
          <div class="text-[10px] text-muted-foreground mt-0.5">{{ formatTimeAgo(entry.timestamp) }}<span class="opacity-0">{{ now }}</span></div>
        </div>
      </div>
      <button
        v-if="hasMore"
        class="w-full text-xs text-cyan-500 cursor-pointer hover:text-cyan-600 transition-colors py-2 flex items-center justify-center gap-0.5"
        @click="loadMore"
      >
        查看更多 <span>▼</span>
      </button>
    </div>
  </div>

  <!-- 大图预览遮罩 -->
  <Teleport to="body">
    <div
      v-if="previewImage"
      ref="previewOverlayRef"
      tabindex="-1"
      class="fixed inset-0 z-[200] bg-black/70 flex items-center justify-center outline-none"
      @click="previewImage = null"
      @keydown.escape="previewImage = null"
      @wheel="handlePreviewWheel"
    >
      <img
        :src="previewImage"
        class="max-w-[90vw] max-h-[90vh] rounded-lg shadow-2xl transition-transform duration-150 ease-out"
        :style="{ transform: `scale(${previewScale})` }"
        @click.stop
        @wheel.stop="handlePreviewWheel"
      />
      <div class="absolute bottom-4 left-1/2 -translate-x-1/2 text-white/60 text-xs bg-black/40 px-2.5 py-1 rounded-full pointer-events-none select-none">
        {{ Math.round(previewScale * 100) }}%
      </div>
      <button
        class="absolute top-4 right-4 size-8 bg-white/20 text-white rounded-full text-lg flex items-center justify-center cursor-pointer hover:bg-white/40 transition-colors"
        @click="previewImage = null"
      >×</button>
    </div>
  </Teleport>
</template>