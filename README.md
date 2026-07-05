# Time Master

基于 Tauri + Vue 3 + TypeScript 的桌面时间管理应用。

## 功能

- 番茄钟（Pomodoro）
- 四象限任务管理
- 时间追踪与统计

## 开发

```bash
pnpm install
pnpm dev        # Vite 开发服务器
pnpm tauri dev  # Tauri 桌面应用开发
pnpm build     # 构建
```

## 技术栈

- **框架**: Vue 3 + TypeScript + Vite
- **桌面**: Tauri 2
- **UI**: Tailwind CSS + shadcn-vue
- **图标**: Lucide

##已知bug
- 编辑事项会出现两次toast

##需要补充的功能
- 新增事项/编辑事项窗口可以通过esc键关闭
- 在我的项目页面，项目可以移动到其他目录
