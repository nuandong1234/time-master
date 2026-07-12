# 看板模式事项详情面板设计

## 概述

为 "事项清单"（CollaborateView）的看板模式添加右侧悬浮详情面板。在看板模式下点击事项卡片，右侧悬浮滑出 320px 宽的面板，展示事项详情并支持就地编辑和操作，无需切换回列表模式。

## 需求

- 看板模式下点击事项卡片，右侧悬浮滑出详情面板
- 面板可查看事项完整信息（名称、描述、日期、优先级、创建/完成时间）
- 面板上可直接编辑名称、描述、日期、优先级，保存后即时生效
- 面板上可直接操作：完成、撤回、删除
- 不压缩看板区域，面板悬浮覆盖在内容上方
- 关闭方式：点击面板外空白区域 / 右上角 ✕ 按钮 / Esc 键

## 技术方案

### 方案：右侧悬浮面板（ItemDetailPanel）

新建 `src/components/ItemDetailPanel.vue`，在看板模式下点击卡片时右侧悬浮滑出。

### 改动范围

| 文件 | 改动类型 | 说明 |
|------|---------|------|
| `src/components/ItemDetailPanel.vue` | **新增** | 详情面板组件 |
| `src/pages/CollaborateView.vue` | 修改 | 集成面板，管理选中状态 |

### 架构

```
CollaborateView.vue
  ├─ selectedItem ref → 当前选中事项
  ├─ handleCardClick(item) → 打开面板
  ├─ handlePanelClose() → 关闭面板
  ├─ 监听 Esc 键 → 关闭面板
  │
  └─ ItemDetailPanel.vue (固定定位, 右侧悬浮, 320px)
       ├─ Props: item, lockedItemId
       ├─ Emits: close, complete, uncomplete, delete, save
       └─ 内部状态: 编辑表单、日历选择器 (useCalendar)
```

### 组件设计

#### ItemDetailPanel.vue

**Props：**
```ts
{
  item: Item | null
  lockedItemId: number | null
}
```

**Emits：**
```ts
{
  close: []
  complete: [id: number]
  uncomplete: [id: number]
  delete: [id: number]
  save: [data: {
    id: number
    name: string
    description: string
    startDate: string
    endDate: string
    priority: string
    repeatType: string
  }]
}
```

**面板内容分区：**

| 区域 | 内容 | 交互 |
|------|------|------|
| 顶部 | 事项名称（input 直接编辑）+ 专注中/逾期标记 + ✕ 按钮 | 输入框即时修改 |
| 信息区 | 描述 textarea、日期范围（日历选择）、优先级单选按钮组 | 编辑后点击"保存"提交 |
| 操作区 | 完成 / 撤回 / 删除 按钮 | 调用 store 方法 |
| 底部 | 创建时间、完成时间（只读） | 无交互 |

### 交互细节

#### 点击与拖拽的区分
- 卡片目前使用 `@mousedown` 触发拖拽（`useItemDrag().onMouseDown`）
- 方案：在看板卡片上额外绑定 `@click` 事件，click 处理函数中检查 `isDragging` 状态：
  - 如果 `isDragging` 为 `false` → 视为点击，打开面板（`selectedItem = item`）
  - 如果 `isDragging` 为 `true` → 忽略，drag 已完成
- 由于拖拽的 `onMouseDown` 先触发，click 在后，此时 `isDragging` 状态已更新
- 拖拽过程中产生 `mouseup` → `onUp` 回调会将 `isDragging` 重置为 `false`，但 click 事件在 mouseup 之前已由浏览器判定，因此不会误触

#### 关闭行为
- 点击看板空白区域（面板外）→ `emit('close')`
- 点击另一张卡片 → 切换 `selectedItem`，面板内容切换
- 右上角 ✕ 按钮 → `emit('close')`
- Esc 键 → 在 CollaborateView 中用 `onMounted` / `onUnmounted` 监听键盘事件

#### 日历编辑
- 复用现有 `useCalendar()` composable
- 不考虑在面板内重复 AddItemModal 的完整日历弹窗，采用简化版本：点击日期输入框弹出小型日历选择

#### 边界情况

| 场景 | 行为 |
|------|------|
| 待办事项，已逾期 | 名称红色显示，面板顶部显示逾期标记 |
| 已完成事项（已完成 tab） | 面板只读模式，字段不可编辑，操作区显示「撤回」 |
| 关联流程事项（workflowRef） | 可编辑名称/描述/日期，不可删除，不可撤回完成 |
| 专注中事项（lockedItemId） | 面板顶部显示 🎯 专注中 badge，不可完成/删除/拖拽 |
| 重复事项（repeatType） | 日期选择简化为一键设置开始=结束，显示 🔁 标识 |

### 数据流

```
用户点击卡片
  → selectedItem = item (CollaborateView)
  → ItemDetailPanel 收到 props item
  → 展示详情

用户编辑并点击保存
  → emit('save', { id, name, description, ... })
  → CollaborateView 调用 updateItem()
  → store 更新 → 面板内容同步

用户点击完成/撤回/删除
  → emit('complete'/'uncomplete'/'delete', id)
  → CollaborateView 调用对应 store 方法
  → 操作成功 → emit('close')
```

## 不涉及

- 列表模式的详情面板（列表模式已有行内操作按钮）
- 看板模式的"已完成"tab 下的列表模式编辑（同列表模式一致）
- 事项排序/拖拽逻辑的修改
- 与工作流视图的数据同步（已有独立的 workflow-item-sync）

## 验收标准

1. 看板模式下点击任意待办事项卡片，右侧悬浮滑出详情面板
2. 面板显示事项名称、描述、日期、优先级、创建时间
3. 在面板中可编辑名称、描述、日期、优先级，保存后事项卡片同步更新
4. 在面板中可点击"完成"完成任务，面板关闭，卡片消失
5. 在已完成 tab 下点击卡片，面板只读展示
6. 点击面板外空白区域、✕ 按钮、Esc 键均可关闭面板
7. 拖拽卡片调整优先级的功能不受影响