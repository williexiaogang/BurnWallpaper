use tauri::WebviewWindow;

const ASPECT_WIDTH: f64 = 16.0;
const ASPECT_HEIGHT: f64 = 10.0;

#[cfg(windows)]
pub fn enforce_main_window(window: &WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    win32::install(windows::Win32::Foundation::HWND(window.hwnd()?.0))?;
    Ok(())
}

#[cfg(target_os = "macos")]
pub fn enforce_main_window(window: &WebviewWindow) -> Result<(), Box<dyn std::error::Error>> {
    use objc2_app_kit::NSWindow;
    use objc2_foundation::NSSize;

    // Tauri's setup runs on the main thread, and the handle borrows the live NSWindow.
    let ns_window = window.ns_window()?.cast::<NSWindow>();
    let ns_window = unsafe { &*ns_window };
    ns_window.setContentAspectRatio(NSSize::new(ASPECT_WIDTH, ASPECT_HEIGHT));
    Ok(())
}

#[cfg(windows)]
mod win32 {
    use super::{ASPECT_HEIGHT, ASPECT_WIDTH};
    use std::io;
    use windows::Win32::{
        Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM},
        UI::{
            HiDpi::GetDpiForWindow,
            Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass},
            WindowsAndMessaging::{
                GetClientRect, GetWindowRect, WMSZ_BOTTOM, WMSZ_BOTTOMLEFT, WMSZ_BOTTOMRIGHT,
                WMSZ_LEFT, WMSZ_RIGHT, WMSZ_TOP, WMSZ_TOPLEFT, WMSZ_TOPRIGHT, WM_NCDESTROY,
                WM_SIZING,
            },
        },
    };

    const SUBCLASS_ID: usize = 1;
    const BASE_DPI: u32 = 96;
    // Keep this in sync with the logical content minimum in tauri.conf.json.
    const MIN_CONTENT_HEIGHT: f64 = 600.0;
    const ASPECT_RATIO: f64 = ASPECT_WIDTH / ASPECT_HEIGHT;

    pub(super) fn install(hwnd: HWND) -> io::Result<()> {
        // Install on the UI thread so the system consults us before resizing the WebView.
        if unsafe { SetWindowSubclass(hwnd, Some(resize_proc), SUBCLASS_ID, 0) }.as_bool() {
            Ok(())
        } else {
            Err(io::Error::other(
                "Failed to install the main window resize handler",
            ))
        }
    }

    unsafe extern "system" fn resize_proc(
        hwnd: HWND,
        message: u32,
        wparam: WPARAM,
        lparam: LPARAM,
        subclass_id: usize,
        _: usize,
    ) -> LRESULT {
        if message == WM_NCDESTROY {
            let _ = unsafe { RemoveWindowSubclass(hwnd, Some(resize_proc), subclass_id) };
        }
        if message == WM_SIZING {
            // Win32 supplies a writable outer rectangle for the duration of WM_SIZING.
            if let Some(rect) = unsafe { (lparam.0 as *mut RECT).as_mut() } {
                if let Some(frame) = frame_size(hwnd) {
                    let dpi = unsafe { GetDpiForWindow(hwnd) };
                    let dpi = if dpi == 0 { BASE_DPI } else { dpi };
                    let minimum = MIN_CONTENT_HEIGHT * f64::from(dpi) / f64::from(BASE_DPI);
                    if constrain_drag(rect, wparam.0 as u32, frame, minimum) {
                        return LRESULT(1);
                    }
                }
            }
        }
        unsafe { DefSubclassProc(hwnd, message, wparam, lparam) }
    }

    fn frame_size(hwnd: HWND) -> Option<(i32, i32)> {
        let mut outer = RECT::default();
        let mut client = RECT::default();
        unsafe {
            GetWindowRect(hwnd, &mut outer).ok()?;
            GetClientRect(hwnd, &mut client).ok()?;
        }
        Some((
            (outer.right - outer.left - (client.right - client.left)).max(0),
            (outer.bottom - outer.top - (client.bottom - client.top)).max(0),
        ))
    }

    fn constrain_drag(rect: &mut RECT, edge: u32, frame: (i32, i32), minimum: f64) -> bool {
        let width = f64::from(rect.right - rect.left - frame.0);
        let height = f64::from(rect.bottom - rect.top - frame.1);
        let height = match edge {
            WMSZ_LEFT | WMSZ_RIGHT => width / ASPECT_RATIO,
            WMSZ_TOP | WMSZ_BOTTOM => height,
            // Use the closest point on the aspect-ratio line to the requested corner.
            WMSZ_TOPLEFT | WMSZ_TOPRIGHT | WMSZ_BOTTOMLEFT | WMSZ_BOTTOMRIGHT => {
                (width * ASPECT_RATIO + height) / (ASPECT_RATIO * ASPECT_RATIO + 1.0)
            }
            _ => return false,
        }
        .max(minimum);
        let width = (height * ASPECT_RATIO).round() as i32 + frame.0;
        let height = height.round() as i32 + frame.1;
        if matches!(edge, WMSZ_LEFT | WMSZ_TOPLEFT | WMSZ_BOTTOMLEFT) {
            rect.left = rect.right - width;
        } else {
            rect.right = rect.left + width;
        }
        if matches!(edge, WMSZ_TOP | WMSZ_TOPLEFT | WMSZ_TOPRIGHT) {
            rect.top = rect.bottom - height;
        } else {
            rect.bottom = rect.top + height;
        }
        true
    }

    #[cfg(test)]
    mod tests {
        use super::*;
        use windows::{
            core::w,
            Win32::UI::WindowsAndMessaging::{
                CreateWindowExW, DestroyWindow, SendMessageW, WINDOW_EX_STYLE, WS_OVERLAPPEDWINDOW,
            },
        };

        #[test]
        fn native_sizing_uses_the_content_rectangle_and_keeps_the_anchor() {
            let hwnd = unsafe {
                CreateWindowExW(
                    WINDOW_EX_STYLE::default(),
                    w!("STATIC"),
                    w!(""),
                    WS_OVERLAPPEDWINDOW,
                    100,
                    100,
                    1280,
                    800,
                    None,
                    None,
                    None,
                    None,
                )
            }
            .unwrap();
            let frame = frame_size(hwnd).unwrap();
            install(hwnd).unwrap();
            let dpi = unsafe { GetDpiForWindow(hwnd) };
            let minimum = MIN_CONTENT_HEIGHT * f64::from(dpi) / f64::from(BASE_DPI);
            let proposed_width = (minimum * ASPECT_RATIO).round() as i32 + 400;
            let proposed_height = minimum.round() as i32 + 300;
            for edge in WMSZ_LEFT..=WMSZ_BOTTOMRIGHT {
                let original = RECT {
                    left: 100,
                    top: 200,
                    right: 100 + proposed_width + frame.0,
                    bottom: 200 + proposed_height + frame.1,
                };
                let mut rect = original;
                let handled = unsafe {
                    SendMessageW(
                        hwnd,
                        WM_SIZING,
                        Some(WPARAM(edge as usize)),
                        Some(LPARAM(&mut rect as *mut RECT as isize)),
                    )
                };
                assert_eq!(handled, LRESULT(1));
                let width = rect.right - rect.left - frame.0;
                let height = rect.bottom - rect.top - frame.1;
                assert!((f64::from(width) - f64::from(height) * ASPECT_RATIO).abs() <= 1.5);
                if matches!(edge, WMSZ_LEFT | WMSZ_TOPLEFT | WMSZ_BOTTOMLEFT) {
                    assert_eq!(rect.right, original.right);
                } else {
                    assert_eq!(rect.left, original.left);
                }
                if matches!(edge, WMSZ_TOP | WMSZ_TOPLEFT | WMSZ_TOPRIGHT) {
                    assert_eq!(rect.bottom, original.bottom);
                } else {
                    assert_eq!(rect.top, original.top);
                }
            }
            unsafe { DestroyWindow(hwnd) }.unwrap();
        }

        #[test]
        fn minimum_content_size_scales_with_dpi() {
            let mut rect = RECT {
                left: 0,
                top: 0,
                right: 900,
                bottom: 500,
            };
            assert!(constrain_drag(&mut rect, WMSZ_BOTTOMRIGHT, (20, 40), 750.0));
            assert_eq!((rect.right - 20, rect.bottom - 40), (1200, 750));
        }
    }
}
