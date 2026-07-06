use std::fs;
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::{Manager, WebviewUrl};
use tauri_plugin_notification::NotificationExt;
use tauri_plugin_autostart::ManagerExt;

static MINIMIZE_TO_TRAY: AtomicBool = AtomicBool::new(true);

use std::collections::HashMap;

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

#[tauri::command]
fn get_data_dir() -> Result<String, String> {
    let dir = get_base_dir()?;
    Ok(dir.to_string_lossy().to_string())
}

#[tauri::command]
fn read_data_file(path: String) -> Result<String, String> {
    let base = get_base_dir()?;
    let full_path = base.join(&path);
    if !full_path.starts_with(&base) {
        return Err("Invalid path".to_string());
    }
    fs::read_to_string(&full_path).map_err(|e| e.to_string())
}

#[tauri::command]
fn write_data_file(path: String, content: String) -> Result<(), String> {
    let base = get_base_dir()?;
    let full_path = base.join(&path);
    if !full_path.starts_with(&base) {
        return Err("Invalid path".to_string());
    }
    if let Some(parent) = full_path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&full_path, content).map_err(|e| e.to_string())
}

#[tauri::command]
fn send_native_notification(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())
}

// ── 数据文件列表 ──
const DATA_FILES: &[&str] = &[
    "data/items.json",
    "data/pomodoro.json",
    "data/workflow.json",
    "data/settings.json",
];

fn default_content(file: &str) -> &'static str {
    match file {
        "data/items.json" => r#"{"items":[],"nextId":1}"#,
        "data/pomodoro.json" => r#"{"pomodoroCompleted":0,"pomodoroDate":"","totalFocusSeconds":0,"focusDate":"","focusMinutes":25,"breakMinutes":5,"totalRounds":4}"#,
        "data/workflow.json" => r#"{"categories":[],"projects":[],"nextCategoryId":1,"nextProjectId":1,"nextStepId":1,"nextNodeId":1}"#,
        "data/settings.json" => r#"{"theme":"light","minimizeToTray":false,"shortcuts":[{"id":"toggle-window","label":"显示/隐藏窗口","keys":""},{"id":"toggle-pomodoro","label":"暂停/继续番茄钟","keys":""}]}"#,
        _ => "{}",
    }
}

#[tauri::command]
fn export_data(path: String, format: String) -> Result<(), String> {
    let base = get_base_dir()?;
    let mut all_data = serde_json::Map::new();

    for file_name in DATA_FILES {
        let full_path = base.join(file_name);
        if full_path.exists() {
            let content = fs::read_to_string(&full_path).map_err(|e| e.to_string())?;
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                let key = file_name
                    .trim_start_matches("data/")
                    .trim_end_matches(".json");
                all_data.insert(key.to_string(), val);
            }
        }
    }

    // 添加导出时间
    let now = format_now();
    all_data.insert("exportedAt".to_string(), serde_json::Value::String(now));

    if format == "csv" {
        // CSV 导出：仅导出事项数据
        let items_key = "items";
        let csv_output = if let Some(items_val) = all_data.get(items_key) {
            if let Some(items_arr) = items_val.as_array() {
                items_to_csv(items_arr)
            } else {
                "".to_string()
            }
        } else {
            "".to_string()
        };
        fs::write(&path, csv_output).map_err(|e| e.to_string())?;
    } else {
        // JSON 导出
        let json = serde_json::to_string_pretty(&all_data).map_err(|e| e.to_string())?;
        fs::write(&path, json).map_err(|e| e.to_string())?;
    }

    Ok(())
}

fn items_to_csv(items: &[serde_json::Value]) -> String {
    // CSV 头
    let mut csv = String::from("id,name,description,startDate,endDate,priority,createdAt,done,doneAt,repeatType\n");
    for item in items {
        let id = item.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
        let name = item.get("name").and_then(|v| v.as_str()).unwrap_or("");
        let desc = item.get("description").and_then(|v| v.as_str()).unwrap_or("");
        let start = item.get("startDate").and_then(|v| v.as_str()).unwrap_or("");
        let end = item.get("endDate").and_then(|v| v.as_str()).unwrap_or("");
        let priority = item.get("priority").and_then(|v| v.as_str()).unwrap_or("");
        let created = item.get("createdAt").and_then(|v| v.as_str()).unwrap_or("");
        let done = item.get("done").and_then(|v| v.as_bool()).unwrap_or(false);
        let done_at = item.get("doneAt").and_then(|v| v.as_str()).unwrap_or("");
        let repeat = item.get("repeatType").and_then(|v| v.as_str()).unwrap_or("");

        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{},{},{}\n",
            id,
            escape_csv(name),
            escape_csv(desc),
            start,
            end,
            priority,
            created,
            if done { "true" } else { "false" },
            done_at,
            repeat,
        ));
    }
    csv
}

