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
        let detail = err.to_string();
        if err.is_timeout() {
            GenError::new(GenErrorKind::TimedOut, format!("等待超时，稍后再试（{detail}）"))
        } else if err.is_connect() {
            GenError::new(GenErrorKind::NetworkFailed, format!("网络断了，检查连接后再来（{detail}）"))
        } else {
            GenError::new(GenErrorKind::Unknown, format!("请求失败:{detail}"))
        }
    }
}

pub type GenResult<T> = Result<T, GenError>;

/// Reads the Windows system proxy (Internet Settings) so requests follow
/// tools like Clash/V2ray that set the system proxy without env vars.
#[cfg(windows)]
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

#[cfg(not(windows))]
fn read_system_proxy() -> Option<String> {
    None
}

/// "127.0.0.1:7777" -> http proxy for all; "http=a:1;https=b:2" -> per scheme; "socks=a:1" -> socks5.
/// A segment without `=` is skipped so one bad token does not drop the rest.
pub(crate) fn parse_proxy_server(raw: &str) -> Option<String> {
    let raw = raw.trim();
    if raw.is_empty() {
        return None;
    }
    if !raw.contains('=') {
        if raw.eq_ignore_ascii_case("direct") {
            return None;
        }
        return Some(with_scheme(raw, "http"));
    }
    let mut http = None;
    let mut https = None;
    let mut socks = None;
    for token in raw.split(';') {
        let Some((scheme, addr)) = token.split_once('=') else {
            continue;
        };
        if scheme.trim().eq_ignore_ascii_case("direct") {
            continue;
        }
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

struct ProxyCache {
    value: Option<String>,
    read_at: std::time::Instant,
}

static SYSTEM_PROXY: std::sync::Mutex<Option<ProxyCache>> = std::sync::Mutex::new(None);
const PROXY_TTL: std::time::Duration = std::time::Duration::from_secs(15);

fn system_proxy() -> Option<String> {
    let Ok(mut guard) = SYSTEM_PROXY.lock() else {
        return read_system_proxy();
    };
    if let Some(cache) = guard.as_ref() {
        if cache.read_at.elapsed() < PROXY_TTL {
            return cache.value.clone();
        }
    }
    let value = read_system_proxy();
    *guard = Some(ProxyCache { value: value.clone(), read_at: std::time::Instant::now() });
    value
}

fn base_builder() -> reqwest::ClientBuilder {
    let mut builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .user_agent(USER_AGENT);
    if let Some(proxy_url) = system_proxy() {
        if let Ok(proxy) = reqwest::Proxy::all(&proxy_url) {
            builder = builder.proxy(proxy);
        }
    }
    builder
}

fn client() -> GenResult<reqwest::Client> {
    base_builder().build().map_err(GenError::from)
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
        Some("completed") => urls_from_output(&payload, &raw),
        // A body with no state and no images is still in progress. Treating it as
        // failure used to abandon a billed job on the first ambiguous poll.
        None => {
            let urls = output_urls(&payload);
            if urls.is_empty() {
                Ok(None)
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

fn output_urls(payload: &ResultResponse) -> Vec<String> {
    payload
        .output
        .as_ref()
        .map(|output| {
            output
                .images
                .clone()
                .unwrap_or_default()
                .into_iter()
                .chain(output.image.clone())
                .chain(output.urls.clone().unwrap_or_default())
                .chain(output.url.clone())
                .collect()
        })
        .unwrap_or_default()
}

fn urls_from_output(payload: &ResultResponse, raw: &str) -> GenResult<Option<Vec<String>>> {
    let urls = output_urls(payload);
    if urls.is_empty() {
        let short: String = raw.chars().take(200).collect();
        Err(GenError::new(GenErrorKind::GenerationFailed, format!("出图完成但没拿到图片地址，原始响应:{short}")))
    } else {
        Ok(Some(urls))
    }
}

const MAX_IMAGE_BYTES: usize = 80 * 1024 * 1024;

pub(crate) fn reject_image_host(host: &str) -> Result<(), String> {
    let host = host.trim_matches(['[', ']']).trim_end_matches('.').to_ascii_lowercase();
    if host.is_empty()
        || host == "localhost"
        || host.ends_with(".localhost")
        || host.ends_with(".local")
        || host == "metadata.google.internal"
    {
        return Err("图片地址被拒绝".into());
    }
    if let Ok(ip) = host.parse::<std::net::IpAddr>() {
        if blocked_ip(ip) {
            return Err("图片地址被拒绝".into());
        }
    }
    Ok(())
}

fn blocked_ip(ip: std::net::IpAddr) -> bool {
    match ip {
        std::net::IpAddr::V4(v4) => {
            v4.is_private()
                || v4.is_loopback()
                || v4.is_link_local()
                || v4.is_unspecified()
                || v4.is_multicast()
                || v4.is_broadcast()
                || v4.is_documentation()
                || v4.octets()[0] == 0
        }
        std::net::IpAddr::V6(v6) => {
            if v6.is_loopback() || v6.is_unspecified() || v6.is_multicast() {
                return true;
            }
            let octets = v6.octets();
            if octets[0] == 0xfe && (octets[1] & 0xc0) == 0x80 {
                return true;
            }
            if (octets[0] & 0xfe) == 0xfc {
                return true;
            }
            v6.to_ipv4_mapped().is_some_and(|mapped| blocked_ip(std::net::IpAddr::V4(mapped)))
        }
    }
}

pub(crate) fn syntactic_image_url(raw: &str) -> Result<reqwest::Url, String> {
    let url = reqwest::Url::parse(raw).map_err(|_| "图片地址无效".to_string())?;
    if url.scheme() != "https" {
        return Err("只接受 https 图片地址".into());
    }
    let host = url.host_str().ok_or("图片地址无效")?;
    reject_image_host(host)?;
    Ok(url)
}

fn ensure_public_resolution(url: &reqwest::Url) -> Result<(), String> {
    use std::net::ToSocketAddrs;
    let host = url.host_str().ok_or("图片地址无效")?;
    let port = url.port().unwrap_or(443);
    let mut any = false;
    for addr in (host, port).to_socket_addrs().map_err(|_| "图片地址无法解析".to_string())? {
        any = true;
        if blocked_ip(addr.ip()) {
            return Err("图片地址被拒绝".into());
        }
    }
    if any { Ok(()) } else { Err("图片地址无法解析".into()) }
}

fn validate_download_target(raw: &str) -> GenResult<reqwest::Url> {
    let url = syntactic_image_url(raw).map_err(|message| GenError::new(GenErrorKind::NetworkFailed, message))?;
    ensure_public_resolution(&url).map_err(|message| GenError::new(GenErrorKind::NetworkFailed, message))?;
    Ok(url)
}

fn download_client() -> GenResult<reqwest::Client> {
    base_builder()
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 3 {
                return attempt.error(std::io::Error::new(std::io::ErrorKind::Other, "图片重定向过多"));
            }
            match syntactic_image_url(attempt.url().as_str()).and_then(|url| ensure_public_resolution(&url)) {
                Ok(()) => attempt.follow(),
                Err(message) => attempt.error(std::io::Error::new(std::io::ErrorKind::Other, message)),
            }
        }))
        .build()
        .map_err(GenError::from)
}

fn sniff_image_ext(bytes: &[u8]) -> Option<&'static str> {
    if bytes.starts_with(&[0x89, b'P', b'N', b'G']) {
        return Some("png");
    }
    if bytes.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Some("jpg");
    }
    if bytes.len() >= 12 && &bytes[0..4] == b"RIFF" && &bytes[8..12] == b"WEBP" {
        return Some("webp");
    }
    if bytes.starts_with(b"GIF8") {
        return Some("gif");
    }
    if bytes.starts_with(b"BM") {
        return Some("bmp");
    }
    None
}

