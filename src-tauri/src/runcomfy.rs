use serde::{Deserialize, Serialize};

const API_BASE: &str = "https://model-api.runcomfy.net/v1";
const ACCOUNT_API_BASE: &str = "https://api.runcomfy.net/prod/v2";
const USER_AGENT: &str = "burn-wallpaper/0.1";
const POLL_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(600);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum GenErrorKind {
    NoApiKey,
    InvalidKey,
    QuotaExhausted,
    RateLimited,
    ContentRejected,
    NetworkFailed,
    TimedOut,
    GenerationFailed,
    Unknown,
}

#[derive(Debug, Clone, Serialize)]
pub struct GenError {
    pub kind: GenErrorKind,
    pub message: String,
}

impl GenError {
    pub fn new(kind: GenErrorKind, message: impl Into<String>) -> Self {
        Self { kind, message: message.into() }
    }
}

impl From<reqwest::Error> for GenError {
    fn from(err: reqwest::Error) -> Self {
        if err.is_timeout() {
            GenError::new(GenErrorKind::TimedOut, format!("等待超时，稍后再试（{err:?}）"))
        } else if err.is_connect() {
            GenError::new(GenErrorKind::NetworkFailed, format!("网络断了，检查连接后再来（{err:?}）"))
        } else {
            GenError::new(GenErrorKind::Unknown, format!("请求失败:{err:?}"))
        }
    }
}

pub type GenResult<T> = Result<T, GenError>;

/// Reads the Windows system proxy (Internet Settings) so requests follow
/// tools like Clash/V2ray that set the system proxy without env vars.
fn read_system_proxy() -> Option<String> {
    use windows::Win32::System::Registry::{RegGetValueW, HKEY_CURRENT_USER, REG_ROUTINE_FLAGS, RRF_RT_REG_DWORD, RRF_RT_REG_SZ};

    const PATH: &str = "Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings";

    fn query<T>(value_name: &str, flags: REG_ROUTINE_FLAGS, buf: &mut [T]) -> Option<u32> {
        let path = PATH.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
        let name = value_name.encode_utf16().chain(std::iter::once(0)).collect::<Vec<u16>>();
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

/// "127.0.0.1:7777" -> http proxy for all; "http=a:1;https=b:2" -> per scheme; "socks=a:1" -> socks5.
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

static SYSTEM_PROXY: std::sync::OnceLock<Option<String>> = std::sync::OnceLock::new();

fn system_proxy() -> Option<&'static str> {
    SYSTEM_PROXY.get_or_init(read_system_proxy).as_deref()
}

fn client() -> GenResult<reqwest::Client> {
    let mut builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .user_agent(USER_AGENT);
    if let Some(proxy_url) = system_proxy() {
        if let Ok(proxy) = reqwest::Proxy::all(proxy_url) {
            builder = builder.proxy(proxy);
        }
    }
    builder.build().map_err(GenError::from)
}

fn map_http_error(status: reqwest::StatusCode, body: String) -> GenError {
    let short: String = body.chars().take(160).collect();
    match status.as_u16() {
        401 | 403 => GenError::new(GenErrorKind::InvalidKey, "Key 无效，去设置里换一个"),
        402 => GenError::new(GenErrorKind::QuotaExhausted, "额度用完了，先去充一波"),
        429 => GenError::new(GenErrorKind::RateLimited, "请求太密，喘口气再来"),
        _ => GenError::new(GenErrorKind::Unknown, format!("服务端出错（{status}）:{short}")),
    }
}

#[derive(Serialize)]
struct SubmitBody<'a> {
    prompt: &'a str,
    resolution: &'a str,
    aspect_ratio: &'a str,
}

#[derive(Deserialize)]
struct SubmitResponse {
    request_id: String,
}

pub async fn submit(
    api_key: &str,
    model: &str,
    prompt: &str,
    resolution: &str,
    aspect_ratio: &str,
) -> GenResult<String> {
    let response = client()?
        .post(format!("{API_BASE}/models/{model}"))
        .bearer_auth(api_key)
        .json(&SubmitBody { prompt, resolution, aspect_ratio })
        .send()
        .await?;
    let status = response.status();
    if !status.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(map_http_error(status, body));
    }
    Ok(response.json::<SubmitResponse>().await?.request_id)
}

#[derive(Deserialize)]
#[allow(dead_code)]
struct StatusResponse {
    #[serde(alias = "state")]
    status: String,
}

#[allow(dead_code)]
pub async fn status(api_key: &str, request_id: &str) -> GenResult<String> {
    let response = client()?
        .get(format!("{API_BASE}/requests/{request_id}/status"))
        .bearer_auth(api_key)
        .send()
        .await?;
    let code = response.status();
    if !code.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(map_http_error(code, body));
    }
    Ok(response.json::<StatusResponse>().await?.status)
}

#[derive(Deserialize)]
struct ResultResponse {
    #[serde(default, alias = "status")]
    state: Option<String>,
    #[serde(default)]
    error: Option<serde_json::Value>,
    output: Option<OutputUrls>,
}

#[derive(Deserialize)]
struct OutputUrls {
    image: Option<String>,
    images: Option<Vec<String>>,
    #[serde(default)]
    url: Option<String>,
    #[serde(default)]
    urls: Option<Vec<String>>,
}

