use windows::core::{GUID, HSTRING, PCWSTR, PWSTR};
use windows::Win32::Foundation::RPC_E_CHANGED_MODE;
use windows::Win32::System::Com::{
    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL,
    COINIT_APARTMENTTHREADED,
};
use windows::Win32::UI::Shell::{IDesktopWallpaper, DWPOS_FILL};

use super::MonitorInfo;

const CLSID_DESKTOP_WALLPAPER: GUID = GUID::from_u128(0xC2CF3110_460E_4FC1_B9D0_8A1C0C9CC4BD);

struct ComApartment;

impl Drop for ComApartment {
    fn drop(&mut self) {
        unsafe { CoUninitialize() };
    }
}

struct WallpaperSession {
    wallpaper: IDesktopWallpaper,
    _com: Option<ComApartment>,
}

fn create_wallpaper() -> Result<WallpaperSession, String> {
    unsafe {
        let initialized = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let com = if initialized.is_ok() {
            Some(ComApartment)
        } else if initialized == RPC_E_CHANGED_MODE {
            None
        } else {
            return Err(format!("无法初始化系统桌面 COM:{initialized}"));
        };
        let wallpaper = CoCreateInstance(&CLSID_DESKTOP_WALLPAPER, None, CLSCTX_ALL)
            .map_err(|e| format!("无法连接系统桌面接口:{e}"))?;
        Ok(WallpaperSession {
            wallpaper,
            _com: com,
        })
    }
}

pub fn list_monitors() -> Result<Vec<MonitorInfo>, String> {
    unsafe {
        let session = create_wallpaper()?;
        let wallpaper = &session.wallpaper;
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
            let rect = wallpaper
                .GetMonitorRECT(PCWSTR(path_ptr.as_ptr() as *const u16))
                .ok();
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
                scale_factor: 1.0,
            });
        }
        Ok(monitors)
    }
}

pub fn set_wallpaper(image_path: &str, monitor_id: Option<&str>) -> Result<(), String> {
    let session = create_wallpaper()?;
    set_wallpaper_on(&session, image_path, monitor_id)
}

fn set_wallpaper_on(
    session: &WallpaperSession,
    image_path: &str,
    monitor_id: Option<&str>,
) -> Result<(), String> {
    unsafe {
        let wallpaper = &session.wallpaper;
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

pub fn set_wallpapers(slices: &[(String, String)]) -> Result<(), String> {
    let session = create_wallpaper()?;
    for (monitor_id, image_path) in slices {
        set_wallpaper_on(&session, image_path, Some(monitor_id))?;
    }
    Ok(())
}
