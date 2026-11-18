use serde::Serialize;
use windows::core::{GUID, HSTRING, PCWSTR, PWSTR};
use windows::Win32::Foundation::RPC_E_CHANGED_MODE;
use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_ALL, COINIT_APARTMENTTHREADED};
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
        Ok(WallpaperSession { wallpaper, _com: com })
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
            let rect = wallpaper.GetMonitorRECT(PCWSTR(path_ptr.as_ptr() as *const u16)).ok();
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
pub fn set_wallpaper(image_path: &str, monitor_id: Option<&str>) -> Result<(), String> {
    let session = create_wallpaper()?;
    set_wallpaper_on(&session, image_path, monitor_id)
}

fn set_wallpaper_on(session: &WallpaperSession, image_path: &str, monitor_id: Option<&str>) -> Result<(), String> {
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

/// 跨屏連續：把一張圖 cover 縮放到虛擬桌面大小，按各顯示器矩形切片，
/// 每屏設為自己的切片（尺寸與屏幕一致，FILL 即原樣顯示），形成一幅連續畫面。
pub fn set_wallpaper_span(image_path: &str) -> Result<(), String> {
    let monitors = list_monitors()?;
    if monitors.len() < 2 {
        return set_wallpaper(image_path, None);
    }
    let min_x = monitors.iter().map(|monitor| monitor.x).min().unwrap_or(0);
    let min_y = monitors.iter().map(|monitor| monitor.y).min().unwrap_or(0);
    let max_x = monitors.iter().map(|monitor| monitor.x + monitor.width).max().unwrap_or(0);
    let max_y = monitors.iter().map(|monitor| monitor.y + monitor.height).max().unwrap_or(0);
    let virtual_w = (max_x - min_x).max(1) as u32;
    let virtual_h = (max_y - min_y).max(1) as u32;
    let source = image::open(image_path)
        .map_err(|e| format!("读取壁纸失败:{e}"))?
        .to_rgb8();
    // cover：等比縮放後居中裁切到虛擬桌面比例
    let scaled = {
        let (sw, sh) = (source.width(), source.height());
        let scale = (virtual_w as f64 / sw as f64).max(virtual_h as f64 / sh as f64);
        let rw = (sw as f64 * scale).round().max(1.0) as u32;
        let rh = (sh as f64 * scale).round().max(1.0) as u32;
        let resized = image::imageops::resize(&source, rw, rh, image::imageops::FilterType::Lanczos3);
        let ox = rw.saturating_sub(virtual_w) / 2;
        let oy = rh.saturating_sub(virtual_h) / 2;
        image::imageops::crop_imm(&resized, ox, oy, virtual_w, virtual_h).to_image()
    };
    let dir = std::env::temp_dir().join("burn-wallpaper-span");
    std::fs::create_dir_all(&dir).map_err(|e| format!("准备跨屏切片目录失败:{e}"))?;
    let session = create_wallpaper()?;
    for (index, monitor) in monitors.iter().enumerate() {
        let slice = image::imageops::crop_imm(
            &scaled,
            (monitor.x - min_x) as u32,
            (monitor.y - min_y) as u32,
            monitor.width.max(1) as u32,
            monitor.height.max(1) as u32,
        )
        .to_image();
        let slice_path = dir.join(format!("slice-{index}.png"));
        slice
            .save(&slice_path)
            .map_err(|e| format!("写入跨屏切片失败:{e}"))?;
        set_wallpaper_on(&session, &slice_path.to_string_lossy(), Some(&monitor.device_path))?;
    }
    Ok(())
}
