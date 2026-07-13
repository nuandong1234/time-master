use std::fs;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::{Manager, WebviewUrl};
use tauri::Emitter;
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_autostart::ManagerExt;
use tauri_plugin_log::{Target, TargetKind, RotationStrategy, TimezoneStrategy};

static MINIMIZE_TO_TRAY: AtomicBool = AtomicBool::new(true);
static IS_PROGRAMMATIC_RESIZE: AtomicBool = AtomicBool::new(false);

mod db;

struct DbState {
    conn: Mutex<rusqlite::Connection>,
}

fn get_base_dir() -> Result<std::path::PathBuf, String> {
    if cfg!(debug_assertions) {
        let temp = std::env::temp_dir().join("time-master-data");
        std::fs::create_dir_all(&temp).map_err(|e| e.to_string())?;
        Ok(temp)
    } else {
        let exe_dir = std::env::current_exe()
            .map_err(|e| e.to_string())?
            .parent()
            .ok_or("Cannot get exe directory")?
            .to_path_buf();
        Ok(exe_dir)
    }
}

fn get_db_path(base: &std::path::Path) -> std::path::PathBuf {
    let data_dir = base.join("data");
    std::fs::create_dir_all(&data_dir).ok();
    data_dir.join("timemaster.db")
}

fn get_or_init_conn<'a>(state: &'a tauri::State<'a, DbState>) -> std::sync::MutexGuard<'a, rusqlite::Connection> {
    state.conn.lock().unwrap()
}

#[tauri::command]
fn init_database(state: tauri::State<DbState>) -> Result<serde_json::Value, String> {
    log::info!("[CMD] init_database");
    let conn = get_or_init_conn(&state);
    let result = db::load_all_data(&conn);
    match &result {
        Ok(_v) => log::info!("[CMD] init_database → OK"),
        Err(e) => log::error!("[CMD] init_database → {}", e),
    }
    result
}

#[tauri::command]
fn save_items_data(state: tauri::State<DbState>, items_json: String) -> Result<(), String> {
    let count = items_json.matches("\"id\"").count();
    log::info!("[CMD] save_items_data  items_count={}", count);
    let conn = get_or_init_conn(&state);
    let result = db::save_items(&conn, &items_json);
    if let Err(ref e) = result {
        log::error!("[CMD] save_items_data → {}", e);
    }
    result
}

#[tauri::command]
fn save_workflow_data(state: tauri::State<DbState>, workflow_json: String) -> Result<(), String> {
    let size = workflow_json.len();
    log::info!("[CMD] save_workflow_data  size={}B", size);
    let conn = get_or_init_conn(&state);
    let result = db::save_workflow(&conn, &workflow_json);
    if let Err(ref e) = result {
        log::error!("[CMD] save_workflow_data → {}", e);
    }
    result
}

#[tauri::command]
fn save_settings_data(state: tauri::State<DbState>, settings_json: String) -> Result<(), String> {
    log::info!("[CMD] save_settings_data");
    let conn = get_or_init_conn(&state);
    let result = db::save_settings(&conn, &settings_json);
    if let Err(ref e) = result {
        log::error!("[CMD] save_settings_data → {}", e);
    }
    result
}

#[tauri::command]
fn save_pomodoro_data(state: tauri::State<DbState>, pomodoro_json: String) -> Result<(), String> {
    log::info!("[CMD] save_pomodoro_data");
    let conn = get_or_init_conn(&state);
    let result = db::save_pomodoro(&conn, &pomodoro_json);
    if let Err(ref e) = result {
        log::error!("[CMD] save_pomodoro_data → {}", e);
    }
    result
}

#[tauri::command]
fn get_data_dir() -> Result<String, String> {
    let dir = get_base_dir()?;
    log::debug!("[CMD] get_data_dir → {}", dir.display());
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn send_native_notification(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    log::info!("[CMD] send_native_notification  title=\"{}\"", title);
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| {
            log::error!("[CMD] send_native_notification → {}", e);
            e.to_string()
        })
}

#[tauri::command]
fn export_data(state: tauri::State<DbState>, path: String, format: String) -> Result<(), String> {
    log::info!("[CMD] export_data  format={}  path=\"{}\"", format, path);
    let conn = get_or_init_conn(&state);

    let result = if format == "csv" {
        let csv = db::export_csv(&conn)?;
        fs::write(&path, csv).map_err(|e| e.to_string())
    } else {
        let json = db::export_json(&conn)?;
        fs::write(&path, json).map_err(|e| e.to_string())
    };

    if let Err(ref e) = result {
        log::error!("[CMD] export_data → {}", e);
    }
    result
}

