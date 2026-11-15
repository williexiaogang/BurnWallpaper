#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod credentials;
mod db;
mod runcomfy;
mod wallpaper;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::Manager;

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<db::Database>>,
    pub data_dir: PathBuf,
}

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("failed to resolve app data dir");
            std::fs::create_dir_all(data_dir.join("wallpapers").join("applied"))?;
            let database = db::Database::open(&data_dir.join("burn.db"))?;
            if let Ok(Some(custom)) = database.get_setting("wallpaper_dir") {
                if !custom.trim().is_empty() {
                    let _ = app.asset_protocol_scope().allow_directory(std::path::Path::new(&custom), true);
                }
            }
            app.manage(AppState { db: Arc::new(Mutex::new(database)), data_dir });
            app.manage(Arc::new(commands::GenerationState { cancelled: Mutex::new(std::collections::HashSet::new()) }));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::save_api_key,
            commands::has_api_key,
            commands::delete_api_key,
            commands::test_connection,
            commands::submit_generation,
            commands::cancel_generation,
            commands::list_generated_wallpapers,
            commands::list_favorites,
            commands::toggle_favorite,
            commands::list_monitors,
            commands::apply_wallpaper,
            commands::get_storage_dir,
            commands::pick_storage_dir,
            commands::reset_storage_dir,
            commands::export_text_file,
            commands::get_app_setting,
            commands::set_app_setting,
        ])
        .run(tauri::generate_context!())
        .expect("error while running BURN");
}
