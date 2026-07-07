import { invoke } from "@tauri-apps/api/core"
import { showToast } from "@/store/toast"

export interface DataStore {
  read<T>(path: string): Promise<T | null>
  write(path: string, data: unknown): Promise<void>
}

export class TauriDataStore implements DataStore {
  // 防抖写入：高频操作合并为一次写入
  private writeTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private pendingData = new Map<string, unknown>()
  private writeInProgress = new Set<string>()
  private readonly DEBOUNCE_DELAY = 300 // ms

  async read<T>(path: string): Promise<T | null> {
    try {
      const content = await invoke<string>("read_data_file", { path })
      return JSON.parse(content) as T
    } catch {
      return null
    }
  }

  async write(path: string, data: unknown): Promise<void> {
    // 保存最新数据到待写队列
    this.pendingData.set(path, data)

    // 如果已经有写入中的请求，只需更新待写数据，等待当前写入完成后再处理
    if (this.writeInProgress.has(path)) {
      this.scheduleWrite(path)
      return
    }

    // 取消之前的定时器
    this.cancelWrite(path)

    // 安排一次防抖写入
    this.scheduleWrite(path)
  }

  private scheduleWrite(path: string): void {
    if (this.writeTimers.has(path)) {
      clearTimeout(this.writeTimers.get(path)!)
    }

    this.writeTimers.set(path, setTimeout(async () => {
      this.writeTimers.delete(path)
      await this.flushWrite(path)
    }, this.DEBOUNCE_DELAY))
  }

  private cancelWrite(path: string): void {
    const timer = this.writeTimers.get(path)
    if (timer !== undefined) {
      clearTimeout(timer)
      this.writeTimers.delete(path)
    }
  }

  private async flushWrite(path: string): Promise<void> {
    const data = this.pendingData.get(path)
    if (data === undefined) return

    this.writeInProgress.add(path)

    try {
      await invoke("write_data_file", { path, content: JSON.stringify(data) })
      // 写入成功后删除待写数据
      this.pendingData.delete(path)
    } catch (e) {
      console.error("保存失败:", e)
      showToast("保存失败，请检查存储空间", "error")
    } finally {
      this.writeInProgress.delete(path)
      // 写入期间如果有新的待写数据，继续写入
      if (this.pendingData.has(path)) {
        this.scheduleWrite(path)
      }
    }
  }

  /** 立即强制写入指定路径（用于关闭/切换页面前的最终保存） */
  async flush(path: string): Promise<void> {
    this.cancelWrite(path)
    await this.flushWrite(path)
  }

  /** 立即强制写入所有待写数据 */
  async flushAll(): Promise<void> {
    const paths = Array.from(this.pendingData.keys())
    // 清除所有定时器
    for (const path of paths) {
      this.cancelWrite(path)
    }
    // 依次写入
    for (const path of paths) {
      await this.flushWrite(path)
    }
  }
}

export const dataStore = new TauriDataStore()