use image::{DynamicImage, ImageDecoder, ImageFormat, ImageReader, Limits, Rgb, RgbImage};
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::borrow::Cow;
use std::collections::HashMap;
use std::io::{Cursor, Write};
use std::path::{Path, PathBuf};

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

static CLIENT: std::sync::OnceLock<std::sync::Mutex<Option<(Option<String>, reqwest::Client)>>> = std::sync::OnceLock::new();

fn build_client(proxy_url: Option<&str>) -> GenResult<reqwest::Client> {
    let mut builder = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(60))
        .user_agent(USER_AGENT);
    if let Some(proxy_url) = proxy_url {
        if let Ok(proxy) = reqwest::Proxy::all(proxy_url) {
            builder = builder.proxy(proxy);
        }
    }
    builder.build().map_err(GenError::from)
}

fn client() -> GenResult<reqwest::Client> {
    let proxy_url = crate::proxy::read_system_proxy();
    let cache = CLIENT.get_or_init(|| std::sync::Mutex::new(None));
    let mut cached = cache
        .lock()
        .map_err(|e| GenError::new(GenErrorKind::Unknown, format!("HTTP 客户端状态损坏:{e}")))?;
    if let Some((cached_proxy, client)) = cached.as_ref() {
        if cached_proxy.as_deref() == proxy_url.as_deref() {
            return Ok(client.clone());
        }
    }
    let client = build_client(proxy_url.as_deref())?;
    *cached = Some((proxy_url, client.clone()));
    Ok(client)
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

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelConfig {
    id: String,
    prompt_limit: Option<usize>,
    api: Option<ModelApi>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ModelApi {
    #[serde(default)]
    lowercase_resolution: bool,
    size_field: Option<String>,
    #[serde(default)]
    sizes: HashMap<String, String>,
    #[serde(default)]
    fields: Map<String, Value>,
}

pub fn generation_input(
    model: &str,
    prompt: &str,
    resolution: &str,
    aspect_ratio: &str,
) -> GenResult<Value> {
    static MODELS: std::sync::OnceLock<Result<Vec<ModelConfig>, serde_json::Error>> =
        std::sync::OnceLock::new();
    let models = MODELS.get_or_init(|| serde_json::from_str(include_str!("../../src/model-options.json")));
    let models = models.as_ref().map_err(|error| {
        GenError::new(GenErrorKind::GenerationFailed, format!("模型配置无法读取：{error}"))
    })?;
    let config = models.iter().find(|entry| entry.id == model);
    if let Some(limit) = config.and_then(|entry| entry.prompt_limit) {
        if prompt.chars().count() > limit {
            return Err(GenError::new(GenErrorKind::GenerationFailed, format!("该模型最多支持 {limit} 个字符")));
        }
    }

    let mut input = Map::new();
    input.insert("prompt".into(), json!(prompt));
    let api = config.and_then(|entry| entry.api.as_ref());
    if let Some(api) = api {
        input.extend(api.fields.clone());
    }
    if let Some((api, field)) = api.and_then(|api| api.size_field.as_deref().map(|field| (api, field))) {
        let size = api.sizes.get(aspect_ratio).filter(|_| resolution == "4K").ok_or_else(|| {
            GenError::new(GenErrorKind::GenerationFailed, "该模型不支持所选分辨率与画幅")
        })?;
        input.insert(field.into(), json!(size));
    } else {
        let resolution = if api.is_some_and(|api| api.lowercase_resolution) {
            Cow::Owned(resolution.to_ascii_lowercase())
        } else {
            Cow::Borrowed(resolution)
        };
        input.insert("resolution".into(), json!(resolution));
        input.insert("aspect_ratio".into(), json!(aspect_ratio));
    }
    Ok(Value::Object(input))
}

#[cfg(test)]
mod generation_input_tests {
    use super::*;

    #[test]
    fn builds_the_quoted_4k_request_for_every_catalog_model() {
        let catalog: Vec<Value> =
            serde_json::from_str(include_str!("../../src/model-options.json")).unwrap();
        for model in catalog {
            let id = model["id"].as_str().unwrap();
            assert!(model["priceUsd"].as_f64().unwrap() < 0.085, "{id}");
            let ratios = model["ratios"].as_array().unwrap();
            assert!(ratios.contains(&json!("16:9")), "{id}");
            for ratio in ratios {
                let ratio = ratio.as_str().unwrap();
                let input = generation_input(id, "A pine forest", "4K", ratio).unwrap();
                assert_eq!(input["prompt"], "A pine forest", "{id}");
                match id {
                    "bytedance/dreamina-4-0/text-to-image" => {
                        assert!(input["width×height"].as_str().unwrap().ends_with(&format!("({ratio})")));
                        assert_eq!(input["force_single"], true);
                        assert!(input.get("resolution").is_none());
                        assert!(input.get("aspect_ratio").is_none());
                    }
                    "openai/gpt-image-2/text-to-image" => {
                        assert_eq!(input["quality"], "low");
                        assert_eq!(input["resolution"], "4k");
                        assert_eq!(input["aspect_ratio"], ratio);
                    }
                    "openai/gpt-image-2.5/flare/text-to-image" |
                    "openai/gpt-image-2.5/sunburst/text-to-image" => {
                        assert_eq!(input["quality"], "medium");
                        assert_eq!(input["resolution"], "4k");
                        assert_eq!(input["aspect_ratio"], ratio);
                    }
                    "blackforestlabs/flux-3-image-klein/text-to-image" => {
                        assert_eq!(input["resolution"], "4k");
                        assert_eq!(input["aspect_ratio"], ratio);
                    }
                    "vidu/q2/text-to-image" => {
                        assert_eq!(input["resolution"], "4K");
                        assert_eq!(input["aspect_ratio"], ratio);
                    }
                    _ => {
                        assert_eq!(input["resolution"], "4K");
                        assert_eq!(input["aspect_ratio"], ratio);
                        assert!(input.get("quality").is_none());
                    }
                }
            }
        }
    }

    #[test]
    fn rejects_invalid_dimension_and_prompt_before_submitting() {
        let id = "bytedance/dreamina-4-0/text-to-image";
        assert!(generation_input(id, "A pine forest", "4K", "9:16").is_err());
        assert!(generation_input(id, &"山".repeat(800), "4K", "16:9").is_err());
        assert!(generation_input(id, &"山".repeat(799), "4K", "16:9").is_ok());
    }

    #[test]
    fn keeps_the_original_settings_for_legacy_retries() {
        let input = generation_input(
            "bytedance/seedream-5.5/text-to-image", "A pine forest", "2K", "9:16",
        )
        .unwrap();
        assert_eq!(input, json!({"prompt":"A pine forest", "resolution":"2K", "aspect_ratio":"9:16"}));
    }
}

#[derive(Deserialize)]
struct SubmitResponse {
    request_id: String,
}

pub async fn submit(
    api_key: &str,
    model: &str,
    input: &Value,
) -> GenResult<String> {
    let response = client()?
        .post(format!("{API_BASE}/models/{model}"))
        .bearer_auth(api_key)
        .json(input)
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

fn as_jpeg(bytes: &[u8]) -> image::ImageResult<Cow<'_, [u8]>> {
    let format = image::guess_format(bytes)?;
    let mut decoder = ImageReader::with_format(Cursor::new(bytes), format).into_decoder()?;
    let mut limits = Limits::default();
    limits.reserve(decoder.total_bytes())?;
    decoder.set_limits(limits)?;
    let orientation = decoder.orientation()?;
    let mut image = DynamicImage::from_decoder(decoder)?;
    if format == ImageFormat::Jpeg {
        return Ok(Cow::Borrowed(bytes));
    }

    image.apply_orientation(orientation);
    let pixels = if image.color().has_alpha() {
        let rgba = image.into_rgba8();
        RgbImage::from_fn(rgba.width(), rgba.height(), |x, y| {
            let [r, g, b, a] = rgba.get_pixel(x, y).0.map(u16::from);
            Rgb([r, g, b].map(|channel| {
                ((channel * a + 255 * (255 - a) + 127) / 255) as u8
            }))
        })
    } else {
        image.into_rgb8()
    };
    let mut encoded = Vec::new();
    image::codecs::jpeg::JpegEncoder::new_with_quality(&mut encoded, 94).encode_image(&pixels)?;
    Ok(Cow::Owned(encoded))
}

fn save_download_as_jpeg(bytes: &[u8], dest: &Path) -> GenResult<()> {
    let jpeg = as_jpeg(bytes).map_err(|error| {
        GenError::new(
            GenErrorKind::GenerationFailed,
            format!("图片格式无法转换为 JPG:{error}"),
        )
    })?;
    let write = || -> std::io::Result<()> {
        let mut temporary =
            tempfile::NamedTempFile::new_in(dest.parent().unwrap_or(Path::new(".")))?;
        temporary.write_all(&jpeg)?;
        temporary.persist_noclobber(dest)?;
        Ok(())
    };
    write().map_err(|error| GenError::new(GenErrorKind::Unknown, format!("写入 JPG 失败:{error}")))
}

pub async fn download(url: &str, dest_dir: &Path, base_name: &str) -> GenResult<PathBuf> {
    let response = client()?.get(url).send().await?;
    if !response.status().is_success() {
        return Err(GenError::new(GenErrorKind::NetworkFailed, "下载图片失败，再试一次"));
    }
    let bytes = response.bytes().await?;
    let dest = dest_dir.join(format!("{base_name}.jpg"));
    tauri::async_runtime::spawn_blocking(move || {
        save_download_as_jpeg(&bytes, &dest)?;
        Ok(dest)
    })
    .await
    .map_err(|error| GenError::new(GenErrorKind::Unknown, format!("图片转换任务失败:{error}")))?
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
mod download_tests {
    use super::*;

    fn fixture(format: ImageFormat) -> Vec<u8> {
        let image = DynamicImage::ImageRgb8(RgbImage::from_pixel(32, 20, Rgb([30, 120, 200])));
        let image = if format == ImageFormat::Ico {
            DynamicImage::ImageRgba8(image.into_rgba8())
        } else {
            image
        };
        let mut encoded = Cursor::new(Vec::new());
        image.write_to(&mut encoded, format).unwrap();
        encoded.into_inner()
    }

    #[test]
    fn saves_downloaded_raster_formats_as_jpeg() {
        let folder = tempfile::tempdir().unwrap();
        for format in [
            ImageFormat::Png,
            ImageFormat::WebP,
            ImageFormat::Bmp,
            ImageFormat::Gif,
            ImageFormat::Ico,
            ImageFormat::Tiff,
        ] {
            let path = folder.path().join(format!("{format:?}.jpg"));
            save_download_as_jpeg(&fixture(format), &path).unwrap();
            let bytes = std::fs::read(path).unwrap();
            assert_eq!(image::guess_format(&bytes).unwrap(), ImageFormat::Jpeg);
            let decoded = image::load_from_memory(&bytes).unwrap();
            assert_eq!((decoded.width(), decoded.height()), (32, 20));
        }
    }

    #[test]
    fn flattens_transparent_png_on_white() {
        let source = DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(
            16,
            16,
            image::Rgba([255, 0, 0, 0]),
        ));
        let mut encoded = Cursor::new(Vec::new());
        source.write_to(&mut encoded, ImageFormat::Png).unwrap();
        let jpeg = as_jpeg(encoded.get_ref()).unwrap();
        let decoded = image::load_from_memory(&jpeg).unwrap().into_rgb8();
        assert_eq!(decoded.get_pixel(8, 8).0, [255, 255, 255]);
    }

    #[test]
    fn validates_jpeg_without_reencoding_or_overwriting() {
        let folder = tempfile::tempdir().unwrap();
        let valid = fixture(ImageFormat::Jpeg);
        let path = folder.path().join("valid.jpg");
        save_download_as_jpeg(&valid, &path).unwrap();
        assert!(save_download_as_jpeg(&fixture(ImageFormat::Png), &path).is_err());
        assert_eq!(std::fs::read(&path).unwrap(), valid);

        let broken = folder.path().join("broken.jpg");
        assert!(save_download_as_jpeg(&valid[..12], &broken).is_err());
        assert!(!broken.exists());
        assert!(save_download_as_jpeg(b"<html>not an image</html>", &broken).is_err());
        assert!(!broken.exists());
    }
}
