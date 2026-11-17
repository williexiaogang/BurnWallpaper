use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Manager};

use crate::db::WallpaperRecord;
use crate::AppState;

/// Built-in wallpapers embedded so the backend rotation pool can include them.
const BUNDLED: &[(&str, i64, &str, &str, &[u8])] = &[
    ("street-bounce", 4, "Furry AJ", "STREET BOUNCE", include_bytes!("../../public/wallpapers/street-bounce.webp")),
    ("forest-guard", 5, "自由", "STILL PEAK", include_bytes!("../../public/wallpapers/forest-guard.webp")),
    ("hammer-bear", 6, "Furry AJ", "BEAR · HAMMER", include_bytes!("../../public/wallpapers/hammer-bear.webp")),
    ("court-wolf", 7, "Furry AJ", "WOLF · BREAK THE LINE", include_bytes!("../../public/wallpapers/court-wolf.webp")),
];

pub fn ensure_bundled_wallpapers(state: &AppState) -> Result<(), String> {
    let dir = state.data_dir.join("wallpapers").join("bundled");
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建内置壁纸目录失败:{e}"))?;
    for (id, issue, title, english, bytes) in BUNDLED {
        let path = dir.join(format!("{id}.webp"));
        if !path.exists() {
            std::fs::write(&path, bytes).map_err(|e| format!("写入内置壁纸失败:{e}"))?;
        }
        let record = WallpaperRecord {
            id: (*id).to_string(),
            issue: *issue,
            title: (*title).to_string(),
            english: (*english).to_string(),
            prompt: String::new(),
            model: "bundled".to_string(),
            aspect_ratio: "16:9".to_string(),
            resolution: "bundled".to_string(),
            image_path: path.to_string_lossy().into_owned(),
            folder: String::new(),
            created_at: 0,
        };
        state
            .db
            .lock()
            .map_err(|e| e.to_string())?
            .insert_wallpaper_ignore(&record)?;
    }
    Ok(())
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PoolItem {
    pub id: String,
    pub path: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct TimelineSlot {
    pub wallpaper_id: String,
    pub start: u32,
}

#[derive(Clone, Debug)]
pub struct RotationQuery {
    pub enabled: bool,
    pub rule: String,
    pub interval_secs: u64,
    pub now_unix: i64,
    pub last_rotation_unix: Option<i64>,
    pub last_id: String,
    pub last_day: String,
    pub today: String,
    pub hour: u32,
    pub fixed_key: String,
    pub pool: Vec<PoolItem>,
    pub timeline: Vec<TimelineSlot>,
    pub catalog: Vec<PoolItem>,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RotationPlan {
    Idle,
    /// Interval mode has no stored clock yet. Start it without changing the desktop.
    RememberClock { unix: i64 },
    Apply { id: String, path: String, unix: i64, day: String, fixed_key: String },
}

fn next_in_pool<'a>(pool: &'a [PoolItem], last_id: &str) -> Option<&'a PoolItem> {
    if pool.is_empty() {
        return None;
    }
    let index = pool.iter().position(|item| item.id == last_id);
    Some(match index {
        Some(index) => &pool[(index + 1) % pool.len()],
        None => &pool[0],
    })
}

fn active_slot(timeline: &[TimelineSlot], hour: u32) -> Option<&TimelineSlot> {
    timeline
        .iter()
        .filter(|slot| {
            let start = slot.start.min(23);
            let end = start.saturating_add(4).min(24);
            hour >= start && hour < end
        })
        .max_by_key(|slot| slot.start)
}

/// Pure schedule. `fixed` follows the saved timeline, `daily` changes once per local day,
/// and `random` is the interval playlist (the UI label is「每隔一阵」).
pub fn decide_rotation(query: &RotationQuery) -> RotationPlan {
    if !query.enabled {
        return RotationPlan::Idle;
    }
    match query.rule.as_str() {
        "daily" => {
            if query.last_day == query.today {
                return RotationPlan::Idle;
            }
            let Some(next) = next_in_pool(&query.pool, &query.last_id) else {
                return RotationPlan::Idle;
            };
            RotationPlan::Apply {
                id: next.id.clone(),
                path: next.path.clone(),
                unix: query.now_unix,
                day: query.today.clone(),
                fixed_key: query.fixed_key.clone(),
            }
        }
        "random" => {
            let Some(last) = query.last_rotation_unix else {
                return RotationPlan::RememberClock { unix: query.now_unix };
            };
            if query.pool.len() < 2 || query.now_unix.saturating_sub(last) < query.interval_secs as i64 {
                return RotationPlan::Idle;
            }
            let Some(next) = next_in_pool(&query.pool, &query.last_id) else {
                return RotationPlan::Idle;
            };
            RotationPlan::Apply {
                id: next.id.clone(),
                path: next.path.clone(),
                unix: query.now_unix,
                day: query.today.clone(),
                fixed_key: query.fixed_key.clone(),
            }
        }
        _ => {
            let Some(slot) = active_slot(&query.timeline, query.hour) else {
                return RotationPlan::Idle;
            };
            let key = format!("{}:{}:{}", query.today, slot.start, slot.wallpaper_id);
            if key == query.fixed_key {
                return RotationPlan::Idle;
            }
            let Some(item) = query.catalog.iter().find(|item| item.id == slot.wallpaper_id) else {
                return RotationPlan::Idle;
            };
            if item.path.is_empty() {
                return RotationPlan::Idle;
            }
            RotationPlan::Apply {
                id: item.id.clone(),
                path: item.path.clone(),
                unix: query.now_unix,
                day: query.today.clone(),
                fixed_key: key,
            }
        }
    }
}

fn parse_timeline(raw: &str) -> Vec<TimelineSlot> {
    let Ok(value) = serde_json::from_str::<serde_json::Value>(raw) else {
        return Vec::new();
    };
    let Some(items) = value.as_array() else {
        return Vec::new();
    };
    items
        .iter()
        .filter_map(|item| {
            let wallpaper_id = item.get("wallpaperId").and_then(|id| id.as_str()).unwrap_or("").trim().to_string();
            let start = item.get("start").and_then(|start| start.as_u64()).unwrap_or(0) as u32;
            if wallpaper_id.is_empty() {
                None
            } else {
                Some(TimelineSlot { wallpaper_id, start })
            }
        })
        .collect()
}

fn local_date_hour() -> (String, u32) {
    #[cfg(windows)]
    {
        use windows::Win32::System::SystemInformation::GetLocalTime;
        let time = unsafe { GetLocalTime() };
        (
            format!("{:04}-{:02}-{:02}", time.wYear, time.wMonth, time.wDay),
            u32::from(time.wHour),
        )
    }
    #[cfg(not(windows))]
    {
        unsafe {
            let now = libc::time(std::ptr::null_mut());
            let mut out: libc::tm = std::mem::zeroed();
            if libc::localtime_r(&now, &mut out).is_null() {
                return ("1970-01-01".to_string(), 0);
            }
            (
                format!("{:04}-{:02}-{:02}", out.tm_year + 1900, out.tm_mon + 1, out.tm_mday),
                out.tm_hour as u32,
            )
        }
    }
}

fn setting_string(db: &crate::db::Database, key: &str) -> String {
    db.get_setting(key).ok().flatten().unwrap_or_default()
}

/// Background rotation. The window can stay hidden; closing to the tray keeps this task alive.
pub fn spawn_rotation_worker(app: AppHandle, state: AppState) {
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(Duration::from_secs(60)).await;
            let snapshot = {
                let Ok(db) = state.db.lock() else { continue };
                let enabled = db
                    .get_setting("rotation_enabled")
                    .ok()
                    .flatten()
                    .map(|value| value == "1")
                    .unwrap_or(true);
                let interval_min = db
                    .get_setting("rotation_interval_min")
                    .ok()
                    .flatten()
                    .and_then(|value| value.parse::<u64>().ok())
                    .unwrap_or(30)
                    .clamp(1, 24 * 60);
                let rule = setting_string(&db, "rotation_rule");
                let pool_mode = {
                    let value = setting_string(&db, "rotation_pool");
                    if value.is_empty() { "all".to_string() } else { value }
                };
                let folder = setting_string(&db, "rotation_folder");
                let wallpapers = db.list_wallpapers().unwrap_or_default();
                let favorites: std::collections::HashSet<String> = db.list_favorites().unwrap_or_default().into_iter().collect();
                let last_id = setting_string(&db, "rotation_last_id");
                let last_day = setting_string(&db, "rotation_last_day");
                let fixed_key = setting_string(&db, "rotation_fixed_key");
                let last_rotation_unix = db
                    .get_setting("rotation_last_at")
                    .ok()
                    .flatten()
                    .and_then(|value| value.parse::<i64>().ok());
                let monitor = setting_string(&db, "wallpaper_monitor");
                let timeline = parse_timeline(&setting_string(&db, "rotation_timeline"));
                let catalog: Vec<PoolItem> = wallpapers
                    .iter()
                    .map(|record| PoolItem { id: record.id.clone(), path: record.image_path.clone() })
                    .collect();
                let pool: Vec<PoolItem> = match pool_mode.as_str() {
                    "favorites" => catalog.iter().filter(|item| favorites.contains(&item.id)).cloned().collect(),
                    "folder" if !folder.trim().is_empty() => wallpapers
                        .iter()
                        .filter(|record| record.folder == folder)
                        .map(|record| PoolItem { id: record.id.clone(), path: record.image_path.clone() })
                        .collect(),
                    _ => catalog.clone(),
                };
                (enabled, interval_min, rule, pool, catalog, timeline, last_id, last_day, fixed_key, last_rotation_unix, monitor)
            };
            let (enabled, interval_min, rule, pool, catalog, timeline, last_id, last_day, fixed_key, last_rotation_unix, monitor) = snapshot;
            let now_unix = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0);
            let (today, hour) = local_date_hour();
            let plan = decide_rotation(&RotationQuery {
                enabled,
                rule: if rule.is_empty() { "fixed".to_string() } else { rule },
                interval_secs: interval_min.saturating_mul(60),
                now_unix,
                last_rotation_unix,
                last_id,
                last_day,
                today,
                hour,
                fixed_key,
                pool,
                timeline,
                catalog,
            });
            match plan {
                RotationPlan::Idle => {}
                RotationPlan::RememberClock { unix } => {
                    if let Ok(db) = state.db.lock() {
                        let _ = db.set_setting("rotation_last_at", &unix.to_string());
                    }
                }
                RotationPlan::Apply { id, path, unix, day, fixed_key } => {
                    let monitor_id = if monitor.trim().is_empty() { None } else { Some(monitor.as_str()) };
                    if let Err(error) = crate::wallpaper::set_wallpaper(&path, monitor_id) {
                        eprintln!("[rotation] apply failed for {id}: {error}");
                        continue;
                    }
                    if let Ok(db) = state.db.lock() {
                        let _ = db.set_setting("rotation_last_id", &id);
                        let _ = db.set_setting("rotation_last_at", &unix.to_string());
                        let _ = db.set_setting("rotation_last_day", &day);
                        let _ = db.set_setting("rotation_fixed_key", &fixed_key);
                    }
                    eprintln!("[rotation] applied {id}");
                    let _ = app.emit("burn-rotated", id);
                }
            }
        }
    });
}

