import { invoke } from "@tauri-apps/api/core"

/** 全量数据加载结果 */
export interface AllData {
  items: any
  workflow: any
  settings: any
  pomodoro: any
}

export interface DataStore {
  initDatabase(): Promise<AllData>
  saveItems(data: unknown): Promise<void>
  saveWorkflow(data: unknown): Promise<void>
  saveSettings(data: unknown): Promise<void>
  savePomodoro(data: unknown): Promise<void>
}

export class SqliteDataStore implements DataStore {
  async initDatabase(): Promise<AllData> {
    try {
      const result = await invoke<AllData>("init_database")
      return {
        items: result.items || null,
        workflow: result.workflow || null,
        settings: result.settings || null,
        pomodoro: result.pomodoro || null,
      }
    } catch (e) {
      console.error('[data-store] 初始化数据库失败', e)
      throw e
    }
  }

  async saveItems(data: unknown): Promise<void> {
    try {
      await invoke("save_items_data", { itemsJson: JSON.stringify(data) })
    } catch (e) {
      console.error('[data-store] 保存事项失败', e)
      throw e
    }
  }

  async saveWorkflow(data: unknown): Promise<void> {
    try {
      await invoke("save_workflow_data", { workflowJson: JSON.stringify(data) })
    } catch (e) {
      console.error('[data-store] 保存工作流失败', e)
      throw e
    }
  }

  async saveSettings(data: unknown): Promise<void> {
    try {
      await invoke("save_settings_data", { settingsJson: JSON.stringify(data) })
    } catch (e) {
      console.error('[data-store] 保存设置失败', e)
      throw e
    }
  }

  async savePomodoro(data: unknown): Promise<void> {
    try {
      await invoke("save_pomodoro_data", { pomodoroJson: JSON.stringify(data) })
    } catch (e) {
      console.error('[data-store] 保存番茄钟数据失败', e)
      throw e
    }
  }
}

export const dataStore = new SqliteDataStore()