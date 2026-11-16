use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};
use zeroize::Zeroizing;

use crate::credentials;
use crate::db::WallpaperRecord;
use crate::runcomfy::{self, GenError, GenErrorKind};
use crate::AppState;

pub struct GenerationState {
    pub cancelled: Mutex<HashSet<String>>,
    pub active: Mutex<HashSet<String>>,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratePayload {
    pub model: String,
    pub prompt: String,
    pub resolution: String,
    pub aspect_ratio: String,
    pub style_name: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ProgressPayload {
    pub request_id: String,
    pub state: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DonePayload {
    pub request_id: String,
    pub wallpaper: WallpaperRecord,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ErrorPayload {
    pub request_id: String,
    #[serde(flatten)]
    pub error: GenError,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApplyPayload {
    pub path: Option<String>,
    pub data_base64: Option<String>,
    pub file_name: Option<String>,
    pub monitor_id: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StorageDirInfo {
    pub path: String,
    pub is_default: bool,
}

/// Effective download directory for generated wallpapers.
fn wallpaper_dir(state: &AppState) -> Result<std::path::PathBuf, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    if let Some(custom) = db.get_setting("wallpaper_dir")? {
        if !custom.trim().is_empty() {
            return Ok(std::path::PathBuf::from(custom));
        }
    }
    Ok(state.data_dir.join("wallpapers"))
}

#[tauri::command]
pub fn get_storage_dir(state: State<'_, AppState>) -> Result<StorageDirInfo, String> {
    let dir = wallpaper_dir(&state)?;
    Ok(StorageDirInfo {
        is_default: dir == state.data_dir.join("wallpapers"),
        path: dir.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
pub async fn pick_storage_dir(app: AppHandle, state: State<'_, AppState>) -> Result<StorageDirInfo, String> {
    let picked = rfd::AsyncFileDialog::new()
        .set_title("选择壁纸存储位置")
        .pick_folder()
        .await;
    match picked {
        Some(handle) => {
            let path = handle.path().to_path_buf();
            std::fs::create_dir_all(&path).map_err(|e| format!("创建目录失败:{e}"))?;
            state
                .db
                .lock()
                .map_err(|e| e.to_string())?
                .set_setting("wallpaper_dir", &path.to_string_lossy())?;
            app.asset_protocol_scope()
                .allow_directory(&path, true)
                .map_err(|e| format!("开放目录读取失败:{e}"))?;
            Ok(StorageDirInfo { is_default: false, path: path.to_string_lossy().into_owned() })
        }
        None => get_storage_dir(state),
    }
}

#[tauri::command]
pub fn reset_storage_dir(state: State<'_, AppState>) -> Result<StorageDirInfo, String> {
    state.db.lock().map_err(|e| e.to_string())?.set_setting("wallpaper_dir", "")?;
    get_storage_dir(state)
}

#[tauri::command]
pub fn get_app_setting(state: State<'_, AppState>, key: String) -> Result<Option<String>, String> {
    state.db.lock().map_err(|e| e.to_string())?.get_setting(&key)
}

#[tauri::command]
pub fn set_app_setting(state: State<'_, AppState>, key: String, value: String) -> Result<(), String> {
    state.db.lock().map_err(|e| e.to_string())?.set_setting(&key, &value)
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CutoutMeta {
    model: String,
    source: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CutoutRecord {
    pub path: String,
    pub model: String,
    pub source: String,
}

fn cutout_stem(id: &str) -> String {
    let safe: String = id
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() || ch == '-' || ch == '_' { ch } else { '_' })
        .collect();
    if safe.is_empty() { "cutout".to_string() } else { safe }
}

fn known_cutout_model(model: &str) -> Result<&str, String> {
    match model {
        "modnet" | "animeseg" | "birefnet" => Ok(model),
        _ => Err("抠像模型无效".to_string()),
    }
}

fn cutout_file_pair(dir: &std::path::Path, stem: &str) -> (std::path::PathBuf, std::path::PathBuf) {
    (dir.join(format!("{stem}.png")), dir.join(format!("{stem}.json")))
}

fn cutout_dir(state: &AppState) -> std::path::PathBuf {
    state.data_dir.join("cutouts")
}

fn cutout_paths(state: &AppState, id: &str, model: &str) -> Result<(std::path::PathBuf, std::path::PathBuf), String> {
    let model = known_cutout_model(model)?;
    let stem = format!("{}_{model}", cutout_stem(id));
    Ok(cutout_file_pair(&cutout_dir(state), &stem))
}

fn read_cutout_pair(png: &std::path::Path, meta_path: &std::path::Path) -> Result<Option<CutoutRecord>, String> {
    if !png.is_file() || !meta_path.is_file() {
        return Ok(None);
    }
    let text = std::fs::read_to_string(meta_path).map_err(|e| format!("读取抠像记录失败:{e}"))?;
    let meta: CutoutMeta = serde_json::from_str(&text).map_err(|e| format!("抠像记录损坏:{e}"))?;
    Ok(Some(CutoutRecord {
        path: png.to_string_lossy().into_owned(),
        model: meta.model,
        source: meta.source,
    }))
}

/// Previously computed foreground cutout for this wallpaper, whichever model produced it.
/// Layout history: single `{id}` file → per-model `{id}_{model}` files → back to single `{id}`
/// (one cutout per wallpaper; switching models no longer re-runs segmentation).
#[tauri::command]
pub fn read_cutout(state: State<'_, AppState>, wallpaper_id: String) -> Result<Option<CutoutRecord>, String> {
    let dir = cutout_dir(&state);
    let (legacy_png, legacy_meta) = cutout_file_pair(&dir, &cutout_stem(&wallpaper_id));
    if let Some(record) = read_cutout_pair(&legacy_png, &legacy_meta)? {
        return Ok(Some(record));
    }
    for model in ["modnet", "animeseg", "birefnet"] {
        let stem = format!("{}_{}", cutout_stem(&wallpaper_id), model);
        let (png, meta_path) = cutout_file_pair(&dir, &stem);
        if let Some(record) = read_cutout_pair(&png, &meta_path)? {
            return Ok(Some(record));
        }
    }
    Ok(None)
}

/// Removes obsolete per-model cutout files so re-cutting never leaves 4K PNG orphans behind.
fn remove_per_model_cutouts(state: &AppState, id: &str) {
    let dir = cutout_dir(state);
    let stem = cutout_stem(id);
    for model in ["modnet", "animeseg", "birefnet"] {
        let (png, meta_path) = cutout_file_pair(&dir, &format!("{stem}_{model}"));
        let _ = std::fs::remove_file(png);
        let _ = std::fs::remove_file(meta_path);
    }
}

/// Writes the cutout PNG under app data so the next launch can skip inference.
#[tauri::command]
pub fn write_cutout(
    state: State<'_, AppState>,
    wallpaper_id: String,
    png_base64: String,
    model: String,
    source: String,
) -> Result<String, String> {
    let model = known_cutout_model(&model)?.to_string();
    let (png, meta_path) = cutout_file_pair(&cutout_dir(&state), &cutout_stem(&wallpaper_id));
    let dir = png.parent().ok_or("抠像目录无效")?;
    std::fs::create_dir_all(dir).map_err(|e| format!("创建抠像目录失败:{e}"))?;
    let encoded = png_base64.trim().rsplit(',').next().unwrap_or(png_base64.trim());
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|e| format!("抠像数据无效:{e}"))?;
    std::fs::write(&png, bytes).map_err(|e| format!("保存抠像失败:{e}"))?;
    let meta = serde_json::to_string(&CutoutMeta { model, source }).map_err(|e| e.to_string())?;
    std::fs::write(&meta_path, meta).map_err(|e| format!("保存抠像记录失败:{e}"))?;
    remove_per_model_cutouts(&state, &wallpaper_id);
    Ok(png.to_string_lossy().into_owned())
}

/// 请求头里的值由前端 encodeURIComponent 编码（保证 ASCII 安全），这里解码回 UTF-8。
fn decode_header_value(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut index = 0;
    while index < bytes.len() {
        if bytes[index] == b'%' && index + 2 < bytes.len() {
            let hex = |byte: u8| -> Option<u8> {
                match byte {
                    b'0'..=b'9' => Some(byte - b'0'),
                    b'a'..=b'f' => Some(byte - b'a' + 10),
                    b'A'..=b'F' => Some(byte - b'A' + 10),
                    _ => None,
                }
            };
            if let (Some(high), Some(low)) = (hex(bytes[index + 1]), hex(bytes[index + 2])) {
                out.push(high * 16 + low);
                index += 3;
                continue;
            }
        }
        out.push(bytes[index]);
        index += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn header_value(request: &tauri::ipc::Request<'_>, name: &str) -> Result<String, String> {
    request
        .headers()
        .get(name)
        .and_then(|value| value.to_str().ok())
        .map(decode_header_value)
        .ok_or_else(|| format!("缺少请求头 {name}"))
}

/// 与 write_cutout 相同，但走原生二进制 IPC（raw payload）：
/// PNG 字节直传不经过 base64（4K PNG 每张 5–20MB，base64 会让前端主线程阻塞数百毫秒）。
/// 元数据（id/model/source）放在请求头里。
#[tauri::command]
pub fn write_cutout_raw(state: State<'_, AppState>, request: tauri::ipc::Request<'_>) -> Result<String, String> {
    let wallpaper_id = header_value(&request, "wallpaper-id")?;
    let model = header_value(&request, "model")?;
    let source = header_value(&request, "source")?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("抠像数据格式无效".to_string());
    };
    if bytes.is_empty() {
        return Err("抠像数据是空的".to_string());
    }
    let model = known_cutout_model(&model)?.to_string();
    let (png, meta_path) = cutout_file_pair(&cutout_dir(&state), &cutout_stem(&wallpaper_id));
    let dir = png.parent().ok_or("抠像目录无效")?;
    std::fs::create_dir_all(dir).map_err(|e| format!("创建抠像目录失败:{e}"))?;
    std::fs::write(&png, bytes).map_err(|e| format!("保存抠像失败:{e}"))?;
    let meta = serde_json::to_string(&CutoutMeta { model, source }).map_err(|e| e.to_string())?;
    std::fs::write(&meta_path, meta).map_err(|e| format!("保存抠像记录失败:{e}"))?;
    remove_per_model_cutouts(&state, &wallpaper_id);
    Ok(png.to_string_lossy().into_owned())
}

fn model_path(state: &AppState, rel: &str) -> Result<PathBuf, String> {
    if rel.is_empty() || rel.len() > 512 {
        return Err("模型路径无效".to_string());
    }
    let mut path = state.data_dir.join("models");
    for part in rel.split(['/', '\\']) {
        if part.is_empty()
            || part == "."
            || part == ".."
            || !part.chars().all(|ch| ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.' | '@' | '+'))
        {
            return Err("模型路径无效".to_string());
        }
        path.push(part);
    }
    Ok(path)
}

fn model_partial(path: &Path) -> PathBuf {
    let mut name = path.file_name().unwrap_or_default().to_os_string();
    name.push(".partial");
    path.with_file_name(name)
}

/// Absolute path of a model file already stored under app data, if the download finished.
#[tauri::command]
pub fn model_file_path(state: State<'_, AppState>, rel: String) -> Result<Option<String>, String> {
    let path = model_path(&state, &rel)?;
    if path.is_file() {
        Ok(Some(path.to_string_lossy().into_owned()))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn model_write_begin(state: State<'_, AppState>, rel: String) -> Result<(), String> {
    let path = model_path(&state, &rel)?;
    let partial = model_partial(&path);
    if let Some(dir) = partial.parent() {
        std::fs::create_dir_all(dir).map_err(|e| format!("创建模型目录失败:{e}"))?;
    }
    std::fs::File::create(&partial).map_err(|e| format!("准备模型文件失败:{e}"))?;
    Ok(())
}

#[tauri::command]
pub fn model_write_chunk(state: State<'_, AppState>, rel: String, data_base64: String) -> Result<(), String> {
    let partial = model_partial(&model_path(&state, &rel)?);
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(data_base64.trim())
        .map_err(|e| format!("模型数据无效:{e}"))?;
    let mut file = std::fs::OpenOptions::new()
        .append(true)
        .open(&partial)
        .map_err(|e| format!("写入模型失败:{e}"))?;
    file.write_all(&bytes).map_err(|e| format!("写入模型失败:{e}"))?;
    Ok(())
}

/// 与 model_write_chunk 相同，但走原生二进制 IPC；rel 放请求头。
/// 模型文件最大 450MB，base64 路径会让前端主线程构建数百 MB 字符串。
#[tauri::command]
pub fn model_write_chunk_raw(state: State<'_, AppState>, request: tauri::ipc::Request<'_>) -> Result<(), String> {
    let rel = header_value(&request, "rel")?;
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("模型数据格式无效".to_string());
    };
    let partial = model_partial(&model_path(&state, &rel)?);
    let mut file = std::fs::OpenOptions::new()
        .append(true)
        .open(&partial)
        .map_err(|e| format!("打开模型文件失败:{e}"))?;
    file.write_all(bytes).map_err(|e| format!("写入模型失败:{e}"))?;
    Ok(())
}

#[tauri::command]
pub fn model_write_finish(state: State<'_, AppState>, rel: String) -> Result<(), String> {
    let path = model_path(&state, &rel)?;
    let partial = model_partial(&path);
    let len = std::fs::metadata(&partial).map_err(|e| format!("模型文件缺失:{e}"))?.len();
    if len == 0 {
        let _ = std::fs::remove_file(&partial);
        return Err("模型文件是空的".to_string());
    }
    if path.is_file() {
        std::fs::remove_file(&path).map_err(|e| format!("替换模型失败:{e}"))?;
    }
    std::fs::rename(&partial, &path).map_err(|e| format!("保存模型失败:{e}"))?;
    Ok(())
}

#[tauri::command]
pub fn model_write_abort(state: State<'_, AppState>, rel: String) -> Result<(), String> {
    let partial = model_partial(&model_path(&state, &rel)?);
    if partial.is_file() {
        std::fs::remove_file(&partial).map_err(|e| format!("清理模型失败:{e}"))?;
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExportTextPayload {
    pub file_name: String,
    pub content: String,
}

#[tauri::command]
pub async fn export_text_file(payload: ExportTextPayload) -> Result<Option<String>, String> {
    let picked = rfd::AsyncFileDialog::new()
        .set_title("导出 JSON")
        .set_file_name(&payload.file_name)
        .add_filter("JSON", &["json"])
        .save_file()
        .await;
    match picked {
        Some(handle) => {
            std::fs::write(handle.path(), payload.content.as_bytes()).map_err(|e| format!("写入文件失败:{e}"))?;
            Ok(Some(handle.path().to_string_lossy().into_owned()))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub fn save_api_key(key: String) -> Result<(), String> {
    credentials::save_key(Zeroizing::new(key))
}

#[tauri::command]
pub fn has_api_key() -> Result<bool, String> {
    credentials::get_key().map(|key| key.is_some())
}

#[tauri::command]
pub fn delete_api_key() -> Result<(), String> {
    credentials::delete_key()
}

#[tauri::command]
pub async fn test_connection() -> Result<runcomfy::BalanceInfo, GenError> {
    let key = credentials::get_key()
        .map_err(|e| GenError::new(GenErrorKind::Unknown, e))?
        .ok_or_else(|| GenError::new(GenErrorKind::NoApiKey, "还没存 Key，先去设置里填一个"))?;
    runcomfy::get_balance(&key).await
}

#[tauri::command]
pub async fn submit_generation(
    app: AppHandle,
    state: State<'_, AppState>,
    gen: State<'_, Arc<GenerationState>>,
    payload: GeneratePayload,
) -> Result<String, GenError> {
    let key = credentials::get_key()
        .map_err(|e| GenError::new(GenErrorKind::Unknown, e))?
        .ok_or_else(|| GenError::new(GenErrorKind::NoApiKey, "还没存 Key，先去设置里填一个"))?;
    let request_id = runcomfy::submit(
        &key,
        &payload.model,
        &payload.prompt,
        &payload.resolution,
        &payload.aspect_ratio,
    )
    .await?;

    // 記下待取回請求：本地失敗後可憑 request_id 找回已扣額度的結果
    if let Ok(db) = state.db.lock() {
        let _ = db.insert_pending(&crate::db::PendingRequest {
            request_id: request_id.clone(),
            model: payload.model.clone(),
            prompt: payload.prompt.clone(),
            style_name: payload.style_name.clone(),
            resolution: payload.resolution.clone(),
            aspect_ratio: payload.aspect_ratio.clone(),
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0),
        });
    }
    gen.active.lock().map(|mut set| set.insert(request_id.clone())).ok();

    let state = state.inner().clone();
    let gen = gen.inner().clone();
    let request_id_clone = request_id.clone();
    let key_clone = key.clone();
    tauri::async_runtime::spawn(async move {
        let outcome = run_generation(&app, &state, &gen, &request_id_clone, &key_clone, &payload).await;
        gen.active.lock().map(|mut set| set.remove(&request_id_clone)).ok();
        match outcome {
            Ok(Some(record)) => {
                if let Ok(db) = state.db.lock() {
                    let _ = db.delete_pending(&request_id_clone);
                }
                let _ = app.emit("burn-generation-done", DonePayload { request_id: request_id_clone, wallpaper: record });
            }
            Ok(None) => {
                if let Ok(db) = state.db.lock() {
                    let _ = db.delete_pending(&request_id_clone);
                }
                let _ = app.emit("burn-generation-cancelled", request_id_clone.clone());
            }
            Err(error) => {
                // 保留 pending 記錄，之後可從「記錄」頁取回
                let _ = app.emit(
                    "burn-generation-error",
                    ErrorPayload { request_id: request_id_clone, error },
                );
            }
        }
    });

    Ok(request_id)
}

#[tauri::command]
pub fn cancel_generation(gen: State<'_, Arc<GenerationState>>, request_id: String) {
    gen.cancelled.lock().map(|mut set| set.insert(request_id)).ok();
}

#[tauri::command]
pub fn list_generated_wallpapers(state: State<'_, AppState>) -> Result<Vec<WallpaperRecord>, String> {
    state.db.lock().map_err(|e| e.to_string())?.list_wallpapers()
}

#[tauri::command]
pub fn list_favorites(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    state.db.lock().map_err(|e| e.to_string())?.list_favorites()
}

#[tauri::command]
pub fn toggle_favorite(state: State<'_, AppState>, id: String) -> Result<bool, String> {
    state.db.lock().map_err(|e| e.to_string())?.toggle_favorite(&id)
}

#[tauri::command]
pub fn list_monitors() -> Result<Vec<crate::wallpaper::MonitorInfo>, String> {
    crate::wallpaper::list_monitors()
}

#[tauri::command]
pub async fn apply_wallpaper(state: State<'_, AppState>, payload: ApplyPayload) -> Result<(), String> {
    let file_path = if let Some(path) = payload.path {
        std::path::PathBuf::from(path)
    } else {
        let data = payload.data_base64.ok_or("缺少图片数据")?;
        let bytes = base64::engine::general_purpose::STANDARD
            .decode(data)
            .map_err(|e| format!("图片数据损坏:{e}"))?;
        let name: String = payload
            .file_name
            .unwrap_or_else(|| "wallpaper.png".to_string())
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_') { c } else { '_' })
            .collect();
        let dir = state.data_dir.join("wallpapers").join("applied");
        std::fs::create_dir_all(&dir).map_err(|e| format!("准备上墙目录失败:{e}"))?;
        let dest = dir.join(name);
        std::fs::write(&dest, &bytes).map_err(|e| format!("写入图片失败:{e}"))?;
        dest
    };
    if !file_path.exists() {
        return Err("找不到图片文件".to_string());
    }
    crate::wallpaper::set_wallpaper(&file_path.to_string_lossy(), payload.monitor_id.as_deref())
}

struct GenMeta {
    model: String,
    prompt: String,
    style_name: String,
    resolution: String,
    aspect_ratio: String,
}

/// Downloads the first image and persists a wallpaper record.
/// Images are filed under `folders/<风格名>/` named after the style preset.
async fn finalize(state: &AppState, urls: Vec<String>, meta: &GenMeta) -> Result<WallpaperRecord, GenError> {
    let first = urls.first().ok_or_else(|| GenError::new(GenErrorKind::GenerationFailed, "没有可下载的图片"))?;
    let id = format!("gen-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0));
    let root = wallpaper_dir(state).map_err(|e| GenError::new(GenErrorKind::Unknown, e))?;
    let folder_id = sanitize_folder_id(&meta.style_name);
    let (target_dir, folder_value) = if folder_id.is_empty() {
        (root.clone(), String::new())
    } else {
        let db = state.db.lock().map_err(|e| GenError::new(GenErrorKind::Unknown, e.to_string()))?;
        // 依預設名自動建文件夾（已存在則跳過），歷史/轮换的文件夾列表同步可見
        db.create_folder(&folder_id, &meta.style_name)
            .map_err(|e| GenError::new(GenErrorKind::Unknown, e))?;
        (root.join("folders").join(&folder_id), folder_id)
    };
    std::fs::create_dir_all(&target_dir).map_err(|e| GenError::new(GenErrorKind::Unknown, format!("准备存储目录失败:{e}")))?;
    let image_path = runcomfy::download(first, &target_dir, &id).await?;

    let db = state.db.lock().map_err(|e| GenError::new(GenErrorKind::Unknown, e.to_string()))?;
    let issue = db.next_issue().map_err(|e| GenError::new(GenErrorKind::Unknown, e))?;
    let record = WallpaperRecord {
        id,
        issue,
        title: meta.style_name.clone(),
        english: format!("BURN ISSUE {:02}", issue),
        prompt: meta.prompt.clone(),
        model: meta.model.clone(),
        aspect_ratio: meta.aspect_ratio.clone(),
        resolution: meta.resolution.clone(),
        image_path: image_path.to_string_lossy().into_owned(),
        folder: folder_value,
        created_at: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs() as i64)
            .unwrap_or(0),
    };
    db.insert_wallpaper(&record).map_err(|e| GenError::new(GenErrorKind::Unknown, e))?;
    Ok(record)
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingItem {
    #[serde(flatten)]
    pub pending: crate::db::PendingRequest,
    /// Still being polled by the worker; recovery would duplicate the result.
    pub active: bool,
}

#[tauri::command]
pub fn list_pending_requests(
    state: State<'_, AppState>,
    gen: State<'_, Arc<GenerationState>>,
) -> Result<Vec<PendingItem>, String> {
    let pendings = state.db.lock().map_err(|e| e.to_string())?.list_pendings()?;
    let active = gen.active.lock().map_err(|e| e.to_string())?.clone();
    Ok(pendings
        .into_iter()
        .map(|pending| {
            let is_active = active.contains(&pending.request_id);
            PendingItem { pending, active: is_active }
        })
        .collect())
}

#[tauri::command]
pub fn discard_pending_request(state: State<'_, AppState>, request_id: String) -> Result<(), String> {
    state.db.lock().map_err(|e| e.to_string())?.delete_pending(&request_id)
}

#[tauri::command]
pub async fn enhance_prompt(prompt: String) -> Result<String, GenError> {
    runcomfy::enhance_prompt(&prompt).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FolderInfo {
    pub id: String,
    pub name: String,
    pub count: i64,
}

fn sanitize_folder_id(name: &str) -> String {
    let mapped: String = name
        .trim()
        .chars()
        .map(|c| if c.is_alphanumeric() || matches!(c, '-' | '_') { c } else { '-' })
        .collect();
    mapped
        .split('-')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("-")
}

/// `std::fs::rename` 在跨盘（跨卷）时会失败（自定义存储目录可能在另一个盘），降级为复制后删除。
fn move_file(source: &Path, target: &Path) -> Result<(), String> {
    if let Err(error) = std::fs::rename(source, target) {
        std::fs::copy(source, target)
            .map_err(|copy_error| format!("移动图片失败:{error}（复制降级也失败:{copy_error}）"))?;
        std::fs::remove_file(source).map_err(|e| format!("移除源图片失败:{e}"))?;
    }
    Ok(())
}

#[tauri::command]
pub fn list_folders(state: State<'_, AppState>) -> Result<Vec<FolderInfo>, String> {
    let folders = state.db.lock().map_err(|e| e.to_string())?.list_folders()?;
    Ok(folders
        .into_iter()
        .map(|folder| FolderInfo { id: folder.id, name: folder.name, count: folder.count })
        .collect())
}

#[tauri::command]
pub fn create_folder(state: State<'_, AppState>, name: String) -> Result<FolderInfo, String> {
    let name = name.trim();
    let id = sanitize_folder_id(name);
    if id.is_empty() {
        return Err("文件夹名称需要字母或数字".to_string());
    }
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.create_folder(&id, name)?;
    drop(db);
    let dir = wallpaper_dir(&state)?.join("folders").join(&id);
    std::fs::create_dir_all(&dir).map_err(|e| format!("创建文件夹失败:{e}"))?;
    Ok(FolderInfo { id, name: name.to_string(), count: 0 })
}

/// Deletes a folder; images inside move back to the storage root.
#[tauri::command]
pub fn delete_folder(state: State<'_, AppState>, id: String) -> Result<(), String> {
    let root = wallpaper_dir(&state)?;
    let records = state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .list_wallpapers()?
        .into_iter()
        .filter(|record| record.folder == id)
        .collect::<Vec<_>>();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    for record in records {
        let source = std::path::Path::new(&record.image_path);
        let Some(file_name) = source.file_name() else { continue };
        let target = root.join(file_name);
        if target != source && source.exists() {
            let _ = move_file(source, &target);
        }
        db.set_wallpaper_folder(&record.id, "", &target.to_string_lossy())?;
    }
    db.delete_folder(&id)?;
    drop(db);
    let _ = std::fs::remove_dir_all(root.join("folders").join(&id));
    Ok(())
}

/// Moves a wallpaper into a managed folder (or back to the root when folder_id is None).
#[tauri::command]
pub fn set_wallpaper_folder(
    state: State<'_, AppState>,
    wallpaper_id: String,
    folder_id: Option<String>,
) -> Result<WallpaperRecord, String> {
    let record = state
        .db
        .lock()
        .map_err(|e| e.to_string())?
        .get_wallpaper(&wallpaper_id)?
        .ok_or_else(|| "找不到这张图片".to_string())?;
    let root = wallpaper_dir(&state)?;
    let target_dir = match folder_id.as_deref() {
        Some(folder) => root.join("folders").join(folder),
        None => root.clone(),
    };
    std::fs::create_dir_all(&target_dir).map_err(|e| format!("准备文件夹失败:{e}"))?;
    let source = std::path::Path::new(&record.image_path);
    let Some(file_name) = source.file_name() else {
        return Err("图片路径无效".to_string());
    };
    let target = target_dir.join(file_name);
    if target != source {
        if target.exists() {
            return Err("目标文件夹里已有同名文件".to_string());
        }
        move_file(source, &target)?;
    }
    let folder_value = folder_id.clone().unwrap_or_default();
    let db = state.db.lock().map_err(|e| e.to_string())?;
    db.set_wallpaper_folder(&wallpaper_id, &folder_value, &target.to_string_lossy())?;
    Ok(WallpaperRecord {
        image_path: target.to_string_lossy().into_owned(),
        folder: folder_value,
        ..record
    })
}

/// Deletes generated records (and image files stored inside app data or the custom storage dir).
#[tauri::command]
pub fn delete_wallpapers(state: State<'_, AppState>, ids: Vec<String>) -> Result<u32, String> {
    let db = state.db.lock().map_err(|e| e.to_string())?;
    let paths: Vec<String> = ids.iter().filter_map(|id| db.get_wallpaper_path(id)).collect();
    let removed = db.delete_wallpapers(&ids)?;
    drop(db);
    let safe_roots = [
        state.data_dir.clone(),
        wallpaper_dir(&state).unwrap_or_else(|_| state.data_dir.join("wallpapers")),
    ];
    for path in paths {
        let inside = safe_roots.iter().any(|root| std::path::Path::new(&path).starts_with(root.as_path()));
        if inside {
            let _ = std::fs::remove_file(&path);
        }
    }
    for id in ids {
        let dir = cutout_dir(&state);
        let (legacy_png, legacy_meta) = cutout_file_pair(&dir, &cutout_stem(&id));
        let _ = std::fs::remove_file(legacy_png);
        let _ = std::fs::remove_file(legacy_meta);
        for model in ["modnet", "animeseg", "birefnet"] {
            if let Ok((png, meta_path)) = cutout_paths(&state, &id, model) {
                let _ = std::fs::remove_file(png);
                let _ = std::fs::remove_file(meta_path);
            }
        }
    }
    Ok(removed)
}

/// Fetches the finished result for a stranded request and stores it as a wallpaper.
#[tauri::command]
pub async fn recover_generation(
    state: State<'_, AppState>,
    gen: State<'_, Arc<GenerationState>>,
    request_id: String,
) -> Result<WallpaperRecord, GenError> {
    if gen.active.lock().map(|set| set.contains(&request_id)).unwrap_or(false) {
        return Err(GenError::new(
            GenErrorKind::GenerationFailed,
            "这个请求还在生成中，完成后会自动入库，不用手动取回",
        ));
    }
    let pending = {
        let db = state.db.lock().map_err(|e| GenError::new(GenErrorKind::Unknown, e.to_string()))?;
        db.list_pendings()
            .map_err(|e| GenError::new(GenErrorKind::Unknown, e))?
            .into_iter()
            .find(|item| item.request_id == request_id)
    }
    .ok_or_else(|| GenError::new(GenErrorKind::Unknown, "找不到这个待取回请求"))?;

    let key = credentials::get_key()
        .map_err(|e| GenError::new(GenErrorKind::Unknown, e))?
        .ok_or_else(|| GenError::new(GenErrorKind::NoApiKey, "还没存 Key，先去设置里填一个"))?;

    let started = std::time::Instant::now();
    // 以原始提交時間計算任務實際年齡：取回時可能已經畫了大半
    let submitted_at = std::time::UNIX_EPOCH + std::time::Duration::from_secs(pending.created_at.max(0) as u64);
    let original_age = submitted_at.elapsed().unwrap_or_default();
    let urls = loop {
        match runcomfy::result_urls(&key, &request_id).await {
            Ok(Some(urls)) => break urls,
            Ok(None) => {}
            Err(error) => return Err(error),
        }
        if started.elapsed() > std::time::Duration::from_secs(300) {
            return Err(GenError::new(GenErrorKind::TimedOut, "取回超时：RunComfy 那边还没画完，等下再试"));
        }
        tokio::time::sleep(runcomfy::poll_delay(original_age + started.elapsed())).await;
    };

    let meta = GenMeta {
        model: pending.model,
        prompt: pending.prompt,
        style_name: pending.style_name,
        resolution: pending.resolution,
        aspect_ratio: pending.aspect_ratio,
    };
    let record = finalize(&state, urls, &meta).await?;
    if let Ok(db) = state.db.lock() {
        let _ = db.delete_pending(&request_id);
    }
    Ok(record)
}

async fn run_generation(
    app: &AppHandle,
    state: &AppState,
    gen: &Arc<GenerationState>,
    request_id: &str,
    api_key: &str,
    payload: &GeneratePayload,
) -> Result<Option<WallpaperRecord>, GenError> {
    let started = std::time::Instant::now();
    let mut poll_errors = 0u32;
    let urls = loop {
        if gen.cancelled.lock().map(|set| set.contains(request_id)).unwrap_or(false) {
            let _ = runcomfy::cancel(api_key, request_id).await;
            return Ok(None);
        }
        match runcomfy::result_urls(api_key, request_id).await {
            Ok(Some(urls)) => break urls,
            Ok(None) => {
                poll_errors = 0;
                let state = runcomfy::status(api_key, request_id).await.unwrap_or_else(|_| "in_progress".to_string());
                let _ = app.emit("burn-generation-progress", ProgressPayload { request_id: request_id.to_string(), state });
            }
            Err(error) => {
                // 網路抖動不該毀掉已扣額度的任務：連續重試 5 次再放棄
                poll_errors += 1;
                eprintln!("[generation] poll error {poll_errors}/5 for {request_id}: {}", error.message);
                let retryable = matches!(
                    error.kind,
                    GenErrorKind::NetworkFailed | GenErrorKind::TimedOut | GenErrorKind::RateLimited | GenErrorKind::Unknown
                );
                if !retryable || poll_errors >= 5 {
                    return Err(error);
                }
            }
        }
        if started.elapsed() > runcomfy::poll_timeout() {
            return Err(GenError::new(GenErrorKind::TimedOut, "等太久了，RunComfy 还没画完，稍后再看"));
        }
        tokio::time::sleep(runcomfy::poll_delay(started.elapsed())).await;
    };

    let meta = GenMeta {
        model: payload.model.clone(),
        prompt: payload.prompt.clone(),
        style_name: payload.style_name.clone(),
        resolution: payload.resolution.clone(),
        aspect_ratio: payload.aspect_ratio.clone(),
    };
    finalize(state, urls, &meta).await.map(Some)
}
