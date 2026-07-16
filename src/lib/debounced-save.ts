/**
 * 防抖保存工具
 *
 * 连续操作时只在"停稳"后才执行真实写入。
 * 关闭窗口前会自动刷出所有待写入数据。
 */

type SaveFn = () => Promise<void>

const pending = new Map<string, { timer: ReturnType<typeof setTimeout>; saveFn: SaveFn }>()
const WAIT_MS = 1_000

/**
 * 创建一个防抖保存函数。
 * 连续调用时只会执行最后一次，间隔需大于 WAIT_MS。
 *
 * @param key  唯一标识（每个 store 各自独立）
 * @param save 真实的写入函数
 * @returns    包装后的防抖函数，返回 Promise 在写入完成后 resolve
 */
export function createDebouncedSave(key: string, save: SaveFn): SaveFn {
  return () => {
    return new Promise<void>((resolve, reject) => {
      const existing = pending.get(key)
      if (existing) {
        clearTimeout(existing.timer)
      }

      const timer = setTimeout(async () => {
        pending.delete(key)
        try {
          await save()
          resolve()
        } catch (e) {
          reject(e)
        }
      }, WAIT_MS)

      pending.set(key, { timer, saveFn: save })
    })
  }
}

/**
 * 立即刷出所有待写入数据（用于关闭窗口前）。
 */
export async function flushAll(): Promise<void> {
  const entries = Array.from(pending.entries())
  if (entries.length === 0) return

  const tasks = entries.map(async ([key, { timer, saveFn }]) => {
    clearTimeout(timer)
    pending.delete(key)
    await saveFn()
  })

  await Promise.all(tasks)
}