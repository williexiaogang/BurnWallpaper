pub fn read_system_proxy() -> Option<String> {
    use windows::Win32::System::Registry::{
        RegGetValueW, HKEY_CURRENT_USER, REG_ROUTINE_FLAGS, RRF_RT_REG_DWORD, RRF_RT_REG_SZ,
    };

    const PATH: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";

    fn query<T>(value_name: &str, flags: REG_ROUTINE_FLAGS, buf: &mut [T]) -> Option<u32> {
        let path = PATH
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect::<Vec<u16>>();
        let name = value_name
            .encode_utf16()
            .chain(std::iter::once(0))
            .collect::<Vec<u16>>();
        let mut cb = (buf.len() * std::mem::size_of::<T>()) as u32;
        let status = unsafe {
            RegGetValueW(
                HKEY_CURRENT_USER,
                windows::core::PCWSTR(path.as_ptr()),
                windows::core::PCWSTR(name.as_ptr()),
                flags,
                None,
                Some(buf.as_mut_ptr() as *mut std::ffi::c_void),
                Some(&mut cb),
            )
        };
        (status == windows::Win32::Foundation::ERROR_SUCCESS).then_some(cb)
    }

    let mut dword = [0u32; 1];
    let cb = query("ProxyEnable", RRF_RT_REG_DWORD, &mut dword)?;
    if cb == 0 || dword[0] == 0 {
        return None;
    }
    let mut buf = vec![0u16; 512];
    let cb = query("ProxyServer", RRF_RT_REG_SZ, &mut buf)?;
    let raw = String::from_utf16_lossy(&buf[..cb as usize / 2]);
    parse_proxy_server(raw.trim_end_matches('\0'))
}

fn parse_proxy_server(raw: &str) -> Option<String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }
    if !raw.contains('=') {
        return Some(with_scheme(raw, "http"));
    }
    let mut http = None;
    let mut https = None;
    let mut socks = None;
    for token in raw.split(';') {
        let (scheme, addr) = token.split_once('=')?;
        let addr = addr.trim();
        if addr.is_empty() {
            continue;
        }
        match scheme.trim().to_ascii_lowercase().as_str() {
            "http" => http = Some(with_scheme(addr, "http")),
            "https" => https = Some(with_scheme(addr, "http")),
            "socks" => socks = Some(with_scheme(addr, "socks5")),
            _ => {}
        }
    }
    https.or(http).or(socks)
}

fn with_scheme(addr: &str, default: &str) -> String {
    if addr.contains("://") {
        addr.to_string()
    } else {
        format!("{default}://{addr}")
    }
}