pub async fn download(url: &str, dest_dir: &std::path::Path, base_name: &str) -> GenResult<std::path::PathBuf> {
    let parsed = validate_download_target(url)?;
    let mut response = download_client()?.get(parsed).send().await?;
    if !response.status().is_success() {
        return Err(GenError::new(GenErrorKind::NetworkFailed, "下载图片失败，再试一次"));
    }
    if response.content_length().is_some_and(|len| len > MAX_IMAGE_BYTES as u64) {
        return Err(GenError::new(GenErrorKind::NetworkFailed, "图片太大，已拒绝下载"));
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if content_type.contains("text/html") || content_type.contains("application/json") {
        return Err(GenError::new(GenErrorKind::NetworkFailed, "下载到的不是图片"));
    }
    let partial = dest_dir.join(format!("{base_name}.partial"));
    let mut file = std::fs::File::create(&partial).map_err(|error| GenError::new(GenErrorKind::Unknown, format!("写入图片失败:{error}")))?;
    let mut total = 0usize;
    let mut header = Vec::new();
    loop {
        let Some(chunk) = response.chunk().await? else { break };
        total += chunk.len();
        if total > MAX_IMAGE_BYTES {
            drop(file);
            let _ = std::fs::remove_file(&partial);
            return Err(GenError::new(GenErrorKind::NetworkFailed, "图片太大，已拒绝下载"));
        }
        if header.len() < 16 {
            let take = (16 - header.len()).min(chunk.len());
            header.extend_from_slice(&chunk[..take]);
        }
        std::io::Write::write_all(&mut file, &chunk).map_err(|error| GenError::new(GenErrorKind::Unknown, format!("写入图片失败:{error}")))?;
    }
    drop(file);
    let Some(ext) = sniff_image_ext(&header) else {
        let _ = std::fs::remove_file(&partial);
        return Err(GenError::new(GenErrorKind::NetworkFailed, "下载到的不是图片"));
    };
    let dest = dest_dir.join(format!("{base_name}.{ext}"));
    if dest.exists() {
        std::fs::remove_file(&dest).map_err(|error| GenError::new(GenErrorKind::Unknown, format!("替换图片失败:{error}")))?;
    }
    std::fs::rename(&partial, &dest).map_err(|error| GenError::new(GenErrorKind::Unknown, format!("保存图片失败:{error}")))?;
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

#[cfg(test)]
mod tests {
    use super::{parse_proxy_server, reject_image_host, sniff_image_ext, syntactic_image_url};

    #[test]
    fn proxy_parser_keeps_valid_segments() {
        assert_eq!(parse_proxy_server("127.0.0.1:7890").as_deref(), Some("http://127.0.0.1:7890"));
        assert_eq!(
            parse_proxy_server("http=127.0.0.1:7890;direct;https=127.0.0.1:7891").as_deref(),
            Some("http://127.0.0.1:7891")
        );
        assert_eq!(parse_proxy_server("socks=127.0.0.1:1080").as_deref(), Some("socks5://127.0.0.1:1080"));
        assert_eq!(parse_proxy_server("").as_deref(), None);
        assert_eq!(parse_proxy_server("direct").as_deref(), None);
    }

    #[test]
    fn image_urls_reject_local_and_non_https() {
        assert!(syntactic_image_url("https://cdn.example.com/a.png").is_ok());
        assert!(syntactic_image_url("http://cdn.example.com/a.png").is_err());
        assert!(syntactic_image_url("https://127.0.0.1/a.png").is_err());
        assert!(syntactic_image_url("https://10.1.2.3/a.png").is_err());
        assert!(syntactic_image_url("https://169.254.169.254/latest").is_err());
        assert!(syntactic_image_url("https://localhost/a.png").is_err());
        assert!(reject_image_host("8.8.8.8").is_ok());
        assert!(reject_image_host("192.168.0.1").is_err());
    }

    #[test]
    fn sniff_requires_real_image_bytes() {
        assert_eq!(sniff_image_ext(b"\x89PNG\r\n\x1a\n"), Some("png"));
        assert_eq!(sniff_image_ext(b"\xFF\xD8\xFF\xE0"), Some("jpg"));
        assert_eq!(sniff_image_ext(b"<html>nope"), None);
    }
}
