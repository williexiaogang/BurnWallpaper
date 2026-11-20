#[cfg(target_os = "macos")]
mod macos;
#[cfg(windows)]
mod windows;

#[cfg(target_os = "macos")]
pub use macos::read_system_proxy;
#[cfg(windows)]
pub use windows::read_system_proxy;

#[cfg(not(any(windows, target_os = "macos")))]
pub fn read_system_proxy() -> Option<String> {
    None
}
