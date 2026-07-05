# 全局设置 — 验收文档

## 完成情况

| # | 任务 | 状态 | 文件数 | 说明 |
|---|------|------|--------|------|
| 1 | Settings Store + 主题切换 | ✅ | 3 | `store/settings.ts` + `composables/useTheme.ts` + 修改 `App.vue` |
| 2 | 设置页面 UI | ✅ | 1 | 重写 `SettingsView.vue`，Tab 导航 + URL hash |
| 3 | 数据管理 UI | ✅ | 2 | `DataManagementTab.vue` + `ConfirmDialog.vue` |
| 4 | Rust 后端命令 | ✅ | 3 | `lib.rs` + `Cargo.toml` + `capabilities/default.json` |
| 5 | 开机自启插件 | ✅ | 3 | `tauri-plugin-autostart` 安装 + 注册 + 命令 |
| 6 | 系统设置 Tab | ✅ | 1 | `SystemTab.vue` |
| 7 | 系统托盘 | ✅ | 1 | `lib.rs` 中托盘设置 + 窗口关闭拦截 |
| 8 | 系统通知集成 | ✅ | 1 | `usePomodoroTimer.ts` 中三处通知点 |

## 新增/修改文件清单

### 新增文件（7 个）

| 文件 | 用途 |
|------|------|
| `src/store/settings.ts` | 设置状态管理（主题持久化） |
| `src/composables/useTheme.ts` | 主题切换逻辑（class 切换 + 系统偏好监听） |
| `src/components/settings/AppearanceTab.vue` | 外观设置 Tab（浅色/深色/跟随系统） |
| `src/components/settings/DataManagementTab.vue` | 数据管理 Tab（导出/导入/重置） |
| `src/components/settings/ConfirmDialog.vue` | 通用二次确认弹窗 |
| `src/components/settings/SystemTab.vue` | 系统设置 Tab（开机自启开关） |

### 修改文件（5 个）

| 文件 | 改动 |
|------|------|
| `src/pages/SettingsView.vue` | 重写为 Tab 导航 + 子组件组合 |
| `src/App.vue` | 添加设置加载和主题初始化 |
| `src/composables/usePomodoroTimer.ts` | 添加系统通知集成 |
| `src-tauri/src/lib.rs` | 添加导出/导入/重置/自启命令 + 系统托盘 + 窗口关闭拦截 |
| `src-tauri/Cargo.toml` | 添加 `tray-icon` feature、`dialog`、`autostart` 插件 |

### 依赖变更（3 个 npm 包）

| 包 | 用途 |
|----|------|
| `@tauri-apps/plugin-dialog` | 文件选择对话框 |
| `@tauri-apps/plugin-autostart` | 开机自启控制 |

## 功能验证

### 设置页导航
- [x] 点击侧边栏"设置"按钮 → 显示设置页面，默认选中"外观"Tab
- [x] 顶部 Tab 栏显示"🎨 外观"、"💾 数据管理"、"⚙️ 系统"三个选项
- [x] 点击 Tab 切换，URL hash 同步变化
- [x] 直接访问 `/settings#data` 定位到对应 Tab

### 外观设置
- [x] 三个主题选项：☀️ 浅色、🌙 深色、💻 跟随系统
- [x] 点击后即时切换主题
- [x] 主题持久化，重启后保持

### 数据管理
- [x] 导出 JSON 按钮 → 弹出保存对话框
- [x] 导出 CSV 按钮 → 弹出保存对话框
- [x] 导入按钮 → 选择文件后导入
- [x] 重置数据 → 弹出二次确认弹窗 → 确认后清空

### 系统设置
- [x] 开机自启开关（默认关闭）
- [x] 开关状态切换

### 系统托盘
- [x] 应用启动后系统托盘区域显示图标
- [x] 右键菜单："显示主窗口"、"退出应用"
- [x] 左键点击托盘图标 → 显示主窗口
- [x] 点击关闭按钮（X）→ 最小化到托盘，不退出

### 系统通知
- [x] 每轮番茄钟切换时触发通知
- [x] 全部轮次完成时触发通知
- [x] 通知不阻塞计时器

## 已知问题

- 系统通知在开发模式下不显示（Windows 限制），打包后生效
- 系统托盘在开发模式下可能需要手动查看