#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod credentials;
mod db;
mod rotation;
mod runcomfy;
mod wallpaper;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::menu::{CheckMenuItem, CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<db::Database>>,
    pub data_dir: PathBuf,
}

#[derive(Clone)]
pub struct TrayState {
    pub rotation_item: CheckMenuItem<tauri::Wry>,
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--silent"]),
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state == ShortcutState::Pressed {
                        rotation::toggle_main_window(app);
                    }
                })
                .build(),
        )
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
            let state = AppState { db: Arc::new(Mutex::new(database)), data_dir };
            rotation::ensure_bundled_wallpapers(&state)?;
            app.manage(state.clone());
            app.manage(Arc::new(commands::GenerationState {
                cancelled: Mutex::new(std::collections::HashSet::new()),
                active: Mutex::new(std::collections::HashSet::new()),
            }));

            rotation::spawn_rotation_worker(app.handle().clone(), state);

            let shortcut: Shortcut = "Control+Alt+B".parse().expect("invalid hotkey");
            app.global_shortcut().register(shortcut)?;

            let show_item = MenuItemBuilder::with_id("show", "显示主窗口").build(app)?;
            let rotation_item = CheckMenuItemBuilder::with_id("toggle_rotation", "定时轮换")
                .checked(true)
                .build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            app.manage(TrayState { rotation_item: rotation_item.clone() });
            let menu = MenuBuilder::new(app)
                .items(&[&show_item, &rotation_item, &quit_item])
                .build()?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().expect("app icon missing").clone())
                .tooltip("燃 BURN")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => rotation::show_main_window(app),
                    "toggle_rotation" => {
                        let new_enabled = app.state::<TrayState>().rotation_item.is_checked().unwrap_or(true);
                        if let Ok(db) = app.state::<AppState>().db.lock() {
                            let _ = db.set_setting("rotation_enabled", if new_enabled { "1" } else { "0" });
                        }
                        let _ = app.emit("burn-rotation-toggled", new_enabled);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, .. } = event {
                        rotation::show_main_window(tray.app_handle());
                    }
                })
                .build(app)?;
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
            commands::read_cutout,
            commands::write_cutout,
            commands::write_cutout_raw,
            commands::model_file_path,
            commands::model_write_begin,
            commands::model_write_chunk,
            commands::model_write_chunk_raw,
            commands::model_write_finish,
            commands::model_write_abort,
            commands::list_pending_requests,
            commands::discard_pending_request,
            commands::recover_generation,
            commands::delete_wallpapers,
            commands::enhance_prompt,
            commands::list_folders,
            commands::create_folder,
            commands::delete_folder,
            commands::set_wallpaper_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running BURN");
}