#[tauri::command]
fn import_data(state: tauri::State<DbState>, path: String) -> Result<(), String> {
    log::info!("[CMD] import_data  path=\"{}\"", path);
    let content = fs::read_to_string(&path).map_err(|e| {
        log::error!("[CMD] import_data 无法读取文件: {}", e);
        format!("无法读取文件: {}", e)
    })?;
    let conn = get_or_init_conn(&state);
    let result = db::import_json(&conn, &content);
    if let Err(ref e) = result {
        log::error!("[CMD] import_data → {}", e);
    }
    result
}

#[tauri::command]
fn reset_all_data(state: tauri::State<DbState>) -> Result<(), String> {
    log::warn!("[CMD] reset_all_data");
    let conn = get_or_init_conn(&state);
    let result = db::reset_all(&conn);
    if let Err(ref e) = result {
        log::error!("[CMD] reset_all_data → {}", e);
    }
    result
}

#[tauri::command]
fn get_autostart(app: tauri::AppHandle) -> Result<bool, String> {
    let result = app.autolaunch().is_enabled().map_err(|e| e.to_string());
    log::debug!("[CMD] get_autostart → {:?}", result);
    result
}

#[tauri::command]
fn open_data_folder() -> Result<(), String> {
    let base = get_base_dir()?;
    let path_str = base.to_string_lossy().to_string();
    log::info!("[CMD] open_data_folder  path=\"{}\"", path_str);
    std::process::Command::new("explorer")
        .arg(&path_str)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    log::info!("[CMD] set_autostart  enabled={}", enabled);
    let autostart = app.autolaunch();
    let result = if enabled {
        autostart.enable().map_err(|e| e.to_string())
    } else {
        autostart.disable().map_err(|e| e.to_string())
    };
    if let Err(ref e) = result {
        log::error!("[CMD] set_autostart → {}", e);
    }
    result
}

#[tauri::command]
fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
    log::info!("[CMD] open_settings_window");
    open_settings_window_impl(&app)
}

