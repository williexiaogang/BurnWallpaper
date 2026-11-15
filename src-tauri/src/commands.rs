use base64::Engine;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};
use zeroize::Zeroizing;

use crate::credentials;
use crate::db::WallpaperRecord;
use crate::runcomfy::{self, GenError, GenErrorKind};
use crate::AppState;

pub struct GenerationState {
    pub cancelled: Mutex<HashSet<String>>,
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

    let state = state.inner().clone();
    let gen = gen.inner().clone();
    let request_id_clone = request_id.clone();
    let key_clone = key.clone();
    tauri::async_runtime::spawn(async move {
        let outcome = run_generation(&app, &state, &gen, &request_id_clone, &key_clone, &payload).await;
        match outcome {
            Ok(Some(record)) => {
                let _ = app.emit("burn-generation-done", DonePayload { request_id: request_id_clone, wallpaper: record });
            }
            Ok(None) => {
                let _ = app.emit("burn-generation-cancelled", request_id_clone.clone());
            }
            Err(error) => {
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

async fn run_generation(
    app: &AppHandle,
    state: &AppState,
    gen: &Arc<GenerationState>,
    request_id: &str,
    api_key: &str,
    payload: &GeneratePayload,
) -> Result<Option<WallpaperRecord>, GenError> {
    let started = std::time::Instant::now();
    let urls = loop {
        if gen.cancelled.lock().map(|set| set.contains(request_id)).unwrap_or(false) {
            let _ = runcomfy::cancel(api_key, request_id).await;
            return Ok(None);
        }
        match runcomfy::result_urls(api_key, request_id).await {
            Ok(Some(urls)) => break urls,
            Ok(None) => {
                let state = runcomfy::status(api_key, request_id).await.unwrap_or_else(|_| "in_progress".to_string());
                let _ = app.emit("burn-generation-progress", ProgressPayload { request_id: request_id.to_string(), state });
            }
            Err(error) => return Err(error),
        }
        if started.elapsed() > runcomfy::poll_timeout() {
            return Err(GenError::new(GenErrorKind::TimedOut, "等太久了，RunComfy 还没画完，稍后再看"));
        }
        tokio::time::sleep(runcomfy::poll_interval()).await;
    };

    let first = urls.first().ok_or_else(|| GenError::new(GenErrorKind::GenerationFailed, "没有可下载的图片"))?;
    let id = format!("gen-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0));
    let dir = wallpaper_dir(state).map_err(|e| GenError::new(GenErrorKind::Unknown, e))?;
    std::fs::create_dir_all(&dir).map_err(|e| GenError::new(GenErrorKind::Unknown, format!("准备存储目录失败:{e}")))?;
    let image_path = runcomfy::download(first, &dir, &id).await?;

    let record = {
        let db = state.db.lock().map_err(|e| GenError::new(GenErrorKind::Unknown, e.to_string()))?;
        let issue = db.next_issue().map_err(|e| GenError::new(GenErrorKind::Unknown, e))?;
        let record = WallpaperRecord {
            id,
            issue,
            title: payload.style_name.clone(),
            english: format!("BURN ISSUE {:02}", issue),
            prompt: payload.prompt.clone(),
            model: payload.model.clone(),
            aspect_ratio: payload.aspect_ratio.clone(),
            resolution: payload.resolution.clone(),
            image_path: image_path.to_string_lossy().into_owned(),
            created_at: std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_secs() as i64)
                .unwrap_or(0),
        };
        db.insert_wallpaper(&record).map_err(|e| GenError::new(GenErrorKind::Unknown, e))?;
        record
    };

    Ok(Some(record))
}
