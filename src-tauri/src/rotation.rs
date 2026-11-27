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

fn interval_due(elapsed: Duration, configured_minutes: Option<&str>) -> bool {
    let minutes = configured_minutes
        .and_then(|value| value.trim().parse::<u64>().ok())
        .unwrap_or(30)
        .max(1);
    elapsed >= Duration::from_secs(minutes.saturating_mul(60))
}

pub fn spawn_rotation_worker(app: AppHandle, state: AppState) {
    tauri::async_runtime::spawn(async move {
        let mut last_rotation = Instant::now();
        loop {
            tokio::time::sleep(Duration::from_secs(60)).await;
            let due = {
                let Ok(db) = state.db.lock() else { continue };
                let enabled = db
                    .get_setting("rotation_enabled")
                    .ok()
                    .flatten()
                    .map(|value| value == "1")
                    .unwrap_or(true);
                let interval = db.get_setting("rotation_interval_min").ok().flatten();
                enabled && interval_due(last_rotation.elapsed(), interval.as_deref())
            };
            if !due {
                continue;
            }
            match rotate_once(&app, &state) {
                Ok(()) => last_rotation = Instant::now(),
                Err(error) => eprintln!("[rotation] interval rotation failed: {error}"),
            }
        }
    });
}

/// 立即換一張（托盤菜單「換一張」），沿用設定中的圖片來源與顯示模式。
pub fn rotate_once(app: &AppHandle, state: &AppState) -> Result<(), String> {
    let (next_id, next_path, display_mode) = {
        let db = state
            .db
            .lock()
            .map_err(|_| "数据库锁定中，稍后再试".to_string())?;
        let pool_mode = db
            .get_setting("rotation_pool")?
            .unwrap_or_else(|| "all".to_string());
        let folder = db.get_setting("rotation_folder")?.unwrap_or_default();
        let wallpapers = visible_wallpapers(db.list_wallpapers()?);
        let favorites = if pool_mode == "favorites" {
            db.list_favorites()?.into_iter().collect()
        } else {
            std::collections::HashSet::new()
        };
        let last_id = db.get_setting("rotation_last_id")?.unwrap_or_default();
        let display_mode = db
            .get_setting("display_mode")?
            .unwrap_or_else(|| "per-monitor".to_string());
        let pool = build_pool(&wallpapers, &favorites, &pool_mode, &folder);
        let (id, path) = next_random(&pool, &last_id).ok_or_else(|| "轮换池是空的".to_string())?;
        (id, path, display_mode)
    };
    if display_mode == "span" {
        crate::wallpaper::set_wallpaper_span(&next_path)?;
    } else {
        crate::wallpaper::set_wallpaper(&next_path, None)?;
    }
    if let Ok(db) = state.db.lock() {
        let _ = db.set_setting("rotation_last_id", &next_id);
    }
    eprintln!("[rotation] applied {}", next_id);
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
    fn rotation_waits_for_the_configured_interval() {
        assert!(!interval_due(Duration::from_secs(899), Some("15")));
        assert!(interval_due(Duration::from_secs(900), Some("15")));
        assert!(!interval_due(Duration::from_secs(1799), None));
        assert!(interval_due(Duration::from_secs(1800), Some("invalid")));
        assert!(!interval_due(Duration::from_secs(59), Some("0")));
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
