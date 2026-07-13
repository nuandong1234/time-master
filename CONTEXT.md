# CONTEXT.md — Time Master

`time-master` 仓库的领域语言与架构上下文。在探索或修改代码前请先读本文。
这里的术语是项目实际使用的词汇,不要私自替换成同义词。

## 这个产品是什么

**Time Master（时间管理工具）** 是一款面向个人用户的桌面端时间管理与任务规划工具。
它将三种方法融合到同一个工具里:

- **番茄工作法 (Pomodoro)** —— 专注/休息循环,培养专注习惯。
- **艾森豪威尔四象限** —— 按「重要 × 紧急」对任务做优先级分类。
- **看板式工作流 (Kanban workflow)** —— 多步骤的项目管理。

技术栈为 **Tauri 2 + Vue 3 + TypeScript + SQLite**。包名 `com.timemaster.app`,以 Windows NSIS 安装包分发。
界面语言为简体中文,暂无国际化(i18n)层。

## 领域术语表

### 🍅 番茄专注 (Pomodoro)
- **专注 / 休息 (focus / break)** —— 一个番茄循环里交替出现的两个阶段。
- **轮次 (round)** —— 一组「专注 + 休息」,一个会话有可配置的总轮数。
- **关联任务 (linked task)** —— 番茄钟可绑定到一个「事项」;完成该会话可以推进该事项的进度。
- **今日统计 (daily stats)** —— 当天完成的番茄数与累计专注时长。
- **自动循环 (auto-loop)** —— 一轮结束后自动进入休息,再自动进入下一轮。
### 📋 事项清单 (Collaborate / Items)
- **事项 (item / task)** —— 待办清单的最小单元。存放在 SQLite 的 `items` 表。
- **四象限 (four quadrants)** —— 按 重要 (important) × 紧急 (urgent) 分类:
  - 重要且紧急 / 重要不紧急 / 不重要紧急 / 不重要不紧急。
- **看板模式 (Board) / 列表模式 (List)** —— 事项的两种视图。
- **逾期 (overdue)** —— 事项超过结束日期;在界面中高亮提示。
- **重复事项 (recurring item)** —— 按 天 / 周 / 月 自动重复。
- **流程关联 (workflow link)** —— 事项可绑定到工作流的「节点」;完成该事项会自动推进对应节点。

### 📊 我的项目 (Workflow)
层级结构:**目录 (category)** → **项目 (project)** → **步骤 (step)** → **节点 (node)**。
- **目录 (category)** —— 顶层分组;项目可在不同目录间拖拽。已完成项目会自动归档到「已完成」目录。
- **项目 (project)** —— 一个多步骤的工作。
- **步骤 (step)** —— 项目内一组有序的节点。
- **节点 (node)** —— 任务卡片。有且仅有三种状态之一:
  - `wait` (等待) / `active` (进行中) / `done` (已完成)。
- **自动推进 (auto-advance)** —— 节点绑定的「事项」完成时,该节点自动推进。
- **一键激活 (one-click activate)** —— 点击节点会将其关联任务设为番茄钟的锁定任务。

## 跨模块同步(三向联动)

三个模块并非彼此孤立,而是通过共享的「事项 id」相互同步:
**事项 ↔ 番茄钟 ↔ 工作流**。同步逻辑位于 `src/lib/workflow-item-sync.ts`。
在此处做改动时,先追溯全部三个消费方,不要假定某个字段是局部私有的。

## 架构上下文

- **本地 SQLite 数据库。** 所有用户数据存储在 `data/timemaster.db`，通过 `rusqlite` 读写。
  从旧版 JSON 文件迁移由 `db::migrate_from_json()` 自动完成。
- **状态管理** 采用 `src/store/` 下的模块级 Vue `reactive`/`computed` 单例 —— 不用 Pinia。
  详见 `docs/adr/0002-module-singleton-state.md`。
- **双窗口**:主窗口 + 一个居中于主窗口的单例设置窗口。
  详见 `docs/adr/0003-single-instance-dual-window.md`。
- **单实例** 应用(防止多开),并带有**系统托盘**(最小化到托盘)。
- **数据位置**:调试模式 → `%TEMP%/time-master-data/`;生产模式 → 可执行文件同级目录。
  文件: `data/timemaster.db`（SQLite 数据库）、`data/app.log`（日志文件，详见下方日志系统）。

## 数据流形态

```
Vue 组件 (UI)  ⇅  Store (响应式状态)  ⇠  composables (业务逻辑)
       ⇅  data-store.ts (IPC 封装)
       ⇅  Rust 后端 (src-tauri/src/lib.rs)  ⇠  rusqlite
       ⇅  SQLite 文件 (data/timemaster.db)
```

## 日志系统

详见 `docs/adr/0004-logging-system.md`（待创建）。

### 概要
- **日志文件**: `data/app.log`，与 SQLite 数据库同目录。
- **轮转**: 单文件最大 5MB，保留最近 3 个归档文件（`app_2026-07-13_*.log`）。
- **默认级别**:
  - Debug 构建: `DEBUG`
  - Release 构建: `WARN` + 关键 `INFO`
- **调试开关**: 设置页「调试」区域可开启调试日志，级别升至 `DEBUG`，24 小时后自动关闭。
- **前端日志**: `console.error()` / `console.warn()` 自动通过 IPC 转发到 Rust 日志文件。
- **边界规则**: 用户业务操作（重命名、状态变更、评论）归 `workflow_node_activity` 表；
  系统操作（命令调用、数据库读写、文件 I/O）归 `app.log`，不重复记录。