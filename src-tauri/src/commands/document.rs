use std::path::{Path, PathBuf};

use tauri::State;

use crate::{
    app_state::AppState,
    document::types::{DocumentSnapshot, HeadingNode},
    markdown::render_markdown,
    syntax_highlight::SyntaxUiTheme,
    viewer::types::{DirectoryListSort, DirectoryPage, FilePreview, StartupContext},
};

fn format_command_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MarkdownPreviewOutput {
    pub html: String,
    pub headings: Vec<HeadingNode>,
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListDirectoryInput {
    pub path: String,
    pub sort: Option<DirectoryListSort>,
    pub offset: Option<usize>,
    pub limit: Option<usize>,
}

#[tauri::command]
pub fn set_syntax_ui_theme(scheme: String, state: State<'_, AppState>) -> Result<(), String> {
    state.set_syntax_ui_theme(SyntaxUiTheme::parse(&scheme));
    Ok(())
}

#[tauri::command]
pub fn render_markdown_preview(
    source_text: String,
    state: State<'_, AppState>,
) -> Result<MarkdownPreviewOutput, String> {
    let theme = state.syntax_ui_theme();
    let rendered = render_markdown(&source_text, theme);
    Ok(MarkdownPreviewOutput {
        html: rendered.html,
        headings: rendered.headings,
    })
}

#[tauri::command]
pub fn get_startup_context(state: State<'_, AppState>) -> Result<StartupContext, String> {
    Ok(state.startup_context())
}

#[tauri::command]
pub fn list_directory(
    path: Option<String>,
    sort: Option<DirectoryListSort>,
    offset: Option<usize>,
    limit: Option<usize>,
    input: Option<ListDirectoryInput>,
    state: State<'_, AppState>,
) -> Result<DirectoryPage, String> {
    let resolved_path = input
        .as_ref()
        .map(|value| value.path.clone())
        .or(path)
        .ok_or_else(|| "missing required key path".to_string())?;
    let resolved_sort = input
        .as_ref()
        .and_then(|value| value.sort)
        .or(sort)
        .unwrap_or_default();
    let resolved_offset = input
        .as_ref()
        .and_then(|value| value.offset)
        .or(offset)
        .unwrap_or(0);
    let resolved_limit = input
        .as_ref()
        .and_then(|value| value.limit)
        .or(limit)
        .unwrap_or(0);

    state
        .viewer_service()
        .list_directory(
            Path::new(&resolved_path),
            resolved_sort,
            resolved_offset,
            resolved_limit,
        )
        .map_err(format_command_error)
}

#[tauri::command]
pub fn open_file_preview(path: String, state: State<'_, AppState>) -> Result<FilePreview, String> {
    let theme = state.syntax_ui_theme();
    state
        .viewer_service()
        .open_file_preview(Path::new(&path), theme)
        .map_err(format_command_error)
}

#[tauri::command]
pub fn stop_document_watch(state: State<'_, AppState>) -> Result<(), String> {
    state.watcher_service().stop().map_err(format_command_error)
}

#[tauri::command]
pub fn open_document(path: String, state: State<'_, AppState>) -> Result<DocumentSnapshot, String> {
    let theme = state.syntax_ui_theme();
    let document_service = state.document_service();
    let snapshot = document_service
        .open(Path::new(&path), theme)
        .map_err(format_command_error)?;

    state
        .watcher_service()
        .watch_active_document(
            PathBuf::from(&snapshot.path),
            state.app_handle(),
            document_service,
            state.syntax_ui_theme_handle(),
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
    let theme = state.syntax_ui_theme();
    let snapshot = state
        .document_service()
        .save(Path::new(&path), &source_text, theme)
        .map_err(format_command_error)?;

    Ok(snapshot)
}

#[tauri::command]
pub fn reload_document(
    path: String,
    state: State<'_, AppState>,
) -> Result<DocumentSnapshot, String> {
    let theme = state.syntax_ui_theme();
    state
        .document_service()
        .reload(Path::new(&path), theme)
        .map_err(format_command_error)
}