fn escape_csv(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

fn format_now() -> String {
    // 简单的时间格式化，不引入 chrono 依赖
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    // 使用简单的 UTC 时间计算
    let days = secs / 86400;
    let time_secs = secs % 86400;
    let hours = time_secs / 3600;
    let mins = (time_secs % 3600) / 60;
    let secs_remain = time_secs % 60;
    format!(
        "{}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        1970 + (days as f64 / 365.25) as u64,
        1,
        1 + days as u64,
        hours,
        mins,
        secs_remain
    )
}

#[tauri::command]
fn import_data(path: String) -> Result<(), String> {
    let content = fs::read_to_string(&path).map_err(|e| format!("无法读取文件: {}", e))?;
    let data: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("文件格式无效: {}", e))?;

    let base = get_base_dir()?;

    for file_name in DATA_FILES {
        let key = file_name
            .trim_start_matches("data/")
            .trim_end_matches(".json");
        if let Some(val) = data.get(key) {
            let full_path = base.join(file_name);
            if let Some(parent) = full_path.parent() {
                fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            fs::write(
                &full_path,
                serde_json::to_string_pretty(val).map_err(|e| e.to_string())?,
            )
            .map_err(|e| e.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
fn get_autostart(app: tauri::AppHandle) -> Result<bool, String> {
    app.autolaunch().is_enabled().map_err(|e| e.to_string())
}

#[tauri::command]
fn open_data_folder() -> Result<(), String> {
    let base = get_base_dir()?;
    let path_str = base.to_string_lossy().to_string();
    std::process::Command::new("explorer")
        .arg(&path_str)
        .spawn()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn reset_all_data() -> Result<(), String> {
    let base = get_base_dir()?;

    for file_name in DATA_FILES {
        let full_path = base.join(file_name);
        if let Some(parent) = full_path.parent() {
            fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        fs::write(&full_path, default_content(file_name)).map_err(|e| e.to_string())?;
    }

    Ok(())
}

#[tauri::command]
fn set_autostart(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let autostart = app.autolaunch();
    if enabled {
        autostart.enable().map_err(|e| e.to_string())?;
    } else {
        autostart.disable().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn open_settings_window(app: tauri::AppHandle) -> Result<(), String> {
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
fn batch_read_data_files() -> Result<HashMap<String, serde_json::Value>, String> {
    let base = get_base_dir()?;
    let files = [
        ("data/settings.json", serde_json::Value::Null),
        ("data/items.json", serde_json::Value::Null),
        ("data/pomodoro.json", serde_json::Value::Null),
    ];
    let mut result = HashMap::new();
    for (path, _) in &files {
        let full_path = base.join(path);
        if let Ok(content) = fs::read_to_string(&full_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                result.insert(path.to_string(), json);
            }
        }
        // 文件不存在时，跳过（首次启动场景）
    }
    Ok(result)
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
            read_data_file,
            write_data_file,
            send_native_notification,
            export_data,
            import_data,
            reset_all_data,
            set_autostart,
            batch_read_data_files,
            set_minimize_to_tray,
            open_settings_window,
            get_autostart,
            open_data_folder,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

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
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                if window.label() == "main" && MINIMIZE_TO_TRAY.load(Ordering::SeqCst) {
                    api.prevent_close();
                    let _ = window.hide();
                } else if window.label() == "main" {
                    // 最小化到托盘关闭 → 同时关掉设置窗口，让应用退出
                    if let Some(settings) = window.app_handle().get_webview_window("settings") {
                        let _ = settings.close();
                    }
                }
                // 设置窗口：直接关闭，不影响主窗口
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
