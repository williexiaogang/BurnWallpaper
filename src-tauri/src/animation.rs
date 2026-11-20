#[cfg(windows)]
pub fn enabled() -> bool {
    use windows::Win32::Foundation::BOOL;
    use windows::Win32::UI::HiDpi::SystemParametersInfoForDpi;
    use windows::Win32::UI::WindowsAndMessaging::SPI_GETCLIENTAREAANIMATION;
    let mut enabled = BOOL(0);
    let ok = unsafe {
        SystemParametersInfoForDpi(
            SPI_GETCLIENTAREAANIMATION.0 as u32,
            0,
            Some(&mut enabled as *mut BOOL as *mut core::ffi::c_void),
            0,
            0,
        )
        .is_ok()
    };
    ok && enabled.as_bool()
}

#[cfg(target_os = "macos")]
pub fn enabled() -> bool {
    !objc2_app_kit::NSWorkspace::sharedWorkspace().accessibilityDisplayShouldReduceMotion()
}

#[cfg(not(any(windows, target_os = "macos")))]
pub fn enabled() -> bool {
    true
}