/// Show or hide the main window (global hotkey / tray).
pub fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn toggle_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if window.is_visible().unwrap_or(true) {
            let _ = window.hide();
        } else {
            show_main_window(app);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn item(id: &str) -> PoolItem {
        PoolItem { id: id.to_string(), path: format!("/wall/{id}.png") }
    }

    fn query() -> RotationQuery {
        RotationQuery {
            enabled: true,
            rule: "fixed".to_string(),
            interval_secs: 1800,
            now_unix: 1_700_000_000,
            last_rotation_unix: Some(1_700_000_000),
            last_id: "a".to_string(),
            last_day: "2026-11-17".to_string(),
            today: "2026-11-17".to_string(),
            hour: 10,
            fixed_key: String::new(),
            pool: vec![item("a"), item("b")],
            timeline: Vec::new(),
            catalog: vec![item("a"), item("b"), item("c")],
        }
    }

    #[test]
    fn fixed_rule_without_timeline_does_not_rotate() {
        assert_eq!(decide_rotation(&query()), RotationPlan::Idle);
    }

    #[test]
    fn fixed_rule_applies_covering_slot_once() {
        let mut input = query();
        input.hour = 19;
        input.timeline = vec![
            TimelineSlot { wallpaper_id: "a".to_string(), start: 6 },
            TimelineSlot { wallpaper_id: "c".to_string(), start: 18 },
        ];
        let RotationPlan::Apply { id, fixed_key, .. } = decide_rotation(&input) else {
            panic!("expected apply");
        };
        assert_eq!(id, "c");
        assert_eq!(fixed_key, "2026-11-17:18:c");
        input.fixed_key = fixed_key;
        assert_eq!(decide_rotation(&input), RotationPlan::Idle);
    }

    #[test]
    fn fixed_rule_outside_blocks_is_idle() {
        let mut input = query();
        input.hour = 3;
        input.timeline = vec![TimelineSlot { wallpaper_id: "c".to_string(), start: 18 }];
        assert_eq!(decide_rotation(&input), RotationPlan::Idle);
    }

    #[test]
    fn disabled_rotation_is_idle() {
        let mut input = query();
        input.enabled = false;
        input.rule = "random".to_string();
        assert_eq!(decide_rotation(&input), RotationPlan::Idle);
    }

    #[test]
    fn interval_waits_and_then_advances() {
        let mut input = query();
        input.rule = "random".to_string();
        input.last_rotation_unix = None;
        assert_eq!(decide_rotation(&input), RotationPlan::RememberClock { unix: input.now_unix });
        input.last_rotation_unix = Some(input.now_unix - 60);
        assert_eq!(decide_rotation(&input), RotationPlan::Idle);
        input.last_rotation_unix = Some(input.now_unix - 1800);
        let RotationPlan::Apply { id, .. } = decide_rotation(&input) else {
            panic!("expected apply");
        };
        assert_eq!(id, "b");
    }

    #[test]
    fn interval_needs_two_images() {
        let mut input = query();
        input.rule = "random".to_string();
        input.pool.truncate(1);
        input.last_rotation_unix = Some(0);
        assert_eq!(decide_rotation(&input), RotationPlan::Idle);
    }

    #[test]
    fn daily_changes_once_per_date() {
        let mut input = query();
        input.rule = "daily".to_string();
        input.last_day = "2026-11-16".to_string();
        let RotationPlan::Apply { id, day, .. } = decide_rotation(&input) else {
            panic!("expected apply");
        };
        assert_eq!(id, "b");
        assert_eq!(day, "2026-11-17");
        input.last_day = "2026-11-17".to_string();
        assert_eq!(decide_rotation(&input), RotationPlan::Idle);
    }

    #[test]
    fn timeline_parser_drops_broken_entries() {
        let slots = parse_timeline(r#"[{"wallpaperId":"c","start":18},{"start":2},"no"]"#);
        assert_eq!(slots, vec![TimelineSlot { wallpaper_id: "c".to_string(), start: 18 }]);
    }
}
