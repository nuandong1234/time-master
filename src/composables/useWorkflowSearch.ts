import { ref } from "vue"

export function useWorkflowSearch() {
  const searchQuery = ref("")

  /** 模糊匹配：检查 text 中是否有 query 的所有字符（按顺序） */
  function fuzzyMatch(text: string, query: string): boolean {
    let qi = 0
    for (let ti = 0; ti < text.length && qi < query.length; ti++) {
      if (text[ti] === query[qi]) qi++
    }
    return qi === query.length
  }

  return {
    searchQuery,
    fuzzyMatch,
  }
}