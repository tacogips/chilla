pub mod app_state;
pub mod cli;
pub mod commands;
pub mod document;
pub mod error;
pub mod events;
pub mod markdown;
pub mod watcher;

use std::path::PathBuf;

use tauri::Manager;

use app_state::AppState;
use document::service::DocumentService;
use watcher::service::WatcherService;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(startup_path: PathBuf) -> Result<(), String> {
    tauri::Builder::default()
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let document_service = DocumentService::new();
            let watcher_service = WatcherService::new();

            watcher_service.watch_active_document(
                startup_path.clone(),
                app_handle.clone(),
                document_service.clone(),
            )?;

            app.manage(AppState::new(
                startup_path.clone(),
                app_handle,
                document_service,
                watcher_service,
            ));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::document::get_startup_document_path,
            commands::document::open_document,
            commands::document::save_document,
            commands::document::reload_document,
        ])
        .run(tauri::generate_context!())
        .map_err(|error| error.to_string())
}
