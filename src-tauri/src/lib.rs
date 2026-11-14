pub mod app_state;
pub mod cli;
pub mod commands;
pub mod document;
pub mod error;
pub mod events;
pub mod git_diff;
pub mod github_pr_diff;
pub mod markdown;
pub mod media_stream;
pub mod mp4_faststart;
pub mod syntax_highlight;
pub mod verbose_log;
pub mod viewer;
pub mod watcher;

use std::time::Instant;

use tauri::{Manager, WebviewWindow};

use app_state::AppState;
use cli::StartupTarget;
use document::service::DocumentService;
use media_stream::MediaStreamService;
use viewer::service::ViewerService;
use watcher::service::WatcherService;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(startup_target: StartupTarget) -> Result<(), String> {
    verbose_log::record_event("application_run_entry", "success");
    let builder_started_at = verbose_log::is_enabled().then(Instant::now);
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());
    if let Some(started_at) = builder_started_at {
        verbose_log::record_phase("tauri_builder_setup", started_at, "success");
    }

    let setup_started_at = verbose_log::is_enabled().then(Instant::now);
    builder
        .setup(move |app| {
            let app_handle = app.handle().clone();
            let document_service = DocumentService::new();
            let viewer_service = ViewerService::new();
            let watcher_service = WatcherService::new();
            let media_stream_service = match MediaStreamService::new() {
                Ok(service) => service,
                Err(error) => {
                    if let Some(started_at) = setup_started_at {
                        verbose_log::record_phase_message(
                            "tauri_setup",
                            started_at,
                            "failure",
                            &error.to_string(),
                        );
                    }
                    return Err(error.into());
                }
            };
            let startup_context = match viewer_service.startup_context(&startup_target) {
                Ok(context) => context,
                Err(error) => {
                    if let Some(started_at) = setup_started_at {
                        verbose_log::record_app_error("tauri_setup", None, started_at, &error);
                    }
                    return Err(error.into());
                }
            };

            app.manage(AppState::new(
                startup_context,
                app_handle,
                document_service,
                viewer_service,
                watcher_service,
                media_stream_service,
            ));

            if let Some(started_at) = setup_started_at {
                verbose_log::record_phase("tauri_setup", started_at, "success");
            }
            let main_window = app.get_webview_window("main");
            let window_outcome = if main_window.is_some() {
                "success"
            } else {
                "unavailable"
            };
            if let Some(started_at) = setup_started_at {
                verbose_log::record_phase("main_window_webview", started_at, window_outcome);
            }

            if let Some(main_window) = main_window {
                match clamp_main_window_to_work_area(&main_window) {
                    Ok(clamped) => {
                        if let Some(started_at) = setup_started_at {
                            let outcome = if clamped { "clamped" } else { "unchanged" };
                            verbose_log::record_phase("main_window_clamp", started_at, outcome);
                        }
                    }
                    Err(error) => {
                        if let Some(started_at) = setup_started_at {
                            verbose_log::record_phase_message(
                                "main_window_clamp",
                                started_at,
                                "failure",
                                &error.to_string(),
                            );
                        }
                    }
                }
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::document::stop_document_watch,
            commands::document::get_startup_context,
            commands::document::detect_git_repository,
            commands::document::load_git_diff,
            commands::document::load_pr_diff,
            commands::document::load_pr_diff_file_text,
            commands::document::list_directory,
            commands::document::list_explicit_file_set,
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

fn clamp_main_window_to_work_area(window: &WebviewWindow) -> tauri::Result<bool> {
    let monitor = match window.current_monitor()? {
        Some(monitor) => Some(monitor),
        None => window.primary_monitor()?,
    };
    let Some(monitor) = monitor else {
        return Ok(false);
    };

    let work_area = monitor.work_area();
    let current_size = window.outer_size()?;
    let clamped_width = current_size.width.min(work_area.size.width);
    let clamped_height = current_size.height.min(work_area.size.height);
    if clamped_width == current_size.width && clamped_height == current_size.height {
        return Ok(false);
    }

    window.set_size(tauri::PhysicalSize::new(clamped_width, clamped_height))?;
    window.center()?;
    Ok(true)
}
