use std::path::{Path, PathBuf};

use tauri::State;

use crate::{
    app_state::AppState,
    document::types::DocumentSnapshot,
    viewer::types::{DirectorySnapshot, FilePreview, StartupContext},
};

fn format_command_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[tauri::command]
pub fn get_startup_context(state: State<'_, AppState>) -> Result<StartupContext, String> {
    Ok(state.startup_context())
}

#[tauri::command]
pub fn list_directory(
    path: String,
    selected_path: Option<String>,
    state: State<'_, AppState>,
) -> Result<DirectorySnapshot, String> {
    state
        .viewer_service()
        .list_directory(
            Path::new(&path),
            selected_path.as_deref().map(Path::new),
        )
        .map_err(format_command_error)
}

#[tauri::command]
pub fn open_file_preview(path: String, state: State<'_, AppState>) -> Result<FilePreview, String> {
    state
        .viewer_service()
        .open_file_preview(Path::new(&path))
        .map_err(format_command_error)
}

#[tauri::command]
pub fn open_document(path: String, state: State<'_, AppState>) -> Result<DocumentSnapshot, String> {
    let document_service = state.document_service();
    let snapshot = document_service
        .open(Path::new(&path))
        .map_err(format_command_error)?;

    state
        .watcher_service()
        .watch_active_document(
            PathBuf::from(&snapshot.path),
            state.app_handle(),
            document_service,
        )
        .map_err(format_command_error)?;

    Ok(snapshot)
}

#[tauri::command]
pub fn save_document(
    path: String,
    source_text: String,
    state: State<'_, AppState>,
) -> Result<DocumentSnapshot, String> {
    let snapshot = state
        .document_service()
        .save(Path::new(&path), &source_text)
        .map_err(format_command_error)?;

    Ok(snapshot)
}

#[tauri::command]
pub fn reload_document(
    path: String,
    state: State<'_, AppState>,
) -> Result<DocumentSnapshot, String> {
    state
        .document_service()
        .reload(Path::new(&path))
        .map_err(format_command_error)
}
