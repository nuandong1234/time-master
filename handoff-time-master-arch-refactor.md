# Handoff: Time Master — 架构重构

> 生成时间: 2026-07-10
> 仓库: `G:\time-master`
> 技术栈: Tauri 2 + Vue 3 + TypeScript + Tailwind

---

## 当前进展

### 已完成的架构分析

通过 `/improve-codebase-architecture` 技能识别出 5 个候选优化点，已生成 HTML 报告：
`C:\Users\Administrator\AppData\Local\Temp\architecture-review-20260710.html`

候选清单：

| # | 候选 | 强度 | 状态 |
|:-|------|:----:|:----:|
| 1 | 提取 WorkflowView 操作逻辑为深度模块 | Strong | ✅ **已完成** |
| 2 | 统一 NodeDetailPanel 与 ItemDetailPanel | Strong | ⏳ **待开始** |
| 3 | 形式化跨 Store 同步接缝 | Worth | 待定 |
| 4 | 写入协调层——事务性持久化 | Worth | 待定 |
| 5 | 提取公共评论组件 | Speculative | 并入候选 2 |

### 候选 1 已完成

创建了两个 composable 并重构了 WorkflowView.vue：

**新建文件：**

- `src/composables/useWorkflowOperations.ts` (169行)
  - 编排层 composable，负责节点/步骤操作 + 选中状态 + 滚动定位 + 副效应
  - 接口：`addNode()` / `addStep()` / `deleteNode()` / `startFlow()` / `completeNode()` / `completeCurrentNode()` / `deselectNode()` / `selectProject()` / `scrollToCurrentStep()` / `scrollToSelectedNode()` / `doLayoutAndScroll()`
  - 返回状态 ref：`selectedNode` / `startReady` / `justActivated` / `activeNodePosition` / `detailPanelNode` / `bottomNodeInfo`

- `src/composables/useWorkflowKeyboard.ts` (42行)
  - 快捷键模块，只负责键盘映射，不包含操作逻辑
  - 依赖 `useWorkflowOperations` 提供的操作函数
  - 接口：`handleKeydown()` / `handleTabBlock()`

**修改文件：**

- `src/pages/WorkflowView.vue` — 删除了 ~220 行内联操作逻辑，降为薄协调层（~1050 行）

**验证：** `vue-tsc --noEmit` 通过（仅 tsconfig deprecation warning），`vite build` 成功。

### 候选 2 已设计但未实现

通过 grilling 技能确认了方案：**先提取 CommentSection 公共评论组件**，而非直接一步到位提取 BaseDetailPanel（因为两个面板的容器结构和 emit 模式差异太大）。

## 待完成的工作

### 候选 2：提取 CommentSection

从 `NodeDetailPanel.vue` 和 `ItemDetailPanel.vue` 中提取公共评论组件。

**现状：**
- `src/components/NodeDetailPanel.vue` (~588行) — 内嵌评论输入/列表/图片上传/分页
- `src/components/ItemDetailPanel.vue` (~482行) — 内嵌评论输入/列表/分页（无图片上传）
- 两边的评论逻辑高度重复（输入 + 提交 + 列表 + 时间格式化 + 分页）
- `formatTimeAgo` 在两个文件中有不同的实现

**方案（已确认）：**
- 创建 `src/components/CommentSection.vue` 公共组件
- Props: `comments` (数组), `readonly` (boolean)
- Emits: `@submit` (content: string)
- 两边都替换内联评论代码为 `<CommentSection />`

**边界条件：**
- NodeDetailPanel 的评论支持图片粘贴/上传 — 需要考虑是否也放到公共组件里
- ItemDetailPanel 的评论没有图片功能 — 提取后可能两边都会获得图片支持（这可能是预期效果）

### 候选 3-5 待评估

可在候选 2 完成后由 `/improve-codebase-architecture` 技能继续评估。优先推荐修复同步接缝（候选 3）。

## 架构决策记录

（无正式 ADR 文件，`docs/adr/` 目录不存在。CONTEXT.md 中引用了 ADR-0001/0002/0003 但只有内联描述，无独立文件。）

### 本次已确认的决策

1. **useWorkflowOperations 是纯编排层** — 不包含纯数据逻辑，只编排 store 调用 + 副效应（SVG 重绘、滚动、焦点管理、toast）
2. **useWorkflowKeyboard 独立存在** — 只负责快捷键映射，依赖 useWorkflowOperations
3. **CommentSection 先于 BaseDetailPanel** — 不一步到位抽 BaseDetailPanel

## 团队风格与约定

- 项目语言：简体中文（界面、注释、提交信息）
- 状态管理：模块级 Vue `reactive()`/`computed()` 单例，不用 Pinia
- composable 命名：`use` 前缀，返回对象包含 ref 和函数
- 平面目录避免嵌套深
- 持久化：TauriDataStore 带 300ms debounce
- 领域术语见 `CONTEXT.md`

## 代码质量

- 类型检查：`npx vue-tsc --noEmit`
- 构建：`npx vite build`
- 测试：目前项目无测试基础设施

## 运行方式

```bash
cd G:/time-master
npm run tauri dev     # 桌面开发模式
npm run dev           # 仅 Web 开发模式
```

## 建议的技能

新 agent 应按以下顺序调用技能：

1. **`/codebase-design`** — 使用深化模块的共享词汇（depth / seam / interface / leverage / locality）继续候选 2 的设计
2. **`/grilling`** — 在实现 CommentSection 前对接口设计进行走查
3. **`/tdd`** — 如果项目引入了测试，用 TDD 开发 CommentSection
4. **`/verify`** — 实现完成后走查验证改动
5. **`/code-review`** — 在合并前做最终审查

## 相关文件

- `C:\Users\Administrator\AppData\Local\Temp\architecture-review-20260710.html` — 架构分析报告
- `G:\time-master\CONTEXT.md` — 领域语言与架构上下文
- `G:\time-master\src\composables\useWorkflowOperations.ts` — 新 composable
- `G:\time-master\src\composables\useWorkflowKeyboard.ts` — 新 composable
- `G:\time-master\src\pages\WorkflowView.vue` — 已重构的页面
- `G:\time-master\src\components\NodeDetailPanel.vue` — 候选 2 的源文件之一
- `G:\time-master\src\components\ItemDetailPanel.vue` — 候选 2 的源文件之二