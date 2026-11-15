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
async fn finalize(state: &AppState, urls: Vec<String>, meta: &GenMeta) -> Result<WallpaperRecord, GenError> {
    let first = urls.first().ok_or_else(|| GenError::new(GenErrorKind::GenerationFailed, "没有可下载的图片"))?;
    let id = format!("gen-{}", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0));
    let dir = wallpaper_dir(state).map_err(|e| GenError::new(GenErrorKind::Unknown, e))?;
    std::fs::create_dir_all(&dir).map_err(|e| GenError::new(GenErrorKind::Unknown, format!("准备存储目录失败:{e}")))?;
    let image_path = runcomfy::download(first, &dir, &id).await?;

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
pub async fn pick_rotation_folder(app: AppHandle, state: State<'_, AppState>) -> Result<Option<String>, String> {
    let picked = rfd::AsyncFileDialog::new()
        .set_title("选择轮换图片文件夹")
        .pick_folder()
        .await;
    match picked {
        Some(handle) => {
            let path = handle.path().to_string_lossy().into_owned();
            state.db.lock().map_err(|e| e.to_string())?.set_setting("rotation_folder", &path)?;
            let _ = app.asset_protocol_scope().allow_directory(handle.path(), true);
            Ok(Some(path))
        }
        None => Ok(None),
    }
}

#[tauri::command]
pub fn clear_rotation_folder(state: State<'_, AppState>) -> Result<(), String> {
    state.db.lock().map_err(|e| e.to_string())?.set_setting("rotation_folder", "")
}

#[tauri::command]
pub async fn enhance_prompt(prompt: String) -> Result<String, GenError> {
    runcomfy::enhance_prompt(&prompt).await
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
