use serde::Serialize;
use windows::core::{GUID, HSTRING, PCWSTR, PWSTR};
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_APARTMENTTHREADED};
use windows::Win32::UI::Shell::{IDesktopWallpaper, DWPOS_FILL};

/// CLSID for the Desktop Wallpaper coclass.
const CLSID_DESKTOP_WALLPAPER: GUID = GUID::from_u128(0xC2CF3110_460E_4FC1_B9D0_8A1C0C9CC4BD);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub device_path: String,
    pub width: i32,
    pub height: i32,
    pub x: i32,
    pub y: i32,
}

fn create_wallpaper() -> Result<IDesktopWallpaper, String> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        CoCreateInstance(&CLSID_DESKTOP_WALLPAPER, None, CLSCTX_ALL)
            .map_err(|e| format!("无法连接系统桌面接口:{e}"))
    }
}

pub fn list_monitors() -> Result<Vec<MonitorInfo>, String> {
    unsafe {
        let wallpaper = create_wallpaper()?;
        let count = wallpaper
            .GetMonitorDevicePathCount()
            .map_err(|e| format!("读取显示器失败:{e}"))?;
        let mut monitors = Vec::new();
        for index in 0..count {
            let path_ptr: PWSTR = wallpaper
                .GetMonitorDevicePathAt(index)
                .map_err(|e| format!("读取显示器失败:{e}"))?;
            if path_ptr.is_null() {
                continue;
            }
            let device_path = path_ptr.to_string().unwrap_or_default();
            if device_path.is_empty() {
                continue;
            }
            let rect = wallpaper.GetMonitorRECT(PCWSTR(path_ptr.as_ptr() as *const u16)).unwrap_or_default();
            monitors.push(MonitorInfo {
                device_path,
                width: rect.right - rect.left,
                height: rect.bottom - rect.top,
                x: rect.left,
                y: rect.top,
            });
        }
        Ok(monitors)
    }
}

/// Sets the wallpaper on one monitor (by device path) or all monitors when `monitor_id` is None.
pub fn set_wallpaper(image_path: &str, monitor_id: Option<&str>) -> Result<(), String> {
    unsafe {
        let wallpaper = create_wallpaper()?;
        wallpaper
            .SetPosition(DWPOS_FILL)
            .map_err(|e| format!("设置填充模式失败:{e}"))?;
        let path = HSTRING::from(image_path);
        let result = if let Some(id) = monitor_id {
            let id = HSTRING::from(id);
            wallpaper.SetWallpaper(PCWSTR(id.as_ptr()), PCWSTR(path.as_ptr()))
        } else {
            wallpaper.SetWallpaper(PCWSTR::null(), PCWSTR(path.as_ptr()))
        };
        result.map_err(|e| format!("上墙失败:{e}"))
    }
}
