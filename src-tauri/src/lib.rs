pub mod app_state;
pub mod cli;
pub mod commands;
pub mod document;
pub mod error;
pub mod events;
pub mod markdown;
pub mod media_stream;
pub mod mp4_faststart;
pub mod syntax_highlight;
pub mod viewer;
pub mod watcher;

use tauri::Manager;

use app_state::AppState;
use cli::StartupTarget;
use document::service::DocumentService;
use media_stream::MediaStreamService;
use viewer::service::ViewerService;
use watcher::service::WatcherService;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(startup_target: StartupTarget) -> Result<(), String> {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let document_service = DocumentService::new();
            let viewer_service = ViewerService::new();
            let watcher_service = WatcherService::new();
            let media_stream_service = MediaStreamService::new()?;
            let startup_context = viewer_service.startup_context(&startup_target)?;

            app.manage(AppState::new(
                startup_context,
                app_handle,
                document_service,
                viewer_service,
                watcher_service,
                media_stream_service,
            ));

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::document::stop_document_watch,
            commands::document::get_startup_context,
            commands::document::list_directory,
            commands::document::open_file_preview,
            commands::document::open_document,
            commands::document::save_document,
            commands::document::reload_document,
            commands::document::set_syntax_ui_theme,
            commands::document::render_markdown_preview,
        ])
        .run(tauri::generate_context!())
        .map_err(|error| error.to_string())
}
