use serde::Deserialize;
use std::path::Path;
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

use crate::db::WallpaperRecord;
use crate::AppState;

/// Built-in wallpapers embedded so the backend rotation pool can include them.
const BUNDLED: &[(&str, i64, &str, &str, &[u8])] = &[
    (
        "street-bounce",
        4,
        "Furry AJ",
        "STREET BOUNCE",
        include_bytes!("../../public/wallpapers/street-bounce.webp"),
    ),
    (
        "forest-guard",
        5,
        "自由",
        "STILL PEAK",
        include_bytes!("../../public/wallpapers/forest-guard.webp"),
    ),
    (
        "hammer-bear",
        6,
        "Furry AJ",
        "BEAR · HAMMER",
        include_bytes!("../../public/wallpapers/hammer-bear.webp"),
    ),
    (
        "court-wolf",
        7,
        "Furry AJ",
        "WOLF · BREAK THE LINE",
        include_bytes!("../../public/wallpapers/court-wolf.webp"),
    ),
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ScheduleEntry {
    wallpaper_id: String,
    start: u32,
}

fn scheduled_wallpaper(raw: &str, now_minutes: u32) -> Option<String> {
    let entries = serde_json::from_str::<Vec<ScheduleEntry>>(raw).ok()?;
    entries
        .into_iter()
        .rev()
        .find(|entry| entry.start < 24 && (now_minutes + 1440 - entry.start * 60) % 1440 < 240)
        .map(|entry| entry.wallpaper_id)
}

fn local_time() -> (u32, String) {
    let now = chrono::Local::now();
    (
        chrono::Timelike::hour(&now) * 60 + chrono::Timelike::minute(&now),
        now.format("%Y-%m-%d").to_string(),
    )
}

fn next_sequential(pool: &[(String, String)], last_id: &str) -> Option<(String, String)> {
    let position = pool.iter().position(|(id, _)| id == last_id);
    Some(match position {
        Some(index) => pool[(index + 1) % pool.len()].clone(),
        None => pool.first()?.clone(),
    })
}

fn next_random(pool: &[(String, String)], last_id: &str) -> Option<(String, String)> {
    if pool.is_empty() {
        return None;
    }
    let mut value = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_nanos() as u64)
        .unwrap_or(0)
        ^ u64::from(std::process::id());
    value ^= value << 13;
    value ^= value >> 7;
    value ^= value << 17;
    let mut index = value as usize % pool.len();
    if pool.len() > 1 && pool[index].0 == last_id {
        index = (index + 1) % pool.len();
    }
    Some(pool[index].clone())
}

fn visible_wallpapers(mut wallpapers: Vec<WallpaperRecord>) -> Vec<WallpaperRecord> {
    wallpapers
        .retain(|record| record.model == "bundled" || Path::new(&record.image_path).is_file());
    wallpapers
}

fn build_pool(
    wallpapers: &[WallpaperRecord],
    favorites: &std::collections::HashSet<String>,
    pool_mode: &str,
    folder: &str,
) -> Vec<(String, String)> {
    match pool_mode {
        "favorites" => wallpapers
            .iter()
            .filter(|record| favorites.contains(&record.id))
            .map(|record| (record.id.clone(), record.image_path.clone()))
            .collect(),
        "folder" if !folder.trim().is_empty() => wallpapers
            .iter()
            .filter(|record| record.folder == folder)
            .map(|record| (record.id.clone(), record.image_path.clone()))
            .collect(),
        _ => wallpapers
            .iter()
            .map(|record| (record.id.clone(), record.image_path.clone()))
            .collect(),
    }
}

