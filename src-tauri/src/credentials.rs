use zeroize::Zeroizing;

const SERVICE: &str = "com.burn.wallpaper";
const ACCOUNT: &str = "runcomfy-api-key";

/// Stores the RunComfy API key in the operating system credential store.
pub fn save_key(key: Zeroizing<String>) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| format!("打开凭据库失败:{e}"))?;
    entry.set_password(key.as_str()).map_err(|e| format!("保存 Key 失败:{e}"))?;
    drop(key);
    Ok(())
}

/// The returned string is zeroed from memory on drop.
pub fn get_key() -> Result<Option<Zeroizing<String>>, String> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| format!("打开凭据库失败:{e}"))?;
    match entry.get_password() {
        Ok(key) => Ok(Some(Zeroizing::new(key))),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("读取 Key 失败:{e}")),
    }
}

pub fn delete_key() -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE, ACCOUNT).map_err(|e| format!("打开凭据库失败:{e}"))?;
    match entry.delete_credential() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("移除 Key 失败:{e}")),
    }
}