fn open_settings_window_impl(app: &tauri::AppHandle) -> Result<(), String> {
    // 单例：如果设置窗口已存在，激活它
    if let Some(window) = app.get_webview_window("settings") {
        let _ = window.show();
        let _ = window.set_focus();
        return Ok(());
    }

    // 计算主窗口居中位置
    let (cx, cy) = if let Some(main) = app.get_webview_window("main") {
        if let Ok(pos) = main.outer_position() {
            if let Ok(size) = main.outer_size() {
                let x = pos.x + (size.width as i32 - 640) / 2;
                let y = pos.y + (size.height as i32 - 560) / 2;
                (x.max(0), y.max(0))
            } else { (0, 0) }
        } else { (0, 0) }
    } else { (0, 0) };

    let builder = tauri::WebviewWindowBuilder::new(
        app,
        "settings",
        WebviewUrl::App("#/settings".into()),
    )
    .title("设置")
    .inner_size(640.0, 520.0)
    .position(cx as f64, cy as f64)
    .center()
    .resizable(false)
    .maximizable(false)
    .decorations(true);

    let _window = builder.build().map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn set_minimize_to_tray(enabled: bool) -> Result<(), String> {
    MINIMIZE_TO_TRAY.store(enabled, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
fn set_debug_logging(enabled: bool) -> Result<(), String> {
    if enabled {
        log::set_max_level(log::LevelFilter::Debug);
        log::info!("调试日志已开启");
    } else {
        let default = if cfg!(debug_assertions) {
            log::LevelFilter::Debug
        } else {
            log::LevelFilter::Warn
        };
        log::set_max_level(default);
        log::info!("调试日志已关闭");
    }
    Ok(())
}

#[tauri::command]
async fn set_window_size(app: tauri::AppHandle, preset: String, width: Option<f64>, height: Option<f64>) -> Result<(), String> {
    log::info!("[CMD] set_window_size  preset={}  {:?}x{:?}", preset, width, height);
    IS_PROGRAMMATIC_RESIZE.store(true, Ordering::SeqCst);

    let window = app.get_webview_window("main").ok_or("主窗口未找到")?;

    match preset.as_str() {
        "small" => {
            window.set_size(tauri::LogicalSize::new(1000.0, 650.0)).map_err(|e| e.to_string())?;
            window.center().map_err(|e| e.to_string())?;
        }
        "medium" => {
            window.set_size(tauri::LogicalSize::new(1200.0, 800.0)).map_err(|e| e.to_string())?;
            window.center().map_err(|e| e.to_string())?;
        }
        "large" => {
            window.set_size(tauri::LogicalSize::new(1400.0, 900.0)).map_err(|e| e.to_string())?;
            window.center().map_err(|e| e.to_string())?;
        }
        "maximized" => {
            window.maximize().map_err(|e| e.to_string())?;
        }
        "custom" => {
            if let (Some(w), Some(h)) = (width, height) {
                window.set_size(tauri::LogicalSize::new(w, h)).map_err(|e| e.to_string())?;
                window.center().map_err(|e| e.to_string())?;
            }
        }
        _ => {}
    }

    // 如果在设置窗口中调整主窗口尺寸，重新聚焦到设置窗口
    if let Some(settings) = app.get_webview_window("settings") {
        let _ = settings.set_focus();
    }

    Ok(())
}

#[tauri::command]
async fn get_window_size(app: tauri::AppHandle) -> Result<(f64, f64, bool), String> {
    let window = app.get_webview_window("main").ok_or("主窗口未找到")?;
    let physical_size = window.outer_size().map_err(|e| e.to_string())?;
    let scale = window.scale_factor().map_err(|e| e.to_string())?;
    let maximized = window.is_maximized().map_err(|e| e.to_string())?;
    let size = (physical_size.width as f64 / scale, physical_size.height as f64 / scale, maximized);
    log::debug!("[CMD] get_window_size → {:?}", size);
    Ok(size)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .invoke_handler(tauri::generate_handler![
            get_data_dir,
            send_native_notification,
            export_data,
            import_data,
            reset_all_data,
            set_autostart,
            set_minimize_to_tray,
            set_debug_logging,
            open_settings_window,
            get_autostart,
            open_data_folder,
            set_window_size,
            get_window_size,
            init_database,
            save_items_data,
            save_workflow_data,
            save_settings_data,
            save_pomodoro_data,
        ])
        .setup(|app| {
            // ── 初始化 SQLite 数据库 ──
            let base = get_base_dir().map_err(|e| e.to_string())?;
            let db_path = get_db_path(&base);
            if let Some(parent) = db_path.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }

            let conn = db::init_db(db_path.to_str().unwrap_or("timemaster.db"))
                .map_err(|e| e.to_string())?;

            // 从旧 JSON 文件迁移数据
            let _ = db::migrate_from_json(&conn, &base);

            // ── 从保存的设置中恢复窗口尺寸（在 conn 被管理前使用） ──
            if let Some(main_window) = app.get_webview_window("main") {
                let ws: Option<String> = conn.query_row(
                    "SELECT value FROM settings WHERE key = 'windowSize'",
                    [],
                    |row| row.get(0)
                ).ok();
                let cw: Option<f64> = conn.query_row(
                    "SELECT value FROM settings WHERE key = 'customWindowWidth'",
                    [],
                    |row| row.get::<_, String>(0)
                ).ok().and_then(|s| s.parse::<f64>().ok());
                let ch: Option<f64> = conn.query_row(
                    "SELECT value FROM settings WHERE key = 'customWindowHeight'",
                    [],
                    |row| row.get::<_, String>(0)
                ).ok().and_then(|s| s.parse::<f64>().ok());

                if let Some(window_size) = ws {
                    IS_PROGRAMMATIC_RESIZE.store(true, Ordering::SeqCst);
                    match window_size.as_str() {
                        "custom" => {
                            if let (Some(w), Some(h)) = (cw, ch) {
                                let _ = main_window.set_size(tauri::LogicalSize::new(w, h));
                                let _ = main_window.center();
                            }
                        }
                        "maximized" => {
                            let _ = main_window.maximize();
                        }
                        "small" => {
                            let _ = main_window.set_size(tauri::LogicalSize::new(1000.0, 650.0));
                            let _ = main_window.center();
                        }
                        "large" => {
                            let _ = main_window.set_size(tauri::LogicalSize::new(1400.0, 900.0));
                            let _ = main_window.center();
                        }
                        _ => {}
                    }
                } else {
                    // 无保存设置时使用默认尺寸并居中
                    let _ = main_window.center();
                }
                // 尺寸已设置完毕，现在显示窗口
                let _ = main_window.show();
                let _ = main_window.set_focus();
            }

            // 读取 debugLogging 设置（在 conn 被管理前读取）
            let dl_enabled: bool = conn.query_row(
                "SELECT value FROM settings WHERE key = 'debugLogging'",
                [],
                |row| row.get::<_, String>(0),
            )
            .ok()
            .map(|v| v == "true")
            .unwrap_or(false);
            let dl_started: String = conn.query_row(
                "SELECT value FROM settings WHERE key = 'debugLoggingStartedAt'",
                [],
                |row| row.get::<_, String>(0),
            )
            .ok()
            .unwrap_or_default();

            // 管理数据库连接（conn 被移动至此）
            app.manage(DbState {
                conn: Mutex::new(conn),
            });

            // ── 日志系统 ──
            let data_dir = base.join("data");
            std::fs::create_dir_all(&data_dir).map_err(|e| e.to_string())?;

            app.handle().plugin(
                tauri_plugin_log::Builder::default()
                    .level(log::LevelFilter::Trace) // 由 log::set_max_level 控制实际级别
                    .target(Target::new(TargetKind::Folder {
                        path: data_dir,
                        file_name: Some("app".into()),
                    }))
                    // 同时输出到 stdout（在终端中可见）
                    .target(Target::new(TargetKind::Stdout))
                    .max_file_size(5 * 1024 * 1024) // 5MB
                    .rotation_strategy(RotationStrategy::KeepSome(3))
                    .timezone_strategy(TimezoneStrategy::UseLocal)
                    .build(),
            )?;

            // 设置初始日志级别
            let initial_level = if cfg!(debug_assertions) {
                log::LevelFilter::Debug
            } else {
                log::LevelFilter::Warn
            };

            if dl_enabled && !dl_started.is_empty() {
                log::set_max_level(log::LevelFilter::Debug);
            } else {
                log::set_max_level(initial_level);
            }

            log::info!(
                "应用启动完成  数据目录: {}  日志级别: {}",
                base.display(),
                log::max_level()
            );

            // ── 系统托盘 ──
            let show_item = MenuItemBuilder::with_id("show", "显示主窗口").build(app)?;
            let settings_item = MenuItemBuilder::with_id("settings", "设置").build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出应用").build(app)?;
            let menu = MenuBuilder::new(app)
                .item(&show_item)
                .item(&settings_item)
                .item(&quit_item)
                .build()?;

            let tray_icon = app.default_window_icon().cloned().unwrap_or_else(|| {
                tauri::image::Image::new(&[], 0, 0)
            });

            TrayIconBuilder::new()
                .icon(tray_icon)
                .menu(&menu)
                .tooltip("时间管理")
                .on_menu_event(|app, event| {
                    log::info!("[TRAY] 菜单事件: {}", event.id.as_ref());
                    match event.id.as_ref() {
                        "show" => {
                            if let Some(window) = app.get_webview_window("main") {
                                let _ = window.show();
                                let _ = window.set_focus();
                            }
                        }
                        "settings" => {
                            let _ = open_settings_window_impl(app);
                        }
                        "quit" => {
                            log::info!("[TRAY] 用户选择退出");
                            app.exit(0);
                        }
                        _ => {}
                    }
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        log::debug!("[TRAY] 左键单击恢复窗口");
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                })
                .build(app)?;

            Ok(())
        })
        .on_window_event(|window, event| {
            match event {
                tauri::WindowEvent::Resized(size) => {
                    if window.label() == "main" {
                        log::debug!("[WINDOW] Resized  {}x{}", size.width, size.height);
                        if IS_PROGRAMMATIC_RESIZE.load(Ordering::SeqCst) {
                            IS_PROGRAMMATIC_RESIZE.store(false, Ordering::SeqCst);
                        } else {
                            // 手动调整窗口 → 通知前端（转换为逻辑尺寸）
                            let app = window.app_handle();
                            let maximized = window.is_maximized().unwrap_or(false);
                            let scale = window.scale_factor().unwrap_or(1.0);
                            let payload = serde_json::json!({
                                "width": size.width as f64 / scale,
                                "height": size.height as f64 / scale,
                                "maximized": maximized
                            });
                            let _ = app.emit("window-resized", payload);
                        }
                    }
                }
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    if window.label() == "main" {
                        if MINIMIZE_TO_TRAY.load(Ordering::SeqCst) {
                            log::info!("[WINDOW] 关闭请求 → 最小化到托盘");
                            api.prevent_close();
                            let _ = window.hide();
                        } else {
                            log::info!("[WINDOW] 关闭请求 → 退出应用");
                            if let Some(settings) = window.app_handle().get_webview_window("settings") {
                                let _ = settings.close();
                            }
                            // 不最小化到托盘时，关闭主窗口即退出整个应用
                            window.app_handle().exit(0);
                        }
                    }
                }
                _ => {}
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