pub fn spawn_rotation_worker(app: AppHandle, state: AppState) {
    tauri::async_runtime::spawn(async move {
        let mut last_rotation = Instant::now();
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
                if !enabled {
                    continue;
                }
                let interval_min = db
                    .get_setting("rotation_interval_min")
                    .ok()
                    .flatten()
                    .and_then(|value| value.parse::<u64>().ok())
                    .unwrap_or(30)
                    .max(1);
                let rule = db
                    .get_setting("rotation_rule")
                    .ok()
                    .flatten()
                    .unwrap_or_else(|| "fixed".to_string());
                let pool_mode = db
                    .get_setting("rotation_pool")
                    .ok()
                    .flatten()
                    .unwrap_or_else(|| "all".to_string());
                let folder = db
                    .get_setting("rotation_folder")
                    .ok()
                    .flatten()
                    .unwrap_or_default();
                let schedule = db.get_setting("rotation_schedule").ok().flatten().unwrap_or_else(|| {
                    "[{\"wallpaperId\":\"forest-guard\",\"start\":0},{\"wallpaperId\":\"hammer-bear\",\"start\":18}]".to_string()
                });
                let last_daily = db
                    .get_setting("rotation_last_daily")
                    .ok()
                    .flatten()
                    .unwrap_or_default();
                let wallpapers = visible_wallpapers(db.list_wallpapers().unwrap_or_default());
                let favorites: std::collections::HashSet<String> = db
                    .list_favorites()
                    .unwrap_or_default()
                    .into_iter()
                    .collect();
                let last_id = db
                    .get_setting("rotation_last_id")
                    .ok()
                    .flatten()
                    .unwrap_or_default();
                let display_mode = db
                    .get_setting("display_mode")
                    .ok()
                    .flatten()
                    .unwrap_or_else(|| "per-monitor".to_string());
                (
                    interval_min,
                    rule,
                    pool_mode,
                    folder,
                    schedule,
                    last_daily,
                    wallpapers,
                    favorites,
                    last_id,
                    display_mode,
                )
            };
            let (
                interval_min,
                rule,
                pool_mode,
                folder,
                schedule,
                last_daily,
                wallpapers,
                favorites,
                last_id,
                display_mode,
            ) = snapshot;
            let (now_minutes, today) = local_time();
            let pool: Vec<(String, String)> =
                build_pool(&wallpapers, &favorites, &pool_mode, &folder);
            let next = match rule.as_str() {
                "fixed" => scheduled_wallpaper(&schedule, now_minutes)
                    .filter(|id| *id != last_id)
                    .and_then(|id| wallpapers.iter().find(|record| record.id == id))
                    .map(|record| (record.id.clone(), record.image_path.clone())),
                "daily" if last_daily != today && !pool.is_empty() => {
                    next_sequential(&pool, &last_id)
                }
                "daily" => None,
                _ if last_rotation.elapsed() >= Duration::from_secs(interval_min * 60)
                    && !pool.is_empty() =>
                {
                    next_random(&pool, &last_id)
                }
                _ => None,
            };
            let Some((next_id, next_path)) = next else {
                continue;
            };
            let applied = if display_mode == "span" {
                crate::wallpaper::set_wallpaper_span(&next_path)
            } else {
                crate::wallpaper::set_wallpaper(&next_path, None)
            };
            if let Err(error) = applied {
                eprintln!("[rotation] apply failed for {}: {error}", next_id);
                continue;
            }
            if let Ok(db) = state.db.lock() {
                let _ = db.set_setting("rotation_last_id", &next_id);
                if rule == "daily" {
                    let _ = db.set_setting("rotation_last_daily", &today);
                }
            }
            last_rotation = Instant::now();
            eprintln!("[rotation] applied {}", next_id);
            let _ = app.emit("burn-rotated", next_id);
        }
    });
}

