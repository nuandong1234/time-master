import { invoke } from "@tauri-apps/api/core"
import { showToast } from "@/store/toast"

export interface DataStore {
  read<T>(path: string): Promise<T | null>
  write(path: string, data: unknown): Promise<void>
}

export class TauriDataStore implements DataStore {
  async read<T>(path: string): Promise<T | null> {
    try {
      const content = await invoke<string>("read_data_file", { path })
      return JSON.parse(content) as T
    } catch {
      return null
    }
  }

  async write(path: string, data: unknown): Promise<void> {
    try {
      await invoke("write_data_file", { path, content: JSON.stringify(data) })
    } catch (e) {
      console.error("保存失败:", e)
      showToast("保存失败，请检查存储空间", "error")
    }
  }
}

export const dataStore = new TauriDataStore()