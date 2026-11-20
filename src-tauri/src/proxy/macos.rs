use core_foundation::base::CFType;
use core_foundation::dictionary::CFDictionary;
use core_foundation::number::CFNumber;
use core_foundation::string::CFString;
use system_configuration::dynamic_store::SCDynamicStoreBuilder;

fn value(proxies: &CFDictionary<CFString, CFType>, key: &str) -> Option<CFType> {
    proxies.find(&CFString::new(key)).map(|value| value.clone())
}

fn string(proxies: &CFDictionary<CFString, CFType>, key: &str) -> Option<String> {
    value(proxies, key)?
        .downcast::<CFString>()
        .map(|value| value.to_string())
}

fn number(proxies: &CFDictionary<CFString, CFType>, key: &str) -> Option<i64> {
    value(proxies, key)?.downcast::<CFNumber>()?.to_i64()
}

fn proxy_url(
    proxies: &CFDictionary<CFString, CFType>,
    prefix: &str,
    scheme: &str,
) -> Option<String> {
    if number(proxies, &format!("{prefix}Enable")) != Some(1) {
        return None;
    }
    let host = string(proxies, &format!("{prefix}Proxy"))?;
    let host = host.trim();
    let port = number(proxies, &format!("{prefix}Port"))?;
    if host.is_empty() || !(1..=65535).contains(&port) {
        return None;
    }
    let host = if host.contains(':') && !host.starts_with('[') {
        format!("[{host}]")
    } else {
        host.to_string()
    };
    Some(format!("{scheme}://{host}:{port}"))
}

pub fn read_system_proxy() -> Option<String> {
    let store = SCDynamicStoreBuilder::new("burn-wallpaper").build()?;
    let proxies = store.get_proxies()?;
    proxy_url(&proxies, "HTTPS", "http")
        .or_else(|| proxy_url(&proxies, "HTTP", "http"))
        .or_else(|| proxy_url(&proxies, "SOCKS", "socks5"))
}
