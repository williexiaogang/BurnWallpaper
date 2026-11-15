use std::time::{Duration, Instant};
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

/// Background rotation: applies the next wallpaper when the interval is due,
/// keeps working even when the window is hidden.
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
                let interval_min = db
                    .get_setting("rotation_interval_min")
                    .ok()
                    .flatten()
                    .and_then(|value| value.parse::<u64>().ok())
                    .unwrap_or(30)
                    .max(1);
                let pool_mode = db.get_setting("rotation_pool").ok().flatten().unwrap_or_else(|| "all".to_string());
                let folder = db.get_setting("rotation_folder").ok().flatten().unwrap_or_default();
                let wallpapers = db.list_wallpapers().unwrap_or_default();
                let favorites: std::collections::HashSet<String> = db.list_favorites().unwrap_or_default().into_iter().collect();
                let last_id = db.get_setting("rotation_last_id").ok().flatten().unwrap_or_default();
                (enabled, interval_min, pool_mode, folder, wallpapers, favorites, last_id)
            };
            let (enabled, interval_min, pool_mode, folder, wallpapers, favorites, last_id) = snapshot;
            if !enabled {
                continue;
            }
            // 輪換池：全部 / 收藏夾 / 指定文件夾
            let pool: Vec<(String, String)> = match pool_mode.as_str() {
                "favorites" => wallpapers
                    .into_iter()
                    .filter(|record| favorites.contains(&record.id))
                    .map(|record| (record.id, record.image_path))
                    .collect(),
                "folder" if !folder.trim().is_empty() => scan_image_folder(std::path::Path::new(&folder)),
                _ => wallpapers
                    .into_iter()
                    .map(|record| (record.id, record.image_path))
                    .collect(),
            };
            if pool.len() < 2 {
                continue;
            }
            if last_rotation.elapsed() < Duration::from_secs(interval_min * 60) {
                continue;
            }
            let position = pool.iter().position(|(id, _)| *id == last_id);
            let (next_id, next_path) = match position {
                Some(index) => pool[(index + 1) % pool.len()].clone(),
                None => pool[0].clone(),
            };
            if let Err(error) = crate::wallpaper::set_wallpaper(&next_path, None) {
                eprintln!("[rotation] apply failed for {}: {error}", next_id);
                continue;
            }
            if let Ok(db) = state.db.lock() {
                let _ = db.set_setting("rotation_last_id", &next_id);
            }
            last_rotation = Instant::now();
            eprintln!("[rotation] applied {}", next_id);
            let _ = app.emit("burn-rotated", next_id);
        }
    });
}

fn scan_image_folder(dir: &std::path::Path) -> Vec<(String, String)> {
    let Ok(entries) = std::fs::read_dir(dir) else { return Vec::new() };
    let mut images: Vec<(String, String)> = entries
        .flatten()
        .map(|entry| entry.path())
        .filter(|path| {
            path.extension()
                .map(|ext| matches!(ext.to_string_lossy().to_ascii_lowercase().as_str(), "jpg" | "jpeg" | "png" | "webp" | "bmp"))
                .unwrap_or(false)
        })
        .map(|path| {
            let text = path.to_string_lossy().into_owned();
            (text.clone(), text)
        })
        .collect();
    images.sort();
    images
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