/// 立即按當前輪換規則換一張（托盤菜單「換一張」）。
/// 手動觸發不受「定時輪換」開關與間隔限制，但尊重固定時段/收藏夾/文件夾規則。
pub fn rotate_once(app: &AppHandle, state: &AppState) -> Result<(), String> {
    let snapshot = {
        let Ok(db) = state.db.lock() else {
            return Err("数据库锁定中，稍后再试".to_string());
        };
        let rule = db
            .get_setting("rotation_rule")
            .ok()
            .flatten()
            .unwrap_or_else(|| "fixed".to_string());
        let pool_mode = db
            .get_setting("rotation_pool")
            .ok()
            .flatten()
            .unwrap_or_else(|| "all".to_string());
        let folder = db
            .get_setting("rotation_folder")
            .ok()
            .flatten()
            .unwrap_or_default();
        let schedule = db.get_setting("rotation_schedule").ok().flatten().unwrap_or_else(|| {
            "[{\"wallpaperId\":\"forest-guard\",\"start\":0},{\"wallpaperId\":\"hammer-bear\",\"start\":18}]".to_string()
        });
        let wallpapers = visible_wallpapers(db.list_wallpapers().unwrap_or_default());
        let favorites: std::collections::HashSet<String> = db
            .list_favorites()
            .unwrap_or_default()
            .into_iter()
            .collect();
        let last_id = db
            .get_setting("rotation_last_id")
            .ok()
            .flatten()
            .unwrap_or_default();
        let display_mode = db
            .get_setting("display_mode")
            .ok()
            .flatten()
            .unwrap_or_else(|| "per-monitor".to_string());
        (
            rule,
            pool_mode,
            folder,
            schedule,
            wallpapers,
            favorites,
            last_id,
            display_mode,
        )
    };
    let (rule, pool_mode, folder, schedule, wallpapers, favorites, last_id, display_mode) =
        snapshot;
    let pool = build_pool(&wallpapers, &favorites, &pool_mode, &folder);
    if pool.is_empty() {
        return Err("轮换池是空的".to_string());
    }
    let (now_minutes, _today) = local_time();
    let next = match rule.as_str() {
        "fixed" => scheduled_wallpaper(&schedule, now_minutes)
            .filter(|id| *id != last_id)
            .and_then(|id| wallpapers.iter().find(|record| record.id == id))
            .map(|record| (record.id.clone(), record.image_path.clone()))
            .or_else(|| next_random(&pool, &last_id)),
        "daily" => next_sequential(&pool, &last_id),
        _ => next_random(&pool, &last_id),
    };
    let Some((next_id, next_path)) = next else {
        return Err("没有可换的壁纸".to_string());
    };
    if display_mode == "span" {
        crate::wallpaper::set_wallpaper_span(&next_path)?;
    } else {
        crate::wallpaper::set_wallpaper(&next_path, None)?;
    }
    if let Ok(db) = state.db.lock() {
        let _ = db.set_setting("rotation_last_id", &next_id);
    }
    eprintln!("[rotation] tray rotate applied {}", next_id);
    let _ = app.emit("burn-rotated", next_id);
    Ok(())
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

    #[test]
    fn schedule_selects_current_and_wrapped_block() {
        let raw =
            "[{\"wallpaperId\":\"day\",\"start\":6},{\"wallpaperId\":\"night\",\"start\":22}]";
        assert_eq!(scheduled_wallpaper(raw, 8 * 60).as_deref(), Some("day"));
        assert_eq!(scheduled_wallpaper(raw, 23 * 60).as_deref(), Some("night"));
        assert_eq!(scheduled_wallpaper(raw, 1 * 60).as_deref(), Some("night"));
        assert_eq!(scheduled_wallpaper("[]", 8 * 60), None);
    }

    #[test]
    fn bundled_wallpapers_remain_available_with_generated_images() {
        let record = |id: &str, model: &str| WallpaperRecord {
            id: id.to_string(),
            issue: 1,
            title: String::new(),
            english: String::new(),
            prompt: String::new(),
            model: model.to_string(),
            aspect_ratio: "16:9".to_string(),
            resolution: "4K".to_string(),
            image_path: std::file!().to_string(),
            folder: String::new(),
            created_at: 0,
        };
        let bundled = vec![record("test", "bundled")];
        assert_eq!(visible_wallpapers(bundled.clone()).len(), 1);
        let mixed = vec![record("test", "bundled"), record("generated", "model")];
        let visible = visible_wallpapers(mixed);
        assert_eq!(visible.len(), 2);
        let favorites = std::collections::HashSet::from(["test".to_string()]);
        let pool = build_pool(&visible, &favorites, "favorites", "");
        assert_eq!(pool.len(), 1);
        assert_eq!(pool[0].0, "test");
    }
}

