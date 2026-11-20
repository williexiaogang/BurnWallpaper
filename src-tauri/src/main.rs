#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod animation;
mod commands;
mod credentials;
mod db;
mod proxy;
mod rotation;
mod runcomfy;
mod wallpaper;
mod window_size;

use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::menu::{CheckMenuItem, CheckMenuItemBuilder, MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, TrayIconBuilder, TrayIconEvent};
use tauri::{Emitter, Manager, WindowEvent};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};

#[derive(Clone)]
pub struct AppState {
    pub db: Arc<Mutex<db::Database>>,
    pub data_dir: PathBuf,
}

#[derive(Clone)]
pub struct TrayState {
    pub rotation_item: CheckMenuItem<tauri::Wry>,
    pub boot_gen_item: CheckMenuItem<tauri::Wry>,
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
            let rotation_enabled = database
                .get_setting("rotation_enabled")?
                .map(|value| value == "1")
                .unwrap_or(true);
            if let Ok(Some(custom)) = database.get_setting("wallpaper_dir") {
                if !custom.trim().is_empty() {
                    let _ = app.asset_protocol_scope().allow_directory(std::path::Path::new(&custom), true);
                }
            }
            let state = AppState { db: Arc::new(Mutex::new(database)), data_dir };
            let boot_gen_enabled = state
                .db
                .lock()
                .map(|db| db.get_setting("boot_auto_generate").ok().flatten().map(|value| value == "1").unwrap_or(false))
                .unwrap_or(false);
            rotation::ensure_bundled_wallpapers(&state)?;
            app.manage(state.clone());
            app.manage(Arc::new(commands::GenerationState {
                cancelled: Mutex::new(std::collections::HashSet::new()),
                active: Mutex::new(std::collections::HashSet::new()),
                finalizing: Mutex::new(std::collections::HashSet::new()),
            }));

            rotation::spawn_rotation_worker(app.handle().clone(), state.clone());

            let main_window = app.get_webview_window("main").expect("main window missing");
            window_size::enforce_main_window(&main_window)?;
            let close_window = main_window.clone();
            let close_state = state.clone();
            main_window.on_window_event(move |event| {
                if let WindowEvent::CloseRequested { api, .. } = event {
                    let resident = close_state.db.lock().ok()
                        .and_then(|db| db.get_setting("background_resident").ok().flatten())
                        .map(|value| value == "1")
                        .unwrap_or(true);
                    if resident {
                        api.prevent_close();
                        let _ = close_window.hide();
                    } else {
                        close_window.app_handle().exit(0);
                    }
                }
            });

            let shortcut: Shortcut = "Control+Alt+B".parse().expect("invalid hotkey");
            app.global_shortcut().register(shortcut)?;

            let show_item = MenuItemBuilder::with_id("show", "显示主窗口").build(app)?;
            let generate_item = MenuItemBuilder::with_id("generate", "来一张").build(app)?;
            let rotate_item = MenuItemBuilder::with_id("rotate_now", "换一张").build(app)?;
            let rotation_item = CheckMenuItemBuilder::with_id("toggle_rotation", "定时轮换")
                .checked(rotation_enabled)
                .build(app)?;
            let boot_gen_item = CheckMenuItemBuilder::with_id("toggle_boot_gen", "开机自动来一张")
                .checked(boot_gen_enabled)
                .build(app)?;
            let quit_item = MenuItemBuilder::with_id("quit", "退出").build(app)?;
            let sep_1 = tauri::menu::PredefinedMenuItem::separator(app)?;
            let sep_2 = tauri::menu::PredefinedMenuItem::separator(app)?;
            app.manage(TrayState { rotation_item: rotation_item.clone(), boot_gen_item: boot_gen_item.clone() });
            let menu = MenuBuilder::new(app)
                .items(&[&show_item, &generate_item, &rotate_item, &sep_1, &rotation_item, &boot_gen_item, &sep_2, &quit_item])
                .build()?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().expect("app icon missing").clone())
                .tooltip("燃 BURN")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => rotation::show_main_window(app),
                    "generate" => {
                        let _ = app.emit("burn-tray-generate", ());
                    }
                    "rotate_now" => {
                        let state = app.state::<AppState>().inner().clone();
                        let handle = app.clone();
                        tauri::async_runtime::spawn(async move {
                            if let Err(error) = rotation::rotate_once(&handle, &state) {
                                eprintln!("[tray] rotate now failed: {error}");
                            }
                        });
                    }
                    "toggle_rotation" => {
                        let new_enabled = app.state::<TrayState>().rotation_item.is_checked().unwrap_or(true);
                        if let Ok(db) = app.state::<AppState>().db.lock() {
                            let _ = db.set_setting("rotation_enabled", if new_enabled { "1" } else { "0" });
                        }
                        let _ = app.emit("burn-rotation-toggled", new_enabled);
                    }
                    "toggle_boot_gen" => {
                        let new_enabled = app.state::<TrayState>().boot_gen_item.is_checked().unwrap_or(false);
                        if let Ok(db) = app.state::<AppState>().db.lock() {
                            let _ = db.set_setting("boot_auto_generate", if new_enabled { "1" } else { "0" });
                        }
                        let _ = app.emit("burn-boot-auto-toggled", new_enabled);
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
            commands::is_silent_boot,
            commands::get_animation_effects,
            commands::list_cutout_preferences,
            commands::set_cutout_preference,
            commands::read_cutout,
            commands::write_cutout,
            commands::write_cutout_raw,
            commands::model_file_path,
            commands::model_read,
            commands::debug_log,
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
        .build(tauri::generate_context!())
        .expect("error while building BURN")
        .run(|app, event| {
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Reopen { .. } = event {
                rotation::show_main_window(app);
            }
        });
}
