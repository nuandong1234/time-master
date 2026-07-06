# Time Master · ⏱️ 时间管理桌面w_str": "# Time Master · ⏱️ 时间管理桌面工具

> **一款集番茄钟、四象限任务管理与工作流于一体的桌面效率工具。**  
> 基于 Tauri 2 + Vue 3 + TypeScript 构建，提供原生桌面体验。

---

## 📑 目录

- [项目简介](#项目简介)
- [功能总览](#功能总览)
  - [🍅 番茄专注](#1-番茄专注-pomodoro)
  - [📋 事项清单](#2-事项清单-collaborate)
  - [📊 我的项目](#3-我的项目-workflow)
  - [⚙️ 系统设置](#4-系统设置-settings)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [构建与部署](#构建与部署)
- [数据存储](#数据存储)
- [开发说明](#开发说明)

---

## 项目简介

**Time Master（时间管理工具）** 是一款面向个人用户的桌面端时间管理与任务规划工具。它将 **番茄工作法**、**四象限任务分类（艾森豪威尔矩阵）** 和 **看板式流程管理** 三者融合，帮助用户高效组织日常事务、追踪项目进度、培养专注习惯。

> 产品名：**时间管理工具**  
> 版本：v0.1.0  
> 标识符：`com.timemaster.app`  
> 打包格式：Windows NSIS 安装包

---

## 功能总览

### 1. 🍅 番茄专注 (Pomodoro)

番茄钟模块帮助您使用 **番茄工作法** 管理专注时间。

**核心功能：**
- ⏱ **专注/休息计时** — 可自定义专注时长、休息时长和总轮数
- 🔗 **关联任务** — 将当前番茄钟绑定到指定任务，完成后自动推进任务进度
- 📊 **今日统计** — 实时显示今日完成番茄数、总专注时长
- 🔔 **系统通知** — 专注/休息切换时发送原生桌面通知
- 🔊 **提示音效** — 切换和完成时播放音效（可调节音量）
- ↩️ **自动循环** — 完成一轮后自动进入休息，休息结束自动进入下一轮
- ✅ **完成后确认** — 所有轮次完成后询问是否标记关联任务为完成

**操作路径：** 底部导航栏 → 🍅 番茄时钟

---

### 2. 📋 事项清单 (Collaborate)

基于 **艾森豪威尔四象限法则** 的任务管理模块。

**核心功能：**
- 🎯 **四象限看板** — 按"重要且紧急 / 重要不紧急 / 不重要紧急 / 不重要不紧急"分类
- 📝 **双模式视图** — 支持 **看板模式 (Board)** 和 **列表模式 (List)** 切换
- 🔍 **搜索筛选** — 按关键字搜索事项名称和描述
- 📅 **日期管理** — 支持设置开始/结束日期，**逾期高亮** 提醒
- 🔄 **重复事项** — 支持按天 / 周 / 月自动重复
- 🔗 **流程关联** — 任务可关联到工作流项目，完成任务后自动推进流程节点
- 📥 **日历选择** — 内置日历组件，支持滚轮切换月份
- 📤 **导出/导入** — 支持 JSON / CSV 格式的数据导入导出

**操作路径：** 底部导航栏 → 📋 事项清单

---

### 3. 📊 我的项目 (Workflow)

看板式 **工作流/项目管理** 模块，适合管理多步骤、多节点的复杂项目。

**核心功能：**
- 📂 **目录分类** — 支持创建多个目录（分类），拖拽移动项目到不同分类
- 📁 **多项目管理** — 每个目录下可创建多个项目
- 🧩 **步骤与节点** — 每个项目包含多个步骤，每个步骤包含多个节点（任务卡片）
- 🎨 **节点状态** — 三种状态：`wait`（等待）、`active`（进行中）、`done`（已完成）
- 🖱️ **拖拽排序** — 节点支持在同一步骤内拖拽排序，也可跨步骤拖拽移动
- 🔗 **自动推进** — 节点绑定事项清单中的任务，完成任务后自动推进流程
- 🏁 **已完成归档** — 项目所有节点完成后自动移至"已完成"目录
- 🔍 **模糊搜索** — 支持在工作流中按节点名称模糊搜索
- 📝 **节点详情** — 点击节点可查看/编辑详情、活动日志、评论
- ⚡ **一键激活** — 点击节点自动将关联任务设为番茄钟锁定任务

**操作路径：** 底部导航栏 → 📊 我的项目

---

### 4. ⚙️ 系统设置 (Settings)

全局应用设置，支持以独立窗口打开。

**核心功能：**
- 🎨 **主题切换** — 浅色 / 深色 / 跟随系统
- 🪟 **窗口尺寸** — 预设小(1000×650) / 中(1200×800) / 大(1400×900) / 最大化 / 自定义
- 🚀 **开机自启** — 设置应用随系统启动自动运行
- 📋 **最小化到托盘** — 关闭窗口时最小化到系统托盘而非退出
- 🔄 **数据管理** — 导入/导出数据（JSON/CSV）、查看数据文件路径、重置所有数据
- 🗂️ **数据存储** — 打开本地数据文件夹，方便手动备份
- 🔔 **通知** — 集成 Tauri Notification 插件，支持原生桌面通知

**操作路径：** 底部导航栏 → ⚙️ 设置 (或系统托盘右键 → 设置)

---

## 技术栈

| 层面 | 技术 | 说明 |
|------|------|------|
| **前端框架** | [Vue 3](https://vuejs.org/) + [TypeScript](https://www.typescriptlang.org/) | 组合式 API，类型安全 |
| **构建工具** | [Vite 6](https://vitejs.dev/) | 极速开发体验 |
| **桌面运行时** | [Tauri 2](https://v2.tauri.app/) | 小巧、安全、跨平台桌面框架 |
| **后端语言** | [Rust](https://www.rust-lang.org/) | 高性能、内存安全 |
| **UI 样式** | [Tailwind CSS 4](https://tailwindcss.com/) | 原子化 CSS |
| **UI 组件** | [shadcn-vue](https://www.shadcn-vue.com/) + [Reka UI](https://reka-ui.com/) | 高质量可访问组件 |
| **图标库** | [Lucide](https://lucide.dev/) | 开源 SVG 图标 |
| **路由** | [Vue Router 4](https://router.vuejs.org/) | Hash 模式路由 |
| **工具库** | [VueUse](https://vueuse.org/) | Composition API 工具集 |
| **状态持久化** | JSON 文件（通过 Tauri IPC） | 轻量本地存储 |
| **桌面插件** | 自动启动、通知、对话框、文件系统、单实例 | Tauri 官方插件 |
| **安装包** | NSIS (Nullsoft Scriptable Install System) | Windows 安装程序 |

---

## 项目结构

```
time-master/
├── src/                          # 前端源码 (Vue 3 + TypeScript)
│   ├── assets/
│   │   └── audio/               # 提示音效 (switch.mp3, complete.mp3)
│   ├── components/               # 可复用组件
│   │   ├── flow/                 # 工作流相关组件
│   │   ├── layout/               # 布局组件 (AppLayout, AppSidebar)
│   │   ├── ui/                   # 基础 UI 组件 (Button, Separator)
│   │   ├── AddItemModal.vue       # 新建事项弹窗
│   │   ├── EditItemModal.vue      # 编辑事项弹窗
│   │   ├── ItemDetailPanel.vue    # 事项详情面板
│   │   ├── NodeDetailPanel.vue    # 工作流节点详情面板
│   │   └── ToastContainer.vue     # 消息提示容器
│   ├── composables/              # 组合式函数 (逻辑复用)
│   │   ├── useCalendar.ts        # 日历选择器
│   │   ├── useItemDrag.ts        # 事项拖拽
│   │   ├── useItemFilter.ts      # 事项筛选/搜索
│   │   ├── usePomodoroTimer.ts   # 番茄钟计时器核心逻辑
│   │   ├── useTheme.ts           # 主题切换
│   │   ├── useWorkflowConnections.ts  # 工作流连线
│   │   ├── useWorkflowDrag.ts    # 工作流节点拖拽
│   │   └── useWorkflowSearch.ts  # 工作流模糊搜索
│   ├── lib/                      # 工具库
│   │   ├── data-store.ts         # Tauri IPC 数据读写封装
│   │   ├── datetime.ts           # 日期时间格式化
│   │   ├── item-utils.ts         # 事项工具函数 (逾期判断等)
│   │   ├── sound.ts              # 音效播放
│   │   ├── utils.ts              # 通用工具
│   │   └── workflow-item-sync.ts # 工作流-事项同步逻辑
│   ├── pages/                    # 页面视图
│   │   ├── PomodoroView.vue      # 🍅 番茄钟页面
│   │   ├── CollaborateView.vue   # 📋 事项清单页面
│   │   ├── WorkflowView.vue      # 📊 工作流页面
│   │   └── SettingsView.vue      # ⚙️ 设置页面
│   ├── router/
│   │   └── index.ts              # Vue Router 路由配置
│   ├── store/                    # 状态管理 (响应式 Store)
│   │   ├── items.ts              # 事项数据 (CRUD + 同步)
│   │   ├── pomodoro.ts           # 番茄钟统计数据
│   │   ├── settings.ts           # 应用设置
│   │   ├── toast.ts              # 消息提示
│   │   └── workflow.ts           # 工作流数据 (项目/步骤/节点)
│   ├── App.vue                   # 根组件
│   ├── main.ts                   # 入口文件
│   └── style.css                 # 全局样式 + Tailwind + shadcn-vue
├── src-tauri/                    # Tauri 后端 (Rust)
│   ├── src/
│   │   ├── lib.rs                # 核心逻辑 (IPC 命令、托盘、窗口事件)
│   │   └── main.rs               # 入口
│   ├── icons/                    # 应用图标 (多尺寸)
│   ├── nsis/
│   │   └── template.nsi          # NSIS 安装包模板
│   ├── capabilities/
│   │   └── default.json          # Tauri 权限配置
│   ├── tauri.conf.json           # Tauri 应用配置
│   └── Cargo.toml                # Rust 依赖配置
├── docs/                         # 设计文档与约束
│   ├── agents/                   # AI Agent 上下文定义
│   └── 全局设置/                 # 全局设计规范
├── public/
│   └── favicon.svg               # 网站图标
├── package.json                  # Node 依赖与脚本
├── vite.config.ts                # Vite 配置
├── tsconfig*.json                # TypeScript 配置
├── components.json               # shadcn-vue 组件配置
└── CLAUDE.md                     # AI 辅助开发上下文
```

---

## 快速开始

### 前置要求

- [Node.js](https://nodejs.org/) >= 18
- [pnpm](https://pnpm.io/) >= 8
- [Rust](https://www.rust-lang.org/) (稳定版)
- 系统桌面环境 (Windows 推荐)

### 安装与运行

```bash
# 1. 克隆项目
git clone <repo-url> && cd time-master

# 2. 安装前端依赖
pnpm install

# 3. 启动 Web 开发服务器 (仅前端，热更新)
pnpm dev

# 4. 启动 Tauri 桌面应用开发 (含后端)
pnpm tauri dev

# 5. 运行单元测试
pnpm test
```

> `pnpm dev` 访问地址：`http://localhost:1420`  
> `pnpm tauri dev` 会先启动 Vite 开发服务器，再启动 Tauri 桌面窗口。

---

## 构建与部署

### 构建桌面安装包

```bash
pnpm tauri build
```

该命令会：
1. 运行 `vue-tsc -b` 类型检查
2. 运行 `vite build` 构建前端
3. 使用 `cargo build` 编译 Rust 后端
4. 使用 NSIS 生成 Windows 安装包

### 输出产物

- 安装包路径：`src-tauri/target/release/bundle/nsis/`
- 安装程序名称：`时间管理工具_Setup.exe`
- 安装目录：默认 `E:\时间管理工具`（可在 NSIS 模板中修改）

### 安装包特性

- 简体中文安装界面
- 自动创建桌面快捷方式和开始菜单
- 写入 Windows 注册表（支持"添加/删除程序"中卸载）
- 支持自定义安装路径
- 安装后可选择立即运行

---

## 数据存储

### 存储方式

所有用户数据以 **JSON 文件** 形式存储在本地文件系统中：

| 文件 | 内容 |
|------|------|
| `data/items.json` | 事项清单 (任务、四象限分类) |
| `data/pomodoro.json` | 番茄钟统计 (完成数、专注时长) |
| `data/workflow.json` | 工作流数据 (项目、步骤、节点) |
| `data/settings.json` | 应用设置 (主题、窗口、托盘) |

### 数据位置

- **调试模式**：系统临时目录 `%TEMP%/time-master-data/`
- **生产模式**：可执行文件同级目录

### 导出/备份

通过 **设置 → 数据管理** 可以：
- 📤 **导出数据** — 支持 JSON（完整数据）和 CSV（仅事项）格式
- 📥 **导入数据** — 导入 JSON 格式的备份文件
- 🗂️ **打开数据文件夹** — 快速访问本地数据文件
- 🔄 **重置所有数据** — 清空所有数据恢复默认状态

---

## 开发说明

### 脚本命令

| 命令 | 说明 |
|------|------|
| `pnpm dev` | 启动 Vite 前端开发服务器 |
| `pnpm build` | 构建前端 (TypeScript 检查 + Vite 打包) |
| `pnpm preview` | 预览构建产物 |
| `pnpm tauri dev` | 启动 Tauri 桌面应用开发模式 |
| `pnpm tauri build` | 构建 Tauri 桌面安装包 |
| `pnpm test` | 运行 Vitest 单元测试 |

### 数据流架构

```
Vue 组件 (UI)
    ↕
Store (响应式状态)  ──  composables (业务逻辑)
    ↕
data-store.ts (IPC 封装)
    ↕  (Tauri IPC invoke)
Rust 后端 (lib.rs)
    ↕  (fs::read/write)
JSON 文件 (本地磁盘)
```

### 关键设计决策

- ✅ **轻量无后端**：所有数据本地存储，无需数据库或网络服务
- ✅ **响应式状态**：使用 Vue 3 `reactive` + `computed`，无需 Pinia 等额外状态管理库
- ✅ **单实例模式**：通过 `tauri-plugin-single-instance` 防止多开
- ✅ **系统托盘**：支持最小化到托盘，托盘菜单包含"显示主窗口"、"设置"、"退出"
- ✅ **双窗口架构**：主窗口 + 独立设置窗口（单例，居中于主窗口）
- ✅ **TypeScript 严格模式**：全量类型定义，提升代码质量和可维护性

---

## 🤝 贡献

欢迎提交 Issue 和 Pull Request 来改进 Time Master。

### 开发约定

- 使用 **组合式 API (Composition API)** + `<script setup>` 语法
- 使用 **`reactive` / `computed`** 管理状态，模块级单例模式
- 组件命名采用 PascalCase，文件命名采用 camelCase
- 国际化暂无支持，界面语言为简体中文

---

> 💡 **提示**：启动开发模式后，如果修改了 Rust 代码，Tauri 会自动重新编译后端。
"}]
