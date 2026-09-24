pub mod app_state;
pub mod cli;
pub mod commands;
pub mod document;
pub mod error;
pub mod events;
pub mod git_diff;
pub mod github_pr_diff;
pub mod keymap_config;
pub mod markdown;
pub mod media_stream;
pub mod mp4_faststart;
mod startup_window;
pub mod syntax_highlight;
pub mod verbose_log;
pub mod viewer;
pub mod watcher;

use std::time::Instant;

use tauri::Manager;

use app_state::AppState;
use cli::StartupRequest;
use document::service::DocumentService;
use media_stream::MediaStreamService;
use viewer::service::ViewerService;
use watcher::service::WatcherService;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run(startup_request: StartupRequest) -> Result<(), String> {
    verbose_log::record_event("application_run_entry", "success");
    let context = tauri::generate_context!();
    #[cfg(target_os = "macos")]
    let context = {
        let mut context = context;
        if let Some(main_window) = context
            .config_mut()
            .app
            .windows
            .iter_mut()
            .find(|window| window.label == "main")
        {
            // A titled native window exposes the fullscreen Accessibility button
            // that tiling managers use to distinguish normal windows from dialogs.
            // Keep its titlebar above the custom toolbar to avoid overlapping controls.
            main_window.decorations = true;
        }
        context
    };
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
            let startup_context = match viewer_service.startup_context_with_options(
                &startup_request.target,
                startup_request.file_open_options,
            ) {
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
                // Native geometry setters can be asynchronous. Keep the event loop
                // free while startup waits for the requested bounds to be applied.
                tauri::async_runtime::spawn_blocking(move || {
                    match startup_window::clamp_main_window_to_work_area(&main_window) {
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
                    if let Err(error) = main_window.show() {
                        verbose_log::record_phase_message(
                            "main_window_show",
                            Instant::now(),
                            "failure",
                            &error.to_string(),
                        );
                    }
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::document::stop_document_watch,
            commands::document::get_startup_context,
            commands::keymap::get_keymap_config,
            commands::document::detect_git_repository,
            commands::document::load_git_diff,
            commands::document::load_git_diff_file_text,
            commands::document::load_pr_diff,
            commands::document::load_pr_diff_file_text,
            commands::document::list_directory,
            commands::search::search_directory,
            commands::document::list_explicit_file_set,
            commands::document::open_file_preview,
            commands::document::open_document,
            commands::document::save_document,
            commands::document::reload_document,
            commands::document::set_syntax_ui_theme,
            commands::document::render_markdown_preview,
        ])
        .run(context)
        .map_err(|error| error.to_string())
}