/// Returns `Some(urls)` once the job is complete, `None` while still running.
pub async fn result_urls(api_key: &str, request_id: &str) -> GenResult<Option<Vec<String>>> {
    let response = client()?
        .get(format!("{API_BASE}/requests/{request_id}/result"))
        .bearer_auth(api_key)
        .send()
        .await?;
    let code = response.status();
    let raw = response.text().await.unwrap_or_default();
    if !code.is_success() {
        return Err(map_http_error(code, raw));
    }
    let payload: ResultResponse = match serde_json::from_str(&raw) {
        Ok(payload) => payload,
        Err(_) => {
            let short: String = raw.chars().take(200).collect();
            return Err(GenError::new(GenErrorKind::Unknown, format!("结果格式看不懂:{short}")));
        }
    };
    match payload.state.as_deref() {
        Some("completed") | None => {
            let urls: Vec<String> = payload
                .output
                .map(|o| {
                    o.images
                        .unwrap_or_default()
                        .into_iter()
                        .chain(o.image)
                        .chain(o.urls.unwrap_or_default())
                        .chain(o.url)
                        .collect()
                })
                .unwrap_or_default();
            if urls.is_empty() {
                let short: String = raw.chars().take(200).collect();
                Err(GenError::new(GenErrorKind::GenerationFailed, format!("出图完成但没拿到图片地址，原始响应:{short}")))
            } else {
                Ok(Some(urls))
            }
        }
        Some("cancelled") => Err(GenError::new(GenErrorKind::GenerationFailed, "这次请求被取消了")),
        Some("failed") => {
            let raw = payload.error.map(|e| e.to_string()).unwrap_or_default();
            let lowered = raw.to_lowercase();
            if ["content", "safety", "policy", "moderation", "block"]
                .iter()
                .any(|needle| lowered.contains(needle))
            {
                Err(GenError::new(GenErrorKind::ContentRejected, "内容被拒，换个说法再来"))
            } else {
                let short: String = raw.chars().take(120).collect();
                Err(GenError::new(GenErrorKind::GenerationFailed, format!("出图失败:{short}")))
            }
        }
        _ => Ok(None),
    }
}

pub async fn cancel(api_key: &str, request_id: &str) -> GenResult<()> {
    let response = client()?
        .post(format!("{API_BASE}/requests/{request_id}/cancel"))
        .bearer_auth(api_key)
        .send()
        .await?;
    if !response.status().is_success() {
        let code = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(map_http_error(code, body));
    }
    Ok(())
}

/// Validates the key with the read-only account balance endpoint.
/// This never starts a job and never costs credits.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BalanceInfo {
    pub balance_usd: f64,
    pub balance_microdollars: i64,
}

pub async fn get_balance(api_key: &str) -> GenResult<BalanceInfo> {
    let response = client()?
        .get(format!("{ACCOUNT_API_BASE}/balance"))
        .bearer_auth(api_key)
        .send()
        .await
        .map_err(GenError::from)?;
    let code = response.status();
    if !code.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(map_http_error(code, body));
    }
    #[derive(Deserialize)]
    struct BalanceResponse {
        balance_usd: Option<f64>,
        balance_microdollars: Option<i64>,
        #[serde(default)]
        error_code: Option<serde_json::Value>,
        #[serde(default)]
        error_message: Option<String>,
    }
    let payload: BalanceResponse = response.json().await?;
    if let Some(error_code) = payload.error_code {
        return Err(GenError::new(
            GenErrorKind::Unknown,
            payload.error_message.unwrap_or_else(|| format!("余额查询出错（{error_code}）")),
        ));
    }
    Ok(BalanceInfo {
        balance_usd: payload.balance_usd.unwrap_or(0.0),
        balance_microdollars: payload.balance_microdollars.unwrap_or(0),
    })
}

/// RunComfy playground prompt enhancement (no auth required).
pub async fn enhance_prompt(prompt: &str) -> GenResult<String> {
    #[derive(Serialize)]
    struct EnhanceBody<'a> {
        task: &'a str,
        prompt: &'a str,
    }

    #[derive(Deserialize)]
    struct EnhanceResponse {
        prompt: String,
    }

    let response = client()?
        .post("https://playground-api.runcomfy.net/prod/api/prompts/enhance")
        .json(&EnhanceBody { task: "text-to-image", prompt })
        .send()
        .await?;
    let code = response.status();
    if !code.is_success() {
        let body = response.text().await.unwrap_or_default();
        return Err(map_http_error(code, body));
    }
    Ok(response.json::<EnhanceResponse>().await?.prompt)
}

pub async fn download(url: &str, dest_dir: &std::path::Path, base_name: &str) -> GenResult<std::path::PathBuf> {
    let response = client()?.get(url).send().await?;
    if !response.status().is_success() {
        return Err(GenError::new(GenErrorKind::NetworkFailed, "下载图片失败，再试一次"));
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_string();
    let bytes = response.bytes().await?;
    let ext = if let Some(ext) = url.split('?').next().and_then(|p| p.rsplit('.').next()).filter(|e| e.len() <= 5 && e.chars().all(|c| c.is_ascii_alphanumeric())) {
        ext.to_string()
    } else if content_type.contains("jpeg") {
        "jpg".to_string()
    } else if content_type.contains("png") {
        "png".to_string()
    } else if content_type.contains("webp") {
        "webp".to_string()
    } else {
        "png".to_string()
    };
    let dest = dest_dir.join(format!("{base_name}.{ext}"));
    std::fs::write(&dest, &bytes)
        .map_err(|e| GenError::new(GenErrorKind::Unknown, format!("写入图片失败:{e}")))?;
    Ok(dest)
}

pub fn poll_timeout() -> std::time::Duration {
    POLL_TIMEOUT
}

/// Adaptive polling: failures surface within seconds, success needs 100s+,
/// so poll densely at the start, coast through the middle, tighten near completion.
pub fn poll_delay(elapsed: std::time::Duration) -> std::time::Duration {
    match elapsed.as_secs() {
        0..=20 => std::time::Duration::from_secs(3),
        21..=100 => std::time::Duration::from_secs(10),
        _ => std::time::Duration::from_secs(5),
    }
}
