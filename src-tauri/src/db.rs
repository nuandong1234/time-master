use rusqlite::{Connection, params};
use std::path::Path;
use serde_json::Value;
use std::collections::HashMap;

// ── 数据库初始化 ──

pub fn init_db(db_path: &str) -> Result<Connection, String> {
    log::info!("[DB] init_db  path=\"{}\"", db_path);
    let conn = Connection::open(db_path).map_err(|e| {
        log::error!("[DB] 打开数据库失败: {}", e);
        e.to_string()
    })?;

    conn.execute_batch("PRAGMA foreign_keys = ON;").map_err(|e| {
        log::error!("[DB] 启用外键约束失败: {}", e);
        e.to_string()
    })?;
    conn.execute_batch("PRAGMA journal_mode = WAL;").map_err(|e| {
        log::error!("[DB] 启用 WAL 模式失败: {}", e);
        e.to_string()
    })?;

    create_tables(&conn)?;
    // 迁移：为 item_comments 添加 images 列（兼容旧数据库）
    let _ = conn.execute_batch("ALTER TABLE item_comments ADD COLUMN images TEXT NOT NULL DEFAULT '[]';");
    log::info!("[DB] 数据库初始化完成");
    Ok(conn)
}

fn create_tables(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS items (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL DEFAULT '',
            description TEXT NOT NULL DEFAULT '',
            start_date TEXT NOT NULL DEFAULT '',
            end_date TEXT NOT NULL DEFAULT '',
            priority TEXT NOT NULL DEFAULT 'none',
            created_at TEXT NOT NULL DEFAULT '',
            done INTEGER NOT NULL DEFAULT 0,
            done_at TEXT NOT NULL DEFAULT '',
            synced INTEGER NOT NULL DEFAULT 0,
            synced_date TEXT NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            repeat_type TEXT NOT NULL DEFAULT 'none',
            workflow_project_id INTEGER,
            workflow_node_id INTEGER
        );

        CREATE TABLE IF NOT EXISTS item_comments (
            id INTEGER PRIMARY KEY,
            item_id INTEGER NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            author TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT '',
            images TEXT NOT NULL DEFAULT '[]',
            FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS settings (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS pomodoro (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            pomodoro_completed INTEGER NOT NULL DEFAULT 0,
            pomodoro_date TEXT NOT NULL DEFAULT '',
            total_focus_seconds INTEGER NOT NULL DEFAULT 0,
            focus_date TEXT NOT NULL DEFAULT '',
            focus_minutes INTEGER NOT NULL DEFAULT 25,
            break_minutes INTEGER NOT NULL DEFAULT 5,
            total_rounds INTEGER NOT NULL DEFAULT 4
        );

        CREATE TABLE IF NOT EXISTS workflow_categories (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT ''
        );

        CREATE TABLE IF NOT EXISTS workflow_projects (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL DEFAULT '',
            category_id INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'wait',
            created_at TEXT NOT NULL DEFAULT '',
            completed_at TEXT DEFAULT '',
            activated_at TEXT DEFAULT '',
            FOREIGN KEY (category_id) REFERENCES workflow_categories(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS workflow_steps (
            id INTEGER PRIMARY KEY,
            project_id INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY (project_id) REFERENCES workflow_projects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS workflow_nodes (
            id INTEGER PRIMARY KEY,
            step_id INTEGER NOT NULL DEFAULT 0,
            name TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'wait',
            description TEXT NOT NULL DEFAULT '',
            assignee TEXT NOT NULL DEFAULT '',
            start_date TEXT NOT NULL DEFAULT '',
            end_date TEXT NOT NULL DEFAULT '',
            completed_at TEXT NOT NULL DEFAULT '',
            item_id INTEGER DEFAULT NULL,
            priority TEXT NOT NULL DEFAULT 'none',
            FOREIGN KEY (step_id) REFERENCES workflow_steps(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS workflow_node_activity (
            id INTEGER PRIMARY KEY,
            node_id INTEGER NOT NULL DEFAULT 0,
            type TEXT NOT NULL DEFAULT 'system',
            author TEXT NOT NULL DEFAULT '',
            content TEXT NOT NULL DEFAULT '',
            timestamp TEXT NOT NULL DEFAULT '',
            images TEXT NOT NULL DEFAULT '[]',
            FOREIGN KEY (node_id) REFERENCES workflow_nodes(id) ON DELETE CASCADE
        );
        "
    ).map_err(|e| e.to_string())
}

// ── 全量数据加载 ──

pub fn load_all_data(conn: &Connection) -> Result<serde_json::Value, String> {
    log::debug!("[DB] load_all_data");
    let items = load_items_json(conn)?;
    let workflow = load_workflow_json(conn)?;
    let settings = load_settings_json(conn)?;
    let pomodoro = load_pomodoro_json(conn)?;

    log::info!(
        "[DB] 数据加载完成  items={}  categories={}  projects={}  settings_keys={}",
        items.get("items").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
        workflow.get("categories").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
        workflow.get("projects").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0),
        settings.as_object().map(|o| o.len()).unwrap_or(0),
    );

    let mut map = serde_json::Map::new();
    map.insert("items".to_string(), items);
    map.insert("workflow".to_string(), workflow);
    map.insert("settings".to_string(), settings);
    map.insert("pomodoro".to_string(), pomodoro);
    Ok(serde_json::Value::Object(map))
}

// ── 加载各模块数据 ──

fn load_items_json(conn: &Connection) -> Result<serde_json::Value, String> {
    // 读取 items 表
    let mut stmt = conn.prepare(
        "SELECT id, name, description, start_date, end_date, priority, created_at,
                done, done_at, synced, synced_date, sort_order, repeat_type,
                workflow_project_id, workflow_node_id
         FROM items ORDER BY id"
    ).map_err(|e| e.to_string())?;

    let rows: Vec<serde_json::Value> = stmt.query_map([], |row| {
        let id: i64 = row.get(0)?;
        let workflow_project_id: Option<i64> = row.get(13)?;
        let workflow_node_id: Option<i64> = row.get(14)?;

        Ok(serde_json::json!({
            "id": id,
            "name": row.get::<_, String>(1).unwrap_or_default(),
            "description": row.get::<_, String>(2).unwrap_or_default(),
            "startDate": row.get::<_, String>(3).unwrap_or_default(),
            "endDate": row.get::<_, String>(4).unwrap_or_default(),
            "priority": row.get::<_, String>(5).unwrap_or_default(),
            "createdAt": row.get::<_, String>(6).unwrap_or_default(),
            "done": row.get::<_, i64>(7).unwrap_or(0) != 0,
            "doneAt": row.get::<_, String>(8).unwrap_or_default(),
            "synced": row.get::<_, i64>(9).unwrap_or(0) != 0,
            "syncedDate": row.get::<_, String>(10).unwrap_or_default(),
            "sortOrder": row.get::<_, i64>(11).unwrap_or(0),
            "repeatType": row.get::<_, String>(12).unwrap_or_default(),
            "workflowRef": if let (Some(proj_id), Some(node_id)) = (workflow_project_id, workflow_node_id) {
                Some(serde_json::json!({
                    "projectId": proj_id,
                    "nodeId": node_id
                }))
            } else {
                None
            }
        }))
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    // 读取 comments
    let mut cmt_stmt = conn.prepare(
        "SELECT id, item_id, content, author, created_at, images FROM item_comments ORDER BY id"
    ).map_err(|e| e.to_string())?;

    let comments: Vec<(i64, serde_json::Value)> = cmt_stmt.query_map([], |row| {
        let item_id: i64 = row.get(1)?;
        let images_str: String = row.get::<_, String>(5).unwrap_or_default();
        let images_val: serde_json::Value = serde_json::from_str(&images_str).unwrap_or(serde_json::Value::Array(vec![]));
        Ok((item_id, serde_json::json!({
            "id": row.get::<_, i64>(0).unwrap_or(0),
            "content": row.get::<_, String>(2).unwrap_or_default(),
            "author": row.get::<_, String>(3).unwrap_or_default(),
            "createdAt": row.get::<_, String>(4).unwrap_or_default(),
            "images": images_val
        })))
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    // 将 comments 分组到 items
    let next_id = rows.iter()
        .map(|r| r.get("id").and_then(|v: &Value| v.as_i64()).unwrap_or(0))
        .max()
        .unwrap_or(0) + 1;

    let items_with_comments: Vec<serde_json::Value> = rows.into_iter().map(|mut item| {
        let id = item.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
        let item_comments: Vec<&serde_json::Value> = comments.iter()
            .filter(|(iid, _)| *iid == id)
            .map(|(_, c)| c)
            .collect();
        if !item_comments.is_empty() {
            if let Some(obj) = item.as_object_mut() {
                obj.insert("comments".to_string(), serde_json::Value::Array(
                    item_comments.into_iter().cloned().collect()
                ));
            }
        }
        item
    }).collect();

    Ok(serde_json::json!({
        "items": items_with_comments,
        "nextId": next_id
    }))
}

fn load_workflow_json(conn: &Connection) -> Result<serde_json::Value, String> {
    // 读取 categories
    let mut cat_stmt = conn.prepare(
        "SELECT id, name, created_at FROM workflow_categories ORDER BY id"
    ).map_err(|e| e.to_string())?;

    let mut categories_map: Vec<(i64, serde_json::Value)> = cat_stmt.query_map([], |row| {
        let id: i64 = row.get(0)?;
        Ok((id, serde_json::json!({
            "id": id,
            "name": row.get::<_, String>(1).unwrap_or_default(),
            "createdAt": row.get::<_, String>(2).unwrap_or_default()
        })))
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    // 加载所有 projects（含 steps、nodes、activity）
    let mut proj_stmt = conn.prepare(
        "SELECT id, name, category_id, status, created_at, completed_at, activated_at
         FROM workflow_projects ORDER BY id"
    ).map_err(|e| e.to_string())?;

    let projects: Vec<(i64, i64, serde_json::Value)> = proj_stmt.query_map([], |row| {
        let id: i64 = row.get(0)?;
        let category_id: i64 = row.get(2)?;
        Ok((id, category_id, serde_json::json!({
            "id": id,
            "name": row.get::<_, String>(1).unwrap_or_default(),
            "categoryId": category_id,
            "status": row.get::<_, String>(3).unwrap_or_default(),
            "createdAt": row.get::<_, String>(4).unwrap_or_default(),
            "completedAt": row.get::<_, String>(5).ok().filter(|s| !s.is_empty()),
            "activatedAt": row.get::<_, String>(6).ok().filter(|s| !s.is_empty()),
            "steps": serde_json::Value::Array(vec![])
        })))
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    // 读取 steps
    let mut step_stmt = conn.prepare(
        "SELECT id, project_id FROM workflow_steps ORDER BY id"
    ).map_err(|e| e.to_string())?;

    let steps: Vec<(i64, i64)> = step_stmt.query_map([], |row| {
        Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?))
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    // 读取 nodes
    let mut node_stmt = conn.prepare(
        "SELECT id, step_id, name, status, description, assignee,
                start_date, end_date, completed_at, item_id, priority
         FROM workflow_nodes ORDER BY id"
    ).map_err(|e| e.to_string())?;

    let nodes: Vec<(i64, i64, serde_json::Value)> = node_stmt.query_map([], |row| {
        let id: i64 = row.get(0)?;
        let step_id: i64 = row.get(1)?;
        let item_id: Option<i64> = row.get(9)?;
        Ok((id, step_id, serde_json::json!({
            "id": id,
            "name": row.get::<_, String>(2).unwrap_or_default(),
            "status": row.get::<_, String>(3).unwrap_or_default(),
            "description": row.get::<_, String>(4).unwrap_or_default(),
            "assignee": row.get::<_, String>(5).unwrap_or_default(),
            "startDate": row.get::<_, String>(6).unwrap_or_default(),
            "endDate": row.get::<_, String>(7).unwrap_or_default(),
            "completedAt": row.get::<_, String>(8).unwrap_or_default(),
            "itemId": item_id,
            "priority": row.get::<_, String>(10).unwrap_or_default()
        })))
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    // 读取 activity log
    let mut act_stmt = conn.prepare(
        "SELECT id, node_id, type, author, content, timestamp, images
         FROM workflow_node_activity ORDER BY id"
    ).map_err(|e| e.to_string())?;

    let activities: Vec<(i64, serde_json::Value)> = act_stmt.query_map([], |row| {
        let node_id: i64 = row.get(1)?;
        let images_str: String = row.get::<_, String>(6).unwrap_or_default();
        let images_val: serde_json::Value = serde_json::from_str(&images_str).unwrap_or(serde_json::Value::Array(vec![]));
        Ok((node_id, serde_json::json!({
            "id": row.get::<_, i64>(0).unwrap_or(0),
            "type": row.get::<_, String>(2).unwrap_or_default(),
            "author": row.get::<_, String>(3).unwrap_or_default(),
            "content": row.get::<_, String>(4).unwrap_or_default(),
            "timestamp": row.get::<_, String>(5).unwrap_or_default(),
            "images": images_val
        })))
    }).map_err(|e| e.to_string())?.filter_map(|r| r.ok()).collect();

    // 组装：activity → node → step → project（使用 HashMap 索引，O(n) 而非 O(n²)）
    // 1. activity 按 node_id 分组
    let mut act_by_node: HashMap<i64, Vec<serde_json::Value>> = HashMap::new();
    for (node_id, act) in activities {
        act_by_node.entry(node_id).or_insert_with(Vec::new).push(act);
    }

    // 2. 给 nodes 挂上 activityLog
    let nodes_with_act: Vec<(i64, i64, serde_json::Value)> = nodes.into_iter().map(|(id, step_id, mut node)| {
        if let Some(acts) = act_by_node.remove(&id) {
            if let Some(obj) = node.as_object_mut() {
                obj.insert("activityLog".to_string(), serde_json::Value::Array(acts));
            }
        }
        (id, step_id, node)
    }).collect();

    // 3. node 按 step_id 分组
    let mut node_by_step: HashMap<i64, Vec<serde_json::Value>> = HashMap::new();
    for (_, step_id, node_val) in nodes_with_act {
        node_by_step.entry(step_id).or_insert_with(Vec::new).push(node_val);
    }

    // 4. 给 steps 挂上 nodes，再按 project_id 分组
    let mut step_by_proj: HashMap<i64, Vec<serde_json::Value>> = HashMap::new();
    for &(step_id, project_id) in &steps {
        let step_nodes = node_by_step.remove(&step_id).unwrap_or_default();
        step_by_proj.entry(project_id).or_insert_with(Vec::new).push(serde_json::json!({
            "id": step_id,
            "nodes": step_nodes
        }));
    }

    // 5. 给 projects 挂上 steps，同时收集 project → category 映射
    let mut proj_by_cat: HashMap<i64, Vec<serde_json::Value>> = HashMap::new();
    let mut next_id_proj: i64 = 0;
    let projects_with_steps: Vec<serde_json::Value> = projects.into_iter().map(|(id, cat_id, mut proj)| {
        let proj_steps = step_by_proj.remove(&id).unwrap_or_default();
        if let Some(obj) = proj.as_object_mut() {
            obj.insert("steps".to_string(), serde_json::Value::Array(proj_steps));
        }
        // 同时按 category 分组，用于后续给 categories 挂 projectIds
        proj_by_cat.entry(cat_id).or_insert_with(Vec::new).push(proj.clone());
        if id > next_id_proj { next_id_proj = id; }
        proj
    }).collect();

    // 6. 给 categories 挂上 projectIds
    for (cat_id, projs) in proj_by_cat {
        if let Some((_, cat)) = categories_map.iter_mut().find(|(id, _)| *id == cat_id) {
            if let Some(obj) = cat.as_object_mut() {
                let ids: Vec<serde_json::Value> = projs.iter().map(|p| {
                    p.get("id").cloned().unwrap_or(serde_json::Value::Null)
                }).collect();
                obj.insert("projectIds".to_string(), serde_json::Value::Array(ids));
            }
        }
    }

    // 计算 nextId 值（从剩余的数据结构中提取，因为 activities/nodes_with_act 已被消费）
    let max_cat_id = categories_map.iter().map(|(id, _)| *id).max().unwrap_or(0);
    let max_proj_id = projects_with_steps.iter()
        .map(|p| p.get("id").and_then(|v| v.as_i64()).unwrap_or(0))
        .max().unwrap_or(0);
    let max_step_id = steps.iter().map(|(id, _)| *id).max().unwrap_or(0);
    let max_act_id: i64 = act_by_node.values().flat_map(|v| v.iter())
        .filter_map(|a| a.get("id").and_then(|v| v.as_i64()))
        .max().unwrap_or(0);
    let max_node_id: i64 = node_by_step.values().flat_map(|v| v.iter())
        .filter_map(|n| n.get("id").and_then(|v| v.as_i64()))
        .max().unwrap_or(0);
    let max_node_id = max_act_id.max(max_node_id);

    let categories: Vec<serde_json::Value> = categories_map.into_iter()
        .map(|(_, v)| {
            // 确保每个 category 有 projectIds
            let mut obj = v;
            if obj.get("projectIds").is_none() {
                if let Some(o) = obj.as_object_mut() {
                    o.insert("projectIds".to_string(), serde_json::Value::Array(vec![]));
                }
            }
            obj
        })
        .collect();

    Ok(serde_json::json!({
        "categories": categories,
        "projects": projects_with_steps,
        "nextCategoryId": max_cat_id + 1,
        "nextProjectId": max_proj_id + 1,
        "nextStepId": max_step_id + 1,
        "nextNodeId": max_node_id + 1,
        "selectedProjectId": 0,
        "selectedStepIdx": 0
    }))
}

fn load_settings_json(conn: &Connection) -> Result<serde_json::Value, String> {
    let mut stmt = conn.prepare("SELECT key, value FROM settings")
        .map_err(|e| e.to_string())?;

    let mut map = serde_json::Map::new();
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }).map_err(|e| e.to_string())?;

    for row in rows {
        let (key, value) = row.map_err(|e| e.to_string())?;
        // 尝试解析 JSON value
        if let Ok(val) = serde_json::from_str::<serde_json::Value>(&value) {
            map.insert(key, val);
        } else {
            map.insert(key, serde_json::Value::String(value));
        }
    }

    Ok(serde_json::Value::Object(map))
}

fn load_pomodoro_json(conn: &Connection) -> Result<serde_json::Value, String> {
    let result = conn.query_row(
        "SELECT pomodoro_completed, pomodoro_date, total_focus_seconds, focus_date,
                focus_minutes, break_minutes, total_rounds
         FROM pomodoro WHERE id = 1",
        [],
        |row| {
            Ok(serde_json::json!({
                "pomodoroCompleted": row.get::<_, i64>(0).unwrap_or(0),
                "pomodoroDate": row.get::<_, String>(1).unwrap_or_default(),
                "totalFocusSeconds": row.get::<_, i64>(2).unwrap_or(0),
                "focusDate": row.get::<_, String>(3).unwrap_or_default(),
                "focusMinutes": row.get::<_, i64>(4).unwrap_or(25),
                "breakMinutes": row.get::<_, i64>(5).unwrap_or(5),
                "totalRounds": row.get::<_, i64>(6).unwrap_or(4)
            }))
        }
    );

    match result {
        Ok(val) => Ok(val),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(serde_json::json!({
            "pomodoroCompleted": 0,
            "pomodoroDate": "",
            "totalFocusSeconds": 0,
            "focusDate": "",
            "focusMinutes": 25,
            "breakMinutes": 5,
            "totalRounds": 4
        })),
        Err(e) => Err(e.to_string())
    }
}

// ── 保存各数据模块 ──

pub fn save_items(conn: &Connection, json_str: &str) -> Result<(), String> {
    log::debug!("[DB] save_items");
    let data: serde_json::Value = serde_json::from_str(json_str).map_err(|e| {
        log::error!("[DB] save_items JSON 解析失败: {}", e);
        e.to_string()
    })?;

    let tx = conn.unchecked_transaction().map_err(|e| {
        log::error!("[DB] save_items 事务启动失败: {}", e);
        e.to_string()
    })?;

    // 清空原有数据
    tx.execute("DELETE FROM item_comments", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM items", []).map_err(|e| e.to_string())?;

    // 插入 items
    if let Some(items) = data.get("items").and_then(|v| v.as_array()) {
        let mut insert_item = tx.prepare(
            "INSERT INTO items (id, name, description, start_date, end_date, priority,
             created_at, done, done_at, synced, synced_date, sort_order, repeat_type,
             workflow_project_id, workflow_node_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)"
        ).map_err(|e| e.to_string())?;

        let mut insert_comment = tx.prepare(
            "INSERT INTO item_comments (id, item_id, content, author, created_at, images)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
        ).map_err(|e| e.to_string())?;

        for item in items {
            let workflow_ref = item.get("workflowRef");
            let (wp_id, wn_id): (Option<i64>, Option<i64>) = workflow_ref
                .and_then(|r| r.as_object())
                .map(|r| (
                    r.get("projectId").and_then(|v| v.as_i64()),
                    r.get("nodeId").and_then(|v| v.as_i64())
                ))
                .unwrap_or((None, None));

            let done = if item.get("done").and_then(|v| v.as_bool()).unwrap_or(false) { 1 } else { 0 };
            let synced = if item.get("synced").and_then(|v| v.as_bool()).unwrap_or(false) { 1 } else { 0 };

            insert_item.execute(params![
                item.get("id").and_then(|v| v.as_i64()).unwrap_or(0),
                item.get("name").and_then(|v| v.as_str()).unwrap_or(""),
                item.get("description").and_then(|v| v.as_str()).unwrap_or(""),
                item.get("startDate").and_then(|v| v.as_str()).unwrap_or(""),
                item.get("endDate").and_then(|v| v.as_str()).unwrap_or(""),
                item.get("priority").and_then(|v| v.as_str()).unwrap_or("none"),
                item.get("createdAt").and_then(|v| v.as_str()).unwrap_or(""),
                done,
                item.get("doneAt").and_then(|v| v.as_str()).unwrap_or(""),
                synced,
                item.get("syncedDate").and_then(|v| v.as_str()).unwrap_or(""),
                item.get("sortOrder").and_then(|v| v.as_i64()).unwrap_or(0),
                item.get("repeatType").and_then(|v| v.as_str()).unwrap_or("none"),
                wp_id,
                wn_id,
            ]).map_err(|e| e.to_string())?;

            // 插入 comments
            if let Some(comments) = item.get("comments").and_then(|v| v.as_array()) {
                for comment in comments {
                    let images = comment.get("images")
                        .map(|v| v.to_string())
                        .unwrap_or_else(|| "[]".to_string());
                    insert_comment.execute(params![
                        comment.get("id").and_then(|v| v.as_i64()).unwrap_or(0),
                        item.get("id").and_then(|v| v.as_i64()).unwrap_or(0),
                        comment.get("content").and_then(|v| v.as_str()).unwrap_or(""),
                        comment.get("author").and_then(|v| v.as_str()).unwrap_or(""),
                        comment.get("createdAt").and_then(|v| v.as_str()).unwrap_or(""),
                        images,
                    ]).map_err(|e| e.to_string())?;
                }
            }
        }
    }

    tx.commit().map_err(|e| {
        log::error!("[DB] save_items 事务提交失败: {}", e);
        e.to_string()
    })?;
    log::debug!("[DB] save_items 完成");
    Ok(())
}

pub fn save_workflow(conn: &Connection, json_str: &str) -> Result<(), String> {
    log::debug!("[DB] save_workflow");
    let data: serde_json::Value = serde_json::from_str(json_str).map_err(|e| {
        log::error!("[DB] save_workflow JSON 解析失败: {}", e);
        e.to_string()
    })?;

    let tx = conn.unchecked_transaction().map_err(|e| {
        log::error!("[DB] save_workflow 事务启动失败: {}", e);
        e.to_string()
    })?;

    // 清空原有数据（按外键顺序，先删子表）
    tx.execute("DELETE FROM workflow_node_activity", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM workflow_nodes", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM workflow_steps", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM workflow_projects", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM workflow_categories", []).map_err(|e| e.to_string())?;

    // 插入 categories
    if let Some(categories) = data.get("categories").and_then(|v| v.as_array()) {
        let mut insert_cat = tx.prepare(
            "INSERT INTO workflow_categories (id, name, created_at) VALUES (?1, ?2, ?3)"
        ).map_err(|e| e.to_string())?;

        for cat in categories {
            insert_cat.execute(params![
                cat.get("id").and_then(|v| v.as_i64()).unwrap_or(0),
                cat.get("name").and_then(|v| v.as_str()).unwrap_or(""),
                cat.get("createdAt").and_then(|v| v.as_str()).unwrap_or(""),
            ]).map_err(|e| e.to_string())?;
        }
    }

    // 插入 projects
    if let Some(projects) = data.get("projects").and_then(|v| v.as_array()) {
        let mut insert_proj = tx.prepare(
            "INSERT INTO workflow_projects (id, name, category_id, status, created_at, completed_at, activated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
        ).map_err(|e| e.to_string())?;

        let mut insert_step = tx.prepare(
            "INSERT INTO workflow_steps (id, project_id) VALUES (?1, ?2)"
        ).map_err(|e| e.to_string())?;

        let mut insert_node = tx.prepare(
            "INSERT INTO workflow_nodes (id, step_id, name, status, description, assignee,
             start_date, end_date, completed_at, item_id, priority)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)"
        ).map_err(|e| e.to_string())?;

        let mut insert_act = tx.prepare(
            "INSERT INTO workflow_node_activity (id, node_id, type, author, content, timestamp, images)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
        ).map_err(|e| e.to_string())?;

        for proj in projects {
            let completed_at = proj.get("completedAt").and_then(|v| v.as_str());
            let activated_at = proj.get("activatedAt").and_then(|v| v.as_str());

            insert_proj.execute(params![
                proj.get("id").and_then(|v| v.as_i64()).unwrap_or(0),
                proj.get("name").and_then(|v| v.as_str()).unwrap_or(""),
                proj.get("categoryId").and_then(|v| v.as_i64()).unwrap_or(0),
                proj.get("status").and_then(|v| v.as_str()).unwrap_or("wait"),
                proj.get("createdAt").and_then(|v| v.as_str()).unwrap_or(""),
                completed_at,
                activated_at,
            ]).map_err(|e| e.to_string())?;

            // 插入 steps
            if let Some(steps) = proj.get("steps").and_then(|v| v.as_array()) {
                for step in steps {
                    let step_id = step.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
                    let proj_id = proj.get("id").and_then(|v| v.as_i64()).unwrap_or(0);

                    insert_step.execute(params![step_id, proj_id])
                        .map_err(|e| e.to_string())?;

                    // 插入 nodes
                    if let Some(nodes) = step.get("nodes").and_then(|v| v.as_array()) {
                        for node in nodes.iter() {
                            let node_id = node.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
                            insert_node.execute(params![
                                node_id,
                                step_id,
                                node.get("name").and_then(|v| v.as_str()).unwrap_or(""),
                                node.get("status").and_then(|v| v.as_str()).unwrap_or("wait"),
                                node.get("description").and_then(|v| v.as_str()).unwrap_or(""),
                                node.get("assignee").and_then(|v| v.as_str()).unwrap_or(""),
                                node.get("startDate").and_then(|v| v.as_str()).unwrap_or(""),
                                node.get("endDate").and_then(|v| v.as_str()).unwrap_or(""),
                                node.get("completedAt").and_then(|v| v.as_str()).unwrap_or(""),
                                node.get("itemId").and_then(|v| v.as_i64()),
                                node.get("priority").and_then(|v| v.as_str()).unwrap_or("none"),
                            ]).map_err(|e| e.to_string())?;

                            // 插入 activity logs
                            if let Some(activities) = node.get("activityLog").and_then(|v| v.as_array()) {
                                for act in activities {
                                    let images = act.get("images")
                                        .map(|v| v.to_string())
                                        .unwrap_or_else(|| "[]".to_string());
                                    insert_act.execute(params![
                                        act.get("id").and_then(|v| v.as_i64()).unwrap_or(0),
                                        node_id,
                                        act.get("type").and_then(|v| v.as_str()).unwrap_or("system"),
                                        act.get("author").and_then(|v| v.as_str()).unwrap_or(""),
                                        act.get("content").and_then(|v| v.as_str()).unwrap_or(""),
                                        act.get("timestamp").and_then(|v| v.as_str()).unwrap_or(""),
                                        images,
                                    ]).map_err(|e| e.to_string())?;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    log::debug!("[DB] save_workflow 完成");
    Ok(())
}

pub fn save_settings(conn: &Connection, json_str: &str) -> Result<(), String> {
    log::debug!("[DB] save_settings");
    let data: serde_json::Value = serde_json::from_str(json_str).map_err(|e| {
        log::error!("[DB] save_settings JSON 解析失败: {}", e);
        e.to_string()
    })?;

    let tx = conn.unchecked_transaction().map_err(|e| {
        log::error!("[DB] save_settings 事务启动失败: {}", e);
        e.to_string()
    })?;
    tx.execute("DELETE FROM settings", []).map_err(|e| e.to_string())?;

    if let Some(obj) = data.as_object() {
        let mut insert = tx.prepare("INSERT INTO settings (key, value) VALUES (?1, ?2)")
            .map_err(|e| e.to_string())?;

        for (key, value) in obj {
            let value_str = if value.is_string() {
                value.as_str().unwrap().to_string()
            } else {
                value.to_string()
            };
            insert.execute(params![key, value_str]).map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;
    log::debug!("[DB] save_settings 完成");
    Ok(())
}

pub fn save_pomodoro(conn: &Connection, json_str: &str) -> Result<(), String> {
    log::debug!("[DB] save_pomodoro");
    let data: serde_json::Value = serde_json::from_str(json_str).map_err(|e| {
        log::error!("[DB] save_pomodoro JSON 解析失败: {}", e);
        e.to_string()
    })?;

    conn.execute(
        "INSERT OR REPLACE INTO pomodoro (id, pomodoro_completed, pomodoro_date,
         total_focus_seconds, focus_date, focus_minutes, break_minutes, total_rounds)
         VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            data.get("pomodoroCompleted").and_then(|v| v.as_i64()).unwrap_or(0),
            data.get("pomodoroDate").and_then(|v| v.as_str()).unwrap_or(""),
            data.get("totalFocusSeconds").and_then(|v| v.as_i64()).unwrap_or(0),
            data.get("focusDate").and_then(|v| v.as_str()).unwrap_or(""),
            data.get("focusMinutes").and_then(|v| v.as_i64()).unwrap_or(25),
            data.get("breakMinutes").and_then(|v| v.as_i64()).unwrap_or(5),
            data.get("totalRounds").and_then(|v| v.as_i64()).unwrap_or(4),
        ]
    ).map_err(|e| {
        log::error!("[DB] save_pomodoro 写入失败: {}", e);
        e.to_string()
    })?;

    log::debug!("[DB] save_pomodoro 完成");
    Ok(())
}

// ── 重置、导入、导出 ──

pub fn reset_all(conn: &Connection) -> Result<(), String> {
    log::warn!("[DB] reset_all — 清空所有数据");
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM workflow_node_activity", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM workflow_nodes", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM workflow_steps", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM workflow_projects", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM workflow_categories", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM item_comments", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM items", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM settings", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM pomodoro", []).map_err(|e| e.to_string())?;
    tx.commit().map_err(|e| e.to_string())
}

pub fn export_json(conn: &Connection) -> Result<String, String> {
    let all = load_all_data(conn)?;
    let mut map = serde_json::Map::new();
    if let Some(obj) = all.as_object() {
        for (_, val) in obj {
            // flatten: items → {items, nextId}, workflow → {categories, projects, ...}
            if let Some(inner) = val.as_object() {
                for (k, v) in inner {
                    map.insert(k.clone(), v.clone());
                }
            }
        }
    }
    // 添加导出时间
    map.insert("exportedAt".to_string(), serde_json::Value::String(format_now()));
    serde_json::to_string_pretty(&map).map_err(|e| e.to_string())
}

pub fn export_csv(conn: &Connection) -> Result<String, String> {
    let mut stmt = conn.prepare(
        "SELECT id, name, description, start_date, end_date, priority, created_at,
                done, done_at, repeat_type
         FROM items ORDER BY id"
    ).map_err(|e| e.to_string())?;

    let mut csv = String::from("id,name,description,startDate,endDate,priority,createdAt,done,doneAt,repeatType\n");
    let rows = stmt.query_map([], |row| {
        let id: i64 = row.get(0)?;
        let done: i64 = row.get(7)?;
        Ok(format!(
            "{},{},{},{},{},{},{},{},{},{}\n",
            id,
            escape_csv(&row.get::<_, String>(1).unwrap_or_default()),
            escape_csv(&row.get::<_, String>(2).unwrap_or_default()),
            row.get::<_, String>(3).unwrap_or_default(),
            row.get::<_, String>(4).unwrap_or_default(),
            row.get::<_, String>(5).unwrap_or_default(),
            row.get::<_, String>(6).unwrap_or_default(),
            if done != 0 { "true" } else { "false" },
            row.get::<_, String>(8).unwrap_or_default(),
            row.get::<_, String>(9).unwrap_or_default(),
        ))
    }).map_err(|e| e.to_string())?;

    for row in rows {
        csv.push_str(&row.map_err(|e| e.to_string())?);
    }
    Ok(csv)
}

pub fn import_json(conn: &Connection, json_str: &str) -> Result<(), String> {
    let data: serde_json::Value = serde_json::from_str(json_str).map_err(|e| format!("文件格式无效: {}", e))?;

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    // 导入 items
    if let Some(items) = data.get("items").and_then(|v| v.as_array()) {
        let json = serde_json::json!({ "items": items, "nextId": data.get("nextId").unwrap_or(&serde_json::Value::Null) });
        save_items_in_tx(&tx, &json.to_string())?;
    }

    // 导入 workflow
    let mut has_workflow = false;
    let mut wf_parts = serde_json::Map::new();
    for key in &["categories", "projects", "nextCategoryId", "nextProjectId", "nextStepId", "nextNodeId"] {
        if let Some(val) = data.get(*key) {
            wf_parts.insert(key.to_string(), val.clone());
            has_workflow = true;
        }
    }
    if has_workflow {
        save_workflow_in_tx(&tx, &serde_json::Value::Object(wf_parts).to_string())?;
    }

    // 导入 settings
    let mut has_settings = false;
    let mut settings_map = serde_json::Map::new();
    for key in &["theme", "minimizeToTray", "windowSize", "customWindowWidth", "customWindowHeight"] {
        if let Some(val) = data.get(*key) {
            settings_map.insert(key.to_string(), val.clone());
            has_settings = true;
        }
    }
    if has_settings {
        save_settings_in_tx(&tx, &serde_json::Value::Object(settings_map).to_string())?;
    }

    // 导入 pomodoro
    let mut has_pomo = false;
    let mut pomo_map = serde_json::Map::new();
    for key in &["pomodoroCompleted", "pomodoroDate", "totalFocusSeconds", "focusDate", "focusMinutes", "breakMinutes", "totalRounds"] {
        if data.get(*key).is_some() {
            let _ = key;
            has_pomo = true;
        }
    }
    if data.get("pomodoroCompleted").is_some() {
        for key in &["pomodoroCompleted", "pomodoroDate", "totalFocusSeconds", "focusDate", "focusMinutes", "breakMinutes", "totalRounds"] {
            if let Some(val) = data.get(*key) {
                pomo_map.insert(key.to_string(), val.clone());
            }
        }
        has_pomo = true;
    }
    if has_pomo {
        save_pomodoro_in_tx(&tx, &serde_json::Value::Object(pomo_map).to_string())?;
    }

    tx.commit().map_err(|e| e.to_string())
}

// ── 内部工具函数（事务内用） ──

fn save_items_in_tx(tx: &rusqlite::Transaction, json_str: &str) -> Result<(), String> {
    let data: serde_json::Value = serde_json::from_str(json_str).map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM item_comments", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM items", []).map_err(|e| e.to_string())?;

    if let Some(items) = data.get("items").and_then(|v| v.as_array()) {
        let mut insert_item = tx.prepare(
            "INSERT INTO items (id, name, description, start_date, end_date, priority,
             created_at, done, done_at, synced, synced_date, sort_order, repeat_type,
             workflow_project_id, workflow_node_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)"
        ).map_err(|e| e.to_string())?;

        let mut insert_comment = tx.prepare(
            "INSERT INTO item_comments (id, item_id, content, author, created_at, images)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)"
        ).map_err(|e| e.to_string())?;

        for item in items {
            let workflow_ref = item.get("workflowRef");
            let (wp_id, wn_id): (Option<i64>, Option<i64>) = workflow_ref
                .and_then(|r| r.as_object())
                .map(|r| (
                    r.get("projectId").and_then(|v| v.as_i64()),
                    r.get("nodeId").and_then(|v| v.as_i64())
                ))
                .unwrap_or((None, None));

            let done = if item.get("done").and_then(|v| v.as_bool()).unwrap_or(false) { 1 } else { 0 };
            let synced = if item.get("synced").and_then(|v| v.as_bool()).unwrap_or(false) { 1 } else { 0 };

            insert_item.execute(params![
                item.get("id").and_then(|v| v.as_i64()).unwrap_or(0),
                item.get("name").and_then(|v| v.as_str()).unwrap_or(""),
                item.get("description").and_then(|v| v.as_str()).unwrap_or(""),
                item.get("startDate").and_then(|v| v.as_str()).unwrap_or(""),
                item.get("endDate").and_then(|v| v.as_str()).unwrap_or(""),
                item.get("priority").and_then(|v| v.as_str()).unwrap_or("none"),
                item.get("createdAt").and_then(|v| v.as_str()).unwrap_or(""),
                done,
                item.get("doneAt").and_then(|v| v.as_str()).unwrap_or(""),
                synced,
                item.get("syncedDate").and_then(|v| v.as_str()).unwrap_or(""),
                item.get("sortOrder").and_then(|v| v.as_i64()).unwrap_or(0),
                item.get("repeatType").and_then(|v| v.as_str()).unwrap_or("none"),
                wp_id,
                wn_id,
            ]).map_err(|e| e.to_string())?;

            if let Some(comments) = item.get("comments").and_then(|v| v.as_array()) {
                for comment in comments {
                    let images = comment.get("images")
                        .map(|v| v.to_string())
                        .unwrap_or_else(|| "[]".to_string());
                    insert_comment.execute(params![
                        comment.get("id").and_then(|v| v.as_i64()).unwrap_or(0),
                        item.get("id").and_then(|v| v.as_i64()).unwrap_or(0),
                        comment.get("content").and_then(|v| v.as_str()).unwrap_or(""),
                        comment.get("author").and_then(|v| v.as_str()).unwrap_or(""),
                        comment.get("createdAt").and_then(|v| v.as_str()).unwrap_or(""),
                        images,
                    ]).map_err(|e| e.to_string())?;
                }
            }
        }
    }
    Ok(())
}

fn save_workflow_in_tx(tx: &rusqlite::Transaction, json_str: &str) -> Result<(), String> {
    let data: serde_json::Value = serde_json::from_str(json_str).map_err(|e| e.to_string())?;

    tx.execute("DELETE FROM workflow_node_activity", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM workflow_nodes", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM workflow_steps", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM workflow_projects", []).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM workflow_categories", []).map_err(|e| e.to_string())?;

    if let Some(categories) = data.get("categories").and_then(|v| v.as_array()) {
        let mut insert_cat = tx.prepare(
            "INSERT INTO workflow_categories (id, name, created_at) VALUES (?1, ?2, ?3)"
        ).map_err(|e| e.to_string())?;
        for cat in categories {
            insert_cat.execute(params![
                cat.get("id").and_then(|v| v.as_i64()).unwrap_or(0),
                cat.get("name").and_then(|v| v.as_str()).unwrap_or(""),
                cat.get("createdAt").and_then(|v| v.as_str()).unwrap_or(""),
            ]).map_err(|e| e.to_string())?;
        }
    }

    if let Some(projects) = data.get("projects").and_then(|v| v.as_array()) {
        let mut insert_proj = tx.prepare(
            "INSERT INTO workflow_projects (id, name, category_id, status, created_at, completed_at, activated_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
        ).map_err(|e| e.to_string())?;
        let mut insert_step = tx.prepare(
            "INSERT INTO workflow_steps (id, project_id) VALUES (?1, ?2)"
        ).map_err(|e| e.to_string())?;
        let mut insert_node = tx.prepare(
            "INSERT INTO workflow_nodes (id, step_id, name, status, description, assignee,
             start_date, end_date, completed_at, item_id, priority)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)"
        ).map_err(|e| e.to_string())?;
        let mut insert_act = tx.prepare(
            "INSERT INTO workflow_node_activity (id, node_id, type, author, content, timestamp, images)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)"
        ).map_err(|e| e.to_string())?;

        for proj in projects {
            insert_proj.execute(params![
                proj.get("id").and_then(|v| v.as_i64()).unwrap_or(0),
                proj.get("name").and_then(|v| v.as_str()).unwrap_or(""),
                proj.get("categoryId").and_then(|v| v.as_i64()).unwrap_or(0),
                proj.get("status").and_then(|v| v.as_str()).unwrap_or("wait"),
                proj.get("createdAt").and_then(|v| v.as_str()).unwrap_or(""),
                proj.get("completedAt").and_then(|v| v.as_str()),
                proj.get("activatedAt").and_then(|v| v.as_str()),
            ]).map_err(|e| e.to_string())?;

            if let Some(steps) = proj.get("steps").and_then(|v| v.as_array()) {
                for step in steps {
                    let step_id = step.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
                    let proj_id = proj.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
                    insert_step.execute(params![step_id, proj_id]).map_err(|e| e.to_string())?;

                    if let Some(nodes) = step.get("nodes").and_then(|v| v.as_array()) {
                        for node in nodes {
                            let node_id = node.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
                            insert_node.execute(params![
                                node_id, step_id,
                                node.get("name").and_then(|v| v.as_str()).unwrap_or(""),
                                node.get("status").and_then(|v| v.as_str()).unwrap_or("wait"),
                                node.get("description").and_then(|v| v.as_str()).unwrap_or(""),
                                node.get("assignee").and_then(|v| v.as_str()).unwrap_or(""),
                                node.get("startDate").and_then(|v| v.as_str()).unwrap_or(""),
                                node.get("endDate").and_then(|v| v.as_str()).unwrap_or(""),
                                node.get("completedAt").and_then(|v| v.as_str()).unwrap_or(""),
                                node.get("itemId").and_then(|v| v.as_i64()),
                                node.get("priority").and_then(|v| v.as_str()).unwrap_or("none"),
                            ]).map_err(|e| e.to_string())?;

                            if let Some(activities) = node.get("activityLog").and_then(|v| v.as_array()) {
                                for act in activities {
                                    let images = act.get("images")
                                        .map(|v| v.to_string())
                                        .unwrap_or_else(|| "[]".to_string());
                                    insert_act.execute(params![
                                        act.get("id").and_then(|v| v.as_i64()).unwrap_or(0),
                                        node_id,
                                        act.get("type").and_then(|v| v.as_str()).unwrap_or("system"),
                                        act.get("author").and_then(|v| v.as_str()).unwrap_or(""),
                                        act.get("content").and_then(|v| v.as_str()).unwrap_or(""),
                                        act.get("timestamp").and_then(|v| v.as_str()).unwrap_or(""),
                                        images,
                                    ]).map_err(|e| e.to_string())?;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(())
}

fn save_settings_in_tx(tx: &rusqlite::Transaction, json_str: &str) -> Result<(), String> {
    let data: serde_json::Value = serde_json::from_str(json_str).map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM settings", []).map_err(|e| e.to_string())?;
    if let Some(obj) = data.as_object() {
        let mut insert = tx.prepare("INSERT INTO settings (key, value) VALUES (?1, ?2)")
            .map_err(|e| e.to_string())?;
        for (key, value) in obj {
            let value_str = if value.is_string() {
                value.as_str().unwrap().to_string()
            } else {
                value.to_string()
            };
            insert.execute(params![key, value_str]).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn save_pomodoro_in_tx(tx: &rusqlite::Transaction, json_str: &str) -> Result<(), String> {
    let data: serde_json::Value = serde_json::from_str(json_str).map_err(|e| e.to_string())?;
    tx.execute(
        "INSERT OR REPLACE INTO pomodoro (id, pomodoro_completed, pomodoro_date,
         total_focus_seconds, focus_date, focus_minutes, break_minutes, total_rounds)
         VALUES (1, ?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            data.get("pomodoroCompleted").and_then(|v| v.as_i64()).unwrap_or(0),
            data.get("pomodoroDate").and_then(|v| v.as_str()).unwrap_or(""),
            data.get("totalFocusSeconds").and_then(|v| v.as_i64()).unwrap_or(0),
            data.get("focusDate").and_then(|v| v.as_str()).unwrap_or(""),
            data.get("focusMinutes").and_then(|v| v.as_i64()).unwrap_or(25),
            data.get("breakMinutes").and_then(|v| v.as_i64()).unwrap_or(5),
            data.get("totalRounds").and_then(|v| v.as_i64()).unwrap_or(4),
        ]
    ).map_err(|e| e.to_string())?;
    Ok(())
}

// ── 从旧 JSON 文件迁移 ──

pub fn migrate_from_json(conn: &Connection, base_dir: &Path) -> Result<bool, String> {
    let db_path = base_dir.join("data").join("timemaster.db");
    // 如果 DB 已存在且有数据，不迁移
    if db_path.exists() {
        let count: i64 = conn.query_row("SELECT COUNT(*) FROM items", [], |row| row.get(0))
            .unwrap_or(0);
        if count > 0 {
            log::info!("[DB] 迁移跳过: 数据库已有 {} 条 items", count);
            return Ok(false); // 已有数据，不需要迁移
        }
    }

    let data_dir = base_dir.join("data");
    let files = [
        ("items.json", "items"),
        ("workflow.json", "workflow"),
        ("settings.json", "settings"),
        ("pomodoro.json", "pomodoro"),
    ];

    let mut migrated = false;

    for (file_name, section) in &files {
        let file_path = data_dir.join(file_name);
        if !file_path.exists() {
            log::debug!("[DB] 迁移: {} 不存在，跳过", file_name);
            continue;
        }

        let content = match std::fs::read_to_string(&file_path) {
            Ok(c) => c,
            Err(_) => {
                log::warn!("[DB] 迁移: 无法读取 {}", file_name);
                continue;
            }
        };

        if content.trim().is_empty() || content == "{}" {
            log::debug!("[DB] 迁移: {} 为空，跳过", file_name);
            continue;
        }

        migrated = true;
        log::info!("[DB] 迁移: 正在迁移 {}", file_name);

        match *section {
            "items" => {
                // 解析 JSON，提取 items 和 pomodoro（旧版迁移）
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    // 检查是否有旧版 pomodoro 数据混在 items.json 里
                    let has_pomo = val.get("pomodoroCompleted").is_some();
                    if has_pomo {
                        let mut pomo_map = serde_json::Map::new();
                        pomo_map.insert("pomodoroCompleted".to_string(), val.get("pomodoroCompleted").cloned().unwrap_or(serde_json::Value::Number(serde_json::Number::from(0))));
                        pomo_map.insert("pomodoroDate".to_string(), val.get("pomodoroDate").cloned().unwrap_or(serde_json::Value::String(String::new())));
                        pomo_map.insert("totalFocusSeconds".to_string(), val.get("totalFocusSeconds").cloned().unwrap_or(serde_json::Value::Number(serde_json::Number::from(0))));
                        pomo_map.insert("focusDate".to_string(), val.get("focusDate").cloned().unwrap_or(serde_json::Value::String(String::new())));
                        pomo_map.insert("focusMinutes".to_string(), val.get("focusMinutes").cloned().unwrap_or(serde_json::Value::Number(serde_json::Number::from(25))));
                        pomo_map.insert("breakMinutes".to_string(), val.get("breakMinutes").cloned().unwrap_or(serde_json::Value::Number(serde_json::Number::from(5))));
                        pomo_map.insert("totalRounds".to_string(), val.get("totalRounds").cloned().unwrap_or(serde_json::Value::Number(serde_json::Number::from(4))));
                        let pomo_json = serde_json::Value::Object(pomo_map);
                        let _ = save_pomodoro(conn, &pomo_json.to_string());
                    }
                    let items_json = serde_json::json!({
                        "items": val.get("items").unwrap_or(&serde_json::Value::Array(vec![])),
                        "nextId": val.get("nextId").unwrap_or(&serde_json::Value::Number(serde_json::Number::from(1)))
                    });
                    let _ = save_items(conn, &items_json.to_string());
                }
            }
            "workflow" => {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    let _ = save_workflow(conn, &val.to_string());
                }
            }
            "settings" => {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    let _ = save_settings(conn, &val.to_string());
                }
            }
            "pomodoro" => {
                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                    let _ = save_pomodoro(conn, &val.to_string());
                }
            }
            _ => {}
        }
    }

    if migrated {
        log::info!("[DB] 迁移完成");
    } else {
        log::debug!("[DB] 迁移: 无文件需要迁移");
    }

    Ok(migrated)
}

// ── 工具函数 ──

fn escape_csv(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

fn format_now() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    // ISO 8601
    let days = secs / 86400;
    let time_secs = secs % 86400;
    let hours = time_secs / 3600;
    let mins = (time_secs % 3600) / 60;
    let secs_remain = time_secs % 60;
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        1970 + (days as f64 / 365.25) as u64,
        1,
        1 + days,
        hours,
        mins,
        secs_remain
    )
}