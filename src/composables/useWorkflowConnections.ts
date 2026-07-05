import { ref, type Ref } from "vue"

export interface SvgPathDef {
  d: string
}

const LINE_COLOR = "#d5d5d5"
const LINE_WIDTH = 1.5

function getRelativePos(el: HTMLElement, wrapper: HTMLElement) {
  const wr = wrapper.getBoundingClientRect()
  const er = el.getBoundingClientRect()
  return { l: er.left - wr.left, t: er.top - wr.top, w: er.width, h: er.height }
}

export function useWorkflowConnections(flowWrapperRef: Ref<HTMLElement | null>) {
  const connectionPaths = ref<SvgPathDef[]>([])
  const svgDims = ref({ w: 0, h: 0 })

  function updateConnections() {
    const wrapper = flowWrapperRef.value
    if (!wrapper) return

    const startEl = wrapper.querySelector<HTMLElement>("[data-flow-start]")
    const endEl = wrapper.querySelector<HTMLElement>("[data-flow-end]")
    const stepEls = wrapper.querySelectorAll<HTMLElement>("[data-flow-step]")
    const contentEls = wrapper.querySelectorAll<HTMLElement>("[data-flow-start], [data-flow-end], [data-node-idx]")
    const bounds = Array.from(contentEls).reduce(
      (acc, el) => {
        const pos = getRelativePos(el, wrapper)
        acc.right = Math.max(acc.right, pos.l + pos.w)
        acc.bottom = Math.max(acc.bottom, pos.t + pos.h)
        return acc
      },
      { right: 0, bottom: 0 },
    )
    const wr = wrapper.getBoundingClientRect()
    svgDims.value = { w: Math.max(bounds.right + 24, wr.width), h: Math.max(bounds.bottom + 24, wr.height) }
    if (!startEl || !endEl || !stepEls.length) { connectionPaths.value = []; return }

    // 收集每步节点信息
    const stepNodeEls: { el: HTMLElement; idx: number }[][] = []
    stepEls.forEach((se) => {
      const nodes: { el: HTMLElement; idx: number }[] = []
      const cards = se.querySelectorAll<HTMLElement>("[data-node-idx]")
      cards.forEach((c) => {
        const ni = parseInt(c.getAttribute("data-node-idx") || "0")
        nodes.push({ el: c, idx: ni })
      })
      stepNodeEls.push(nodes)
    })

    if (!stepNodeEls.length) { connectionPaths.value = []; return }

    const paths: string[] = []

    const MIN_VERTICAL = 12

    // 1. Start → Step-0 节点（工字型居中）
    const sp = getRelativePos(startEl, wrapper)
    const sx = sp.l + sp.w / 2, sy = sp.t + sp.h
    const firstNodes = stepNodeEls[0]
    {
      const firstTops = firstNodes.map(n => { const p = getRelativePos(n.el, wrapper); return p.t })
      const firstCXs = firstNodes.map(n => { const p = getRelativePos(n.el, wrapper); return p.l + p.w / 2 })
      const firstTop = Math.min(...firstTops)
      const rawMidY = (sy + firstTop) / 2
      const midY = Math.min(Math.max(rawMidY, sy + MIN_VERTICAL), firstTop - MIN_VERTICAL)
      const xMin = Math.min(...firstCXs)
      const xMax = Math.max(...firstCXs)
      const centerX = (xMin + xMax) / 2

      paths.push(`M ${sx} ${sy} L ${sx} ${midY} L ${centerX} ${midY}`)
      paths.push(`M ${xMin} ${midY} L ${xMax} ${midY}`)
      for (const n of firstNodes) {
        const np = getRelativePos(n.el, wrapper)
        const cx = np.l + np.w / 2
        paths.push(`M ${cx} ${midY} L ${cx} ${np.t}`)
      }
    }

    // 2. 步骤 i → 步骤 i+1
    for (let si = 0; si < stepNodeEls.length - 1; si++) {
      const above = stepNodeEls[si]
      const below = stepNodeEls[si + 1]
      if (!above.length || !below.length) continue

      const aboveBottoms = above.map(n => { const p = getRelativePos(n.el, wrapper); return p.t + p.h })
      const belowTops = below.map(n => { const p = getRelativePos(n.el, wrapper); return p.t })
      const gap = Math.min(...belowTops) - Math.max(...aboveBottoms)

      if (above.length === 1 && below.length === 1) {
        const ap = getRelativePos(above[0].el, wrapper)
        const bp = getRelativePos(below[0].el, wrapper)
        const cx1 = ap.l + ap.w / 2, cy1 = ap.t + ap.h
        const cx2 = bp.l + bp.w / 2, cy2 = bp.t
        paths.push(`M ${cx1} ${cy1} L ${cx2} ${cy2}`)
        continue
      }

      const aboveCXs = above.map(n => { const p = getRelativePos(n.el, wrapper); return p.l + p.w / 2 })
      const belowCXs = below.map(n => { const p = getRelativePos(n.el, wrapper); return p.l + p.w / 2 })

      const aboveMidY = Math.max(...aboveBottoms) + gap / 3
      const belowMidY = Math.min(...belowTops) - gap / 3

      const aboveXMin = Math.min(...aboveCXs)
      const aboveXMax = Math.max(...aboveCXs)

      const belowXMin = Math.min(...belowCXs)
      const belowXMax = Math.max(...belowCXs)

      const allXMin = Math.min(aboveXMin, belowXMin)
      const allXMax = Math.max(aboveXMax, belowXMax)
      const lineCenterX = (allXMin + allXMax) / 2

      if (above.length > 1) {
        paths.push(`M ${aboveXMin} ${aboveMidY} L ${aboveXMax} ${aboveMidY}`)
      }
      for (const n of above) {
        const np = getRelativePos(n.el, wrapper)
        const cx = np.l + np.w / 2
        paths.push(`M ${cx} ${np.t + np.h} L ${cx} ${aboveMidY}`)
      }

      if (below.length > 1) {
        paths.push(`M ${belowXMin} ${belowMidY} L ${belowXMax} ${belowMidY}`)
      }
      for (const n of below) {
        const np = getRelativePos(n.el, wrapper)
        const cx = np.l + np.w / 2
        paths.push(`M ${cx} ${belowMidY} L ${cx} ${np.t}`)
      }

      paths.push(`M ${lineCenterX} ${aboveMidY} L ${lineCenterX} ${belowMidY}`)
    }

    // 3. 最后一步 → End（工字型居中）
    const lastNodes = stepNodeEls[stepNodeEls.length - 1]
    const ep = getRelativePos(endEl, wrapper)
    const ex = ep.l + ep.w / 2, ey = ep.t
    if (lastNodes.length === 1) {
      const np = getRelativePos(lastNodes[0].el, wrapper)
      const cx = np.l + np.w / 2, cy = np.t + np.h
      const rawMidY = (cy + ey) / 2
      const midY = Math.min(Math.max(rawMidY, cy + MIN_VERTICAL), ey - MIN_VERTICAL)
      const centerX = (cx + ex) / 2
      paths.push(`M ${cx} ${cy} L ${cx} ${midY} L ${centerX} ${midY} L ${ex} ${midY} L ${ex} ${ey}`)
    } else {
      const lastBottoms = lastNodes.map(n => { const p = getRelativePos(n.el, wrapper); return p.t + p.h })
      const maxBottom = Math.max(...lastBottoms)
      const rawMidY = (maxBottom + ey) / 2
      const midY = Math.min(Math.max(rawMidY, maxBottom + MIN_VERTICAL), ey - MIN_VERTICAL)
      const lastCXs = lastNodes.map(n => { const p = getRelativePos(n.el, wrapper); return p.l + p.w / 2 })
      const xMin = Math.min(...lastCXs)
      const xMax = Math.max(...lastCXs)
      const centerX = (xMin + xMax) / 2

      for (const n of lastNodes) {
        const np = getRelativePos(n.el, wrapper)
        const cx = np.l + np.w / 2
        paths.push(`M ${cx} ${np.t + np.h} L ${cx} ${midY}`)
      }
      paths.push(`M ${xMin} ${midY} L ${xMax} ${midY}`)
      paths.push(`M ${centerX} ${midY} L ${ex} ${midY} L ${ex} ${ey}`)
    }

    connectionPaths.value = paths.map(d => ({ d }))
  }

  function syncWrapperWidth() {
    // 不再需要 — 对齐由 CSS margin:auto 原生处理
  }

  /** nextTick + 双层 requestAnimationFrame 确保布局完成后同步宽度 */
  function drawAfterLayout() {
    connectionPaths.value = []
    svgDims.value = { w: 0, h: 0 }
    // Need nextTick - imported from vue by caller or we handle it
    // The caller's component will call this and handle nextTick
    requestAnimationFrame(() => requestAnimationFrame(() => {
      syncWrapperWidth()
      updateConnections()
    }))
  }

  return {
    connectionPaths,
    svgDims,
    LINE_COLOR,
    LINE_WIDTH,
    updateConnections,
    syncWrapperWidth,
    drawAfterLayout,
  }
}