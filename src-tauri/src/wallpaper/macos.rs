use std::path::Path;

use dispatch::Queue;
use objc2::runtime::AnyObject;
use objc2::MainThreadMarker;
use objc2_app_kit::{NSScreen, NSWorkspace, NSWorkspaceDesktopImageOptionKey};
use objc2_foundation::{NSArray, NSDictionary, NSURL};

use super::MonitorInfo;

fn on_main<T, F>(action: F) -> T
where
    T: Send + 'static,
    F: FnOnce(MainThreadMarker) -> T + Send + 'static,
{
    if let Some(marker) = MainThreadMarker::new() {
        return action(marker);
    }
    Queue::main().exec_sync(move || {
        let marker =
            MainThreadMarker::new().expect("main dispatch queue must run on the main thread");
        action(marker)
    })
}

pub fn list_monitors() -> Result<Vec<MonitorInfo>, String> {
    on_main(|marker| {
        let screens = NSScreen::screens(marker);
        let max_top = screens
            .iter()
            .map(|screen| {
                let frame = screen.frame();
                frame.origin.y + frame.size.height
            })
            .fold(f64::NEG_INFINITY, f64::max);
        if !max_top.is_finite() {
            return Err("未检测到显示器".to_string());
        }
        Ok(screens
            .iter()
            .map(|screen| {
                let frame = screen.frame();
                MonitorInfo {
                    device_path: screen.CGDirectDisplayID().to_string(),
                    width: frame.size.width.round().max(1.0) as i32,
                    height: frame.size.height.round().max(1.0) as i32,
                    x: frame.origin.x.round() as i32,
                    y: (max_top - frame.origin.y - frame.size.height).round() as i32,
                    scale_factor: screen.backingScaleFactor(),
                }
            })
            .collect())
    })
}

fn set_wallpaper_on(
    workspace: &NSWorkspace,
    screens: &NSArray<NSScreen>,
    image_path: &str,
    monitor_id: Option<&str>,
) -> Result<(), String> {
    let url = NSURL::from_file_path(Path::new(image_path)).ok_or("壁纸路径无效")?;
    let options = NSDictionary::<NSWorkspaceDesktopImageOptionKey, AnyObject>::new();
    if let Some(id) = monitor_id {
        let screen = screens
            .iter()
            .find(|screen| screen.CGDirectDisplayID().to_string() == id)
            .ok_or_else(|| format!("找不到显示器:{id}"))?;
        unsafe { workspace.setDesktopImageURL_forScreen_options_error(&url, &screen, &options) }
            .map_err(|e| format!("上墙失败:{}", e.localizedDescription()))
    } else {
        for screen in screens {
            unsafe {
                workspace.setDesktopImageURL_forScreen_options_error(&url, &screen, &options)
            }
            .map_err(|e| format!("上墙失败:{}", e.localizedDescription()))?;
        }
        Ok(())
    }
}

pub fn set_wallpaper(image_path: &str, monitor_id: Option<&str>) -> Result<(), String> {
    let image_path = image_path.to_string();
    let monitor_id = monitor_id.map(str::to_string);
    on_main(move |marker| {
        let screens = NSScreen::screens(marker);
        set_wallpaper_on(
            &NSWorkspace::sharedWorkspace(),
            &screens,
            &image_path,
            monitor_id.as_deref(),
        )
    })
}

pub fn set_wallpapers(slices: &[(String, String)]) -> Result<(), String> {
    let slices = slices.to_vec();
    on_main(move |marker| {
        let screens = NSScreen::screens(marker);
        let workspace = NSWorkspace::sharedWorkspace();
        for (monitor_id, image_path) in &slices {
            set_wallpaper_on(&workspace, &screens, image_path, Some(monitor_id))?;
        }
        Ok(())
    })
}
