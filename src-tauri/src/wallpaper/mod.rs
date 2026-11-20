use serde::Serialize;

#[cfg(target_os = "macos")]
mod macos;
mod span;
#[cfg(windows)]
mod windows;

#[cfg(target_os = "macos")]
use macos as platform;
#[cfg(windows)]
use windows as platform;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub device_path: String,
    pub width: i32,
    pub height: i32,
    pub x: i32,
    pub y: i32,
    pub scale_factor: f64,
}

pub fn list_monitors() -> Result<Vec<MonitorInfo>, String> {
    platform::list_monitors()
}

pub fn set_wallpaper(image_path: &str, monitor_id: Option<&str>) -> Result<(), String> {
    platform::set_wallpaper(image_path, monitor_id)
}

pub fn set_wallpaper_span(image_path: &str) -> Result<(), String> {
    let monitors = list_monitors()?;
    if monitors.is_empty() {
        return Err("未检测到显示器".to_string());
    }
    if monitors.len() == 1 {
        return set_wallpaper(image_path, None);
    }
    let dir = std::env::temp_dir().join("burn-wallpaper-span");
    let slices = span::write_slices(image_path, &monitors, &dir)?;
    platform::set_wallpapers(&slices)
}
