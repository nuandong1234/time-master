# Time Master ⏱️

一款集 **番茄钟**、**四象限任务管理** 与 **看板工作流** 于一体的 Windows 桌面效率工具。基于 Tauri 2 + Vue 3 + TypeScript 构建。

- 产品名：时间管理工具 · 版本：v0.2.2 · 标识符：`com.timemaster.app`
- 分发方式：Windows NSIS 安装包 · 界面语言：简体中文

三个模块通过共享的「事项 id」相互联动：**事项 ↔ 番茄钟 ↔ 工作流**，一处完成，处处推进。

---

## 目录

- [功能](#功能)
  - [🍅 番茄专注](#-番茄专注)
  - [📋 事项清单](#-事项清单)
  - [📊 我的项目（工作流）](#-我的项目工作流)
  - [⚙️ 系统设置（独立窗口）](#️-系统设置独立窗口)
- [技术栈](#技术栈)
- [快速开始](#快速开始)
- [项目结构](#项目结构)
- [数据存储](#数据存储)
- [开发约定](#开发约定)

---

## 功能

### 🍅 番茄专注
- 自定义专注时长、休息时长、总轮数，自动循环
- 关联任务：完成番茄会话可推进对应事项/节点
- 今日统计（完成番茄数、累计专注时长）
- 原生桌面通知 + 切换/完成音效（音量可调）

### 📋 事项清单
- 艾森豪威尔四象限分类（重要 × 紧急）
- 看板 / 列表双视图，关键字搜索
- 开始/结束日期，逾期高亮
- 按天/周/月重复事项
- 关联工作流节点，JSON / CSV 导入导出

### 📊 我的项目（工作流）
- 层级结构：目录 → 项目 → 步骤 → 节点
- 节点三态：`wait` / `active` / `done`，支持同步拖拽排序、跨步骤移动
- 节点绑定事项，完成后自动推进；项目全部完成自动归档到「已完成」
- 节点详情、活动日志、评论；一键将关联任务设为番茄钟锁定任务

### ⚙️ 系统设置（独立窗口）
- 主题：浅色 / 深色 / 跟随系统
- 窗口尺寸预设与自定义，并持久化：启动时先恢复上次尺寸/最大化状态再显示（避免闪烁），手动拖拽调整也会实时同步
- 开机自启、关闭时最小化到系统托盘
- 数据导入/导出、打开数据文件夹、重置数据

---

## 技术栈

| 层面 | 技术 |
|------|------|
| 前端 | Vue 3 (Composition API) + TypeScript + Vite 6 |
| 桌面 | Tauri 2 + Rust |
| 样式/组件 | Tailwind CSS 4 · shadcn-vue · Reka UI · Lucide |
| 路由/工具 | Vue Router 4 (Hash) · VueUse |
| 状态 | `src/store/` 下模块级 `reactive` / `computed` 单例（无 Pinia） |
| 存储 | SQLite（rusqlite bundled），经 Tauri IPC 读写，无独立后端服务 |
| 日志/测试/打包 | tauri-plugin-log（仅 debug）· Vitest · NSIS |
| Tauri 插件 | autostart · notification · dialog · fs · single-instance |

---

## 快速开始

前置：Node.js ≥ 18、Rust 稳定版。

```bash
npm install         # 安装依赖
npm run dev         # 仅前端开发 (http://localhost:1420)
npm run tauri dev   # 桌面应用开发（含 Rust 后端）
npm test            # 运行单元测试
npm run tauri build # 构建 Windows NSIS 安装包
```

安装包输出：`src-tauri/target/release/bundle/nsis/`（`currentUser` 安装模式，简体中文界面）。

---

## 项目结构

```
src/
├── assets/audio/       提示音效 (switch.mp3, complete.mp3)
├── components/          UI 组件 (flow/ layout/ ui/ + 弹窗/详情面板)
├── composables/         组合式逻辑 (番茄计时、拖拽、筛选、主题…)
├── lib/                 工具库 (data-store IPC、datetime、workflow-item-sync…)
├── pages/               四个页面视图 (Pomodoro/Collaborate/Workflow/Settings)
├── router/              Vue Router 配置
├── store/               响应式 Store (items/pomodoro/workflow/settings/toast)
└── main.ts / App.vue / style.css
src-tauri/
├── src/lib.rs           IPC 命令、系统托盘、窗口事件
├── nsis/template.nsi    NSIS 安装包模板
├── capabilities/        Tauri 权限配置
└── tauri.conf.json      应用配置
docs/                    设计文档 (ADR、领域词汇、AI Agent 上下文)
```

---

## 数据存储

所有数据保存在本地 **SQLite** 数据库文件 `data/timemaster.db` 中，通过 Tauri IPC 读写，无需网络或独立后端服务。

- 调试模式：`%TEMP%/time-master-data/data/timemaster.db`
- 生产模式：可执行文件同级目录下 `data/timemaster.db`
- 首次启动会自动从旧版 JSON 文件（`items.json` 等）迁移数据

跨模块同步逻辑位于 `src/lib/workflow-item-sync.ts`——修改前请追溯事项、番茄钟、工作流三个消费方。

---

## 开发约定

- 组合式 API + `<script setup>`；状态用模块级 `reactive` / `computed` 单例
- 组件名 PascalCase，文件名 camelCase
- TypeScript 严格模式，界面仅简体中文（暂无 i18n）

> 更多领域术语与架构说明见 `CONTEXT.md` 与 `docs/`。
