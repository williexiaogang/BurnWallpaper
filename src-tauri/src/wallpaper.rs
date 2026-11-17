use serde::Serialize;

#[cfg(windows)]
use windows::core::{GUID, HSTRING, PCWSTR, PWSTR};
#[cfg(windows)]
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_ALL, COINIT_APARTMENTTHREADED};
#[cfg(windows)]
use windows::Win32::UI::Shell::{IDesktopWallpaper, DWPOS_FILL};

/// CLSID for the Desktop Wallpaper coclass.
#[cfg(windows)]
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

#[cfg(windows)]
fn create_wallpaper() -> Result<IDesktopWallpaper, String> {
    unsafe {
        let _ = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        CoCreateInstance(&CLSID_DESKTOP_WALLPAPER, None, CLSCTX_ALL)
            .map_err(|e| format!("无法连接系统桌面接口:{e}"))
    }
}

#[cfg(windows)]
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
            // 读取矩形失败的屏幕（已断开的虚拟显示器等）直接跳过，而不是记成 0×0
            let rect = wallpaper.GetMonitorRECT(PCWSTR(path_ptr.as_ptr() as *const u16)).ok();
            // GetMonitorDevicePathAt 返回的字符串由 COM 分配，必须手动释放，否则每次枚举都泄漏
            CoTaskMemFree(Some(path_ptr.as_ptr() as *const core::ffi::c_void));
            if device_path.is_empty() {
                continue;
            }
            let Some(rect) = rect else { continue };
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
#[cfg(windows)]
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

#[cfg(not(windows))]
pub fn list_monitors() -> Result<Vec<MonitorInfo>, String> {
    Err("显示器列表只在 Windows 上可用".into())
}

#[cfg(not(windows))]
pub fn set_wallpaper(_image_path: &str, _monitor_id: Option<&str>) -> Result<(), String> {
    Err("上墙只在 Windows 上可用".into())
}
