use std::{
    path::{Path, PathBuf},
    time::Instant,
};

use tauri::State;

use crate::{
    app_state::AppState,
    document::types::{DocumentSnapshot, HeadingNode},
    git_diff::{GitDiffService, GitDiffTarget},
    github_pr_diff::{GitHubPrDiffService, GitHubPrTarget, PrDiffFileText, PrDiffSnapshot},
    markdown::render_markdown,
    syntax_highlight::SyntaxUiTheme,
    verbose_log,
    viewer::types::{
        DirectoryListSort, DirectoryPage, ExplicitFileSetPage, FilePreview, StartupContext,
    },
};

fn format_command_error(error: impl std::fmt::Display) -> String {
    error.to_string()
}

fn handle_open_file_preview_join_error(
    path: &Path,
    command_started_at: Option<Instant>,
    startup_started_at: Option<Instant>,
    error: impl std::fmt::Display,
) -> String {
    let error = format_command_error(error);
    if let Some(started_at) = command_started_at {
        verbose_log::record_phase_message(
            "open_file_preview_command",
            started_at,
            "failure",
            &error,
        );
    }
    verbose_log::complete_startup_load(path, startup_started_at, "failure");
    error
}

fn register_media_stream_url(
    path: &str,
    mime_type: &str,
    state: &AppState,
) -> Result<String, String> {
    state
        .media_stream_service()
        .register_media_stream(Path::new(path), mime_type)
        .map_err(format_command_error)
}

fn attach_media_stream_url(preview: FilePreview, state: &AppState) -> Result<FilePreview, String> {
    match preview {
        FilePreview::Audio {
            path,
            file_name,
            mime_type,
            html,
            last_modified,
            ..
        } => {
            let stream_url = register_media_stream_url(&path, &mime_type, state)?;

            Ok(FilePreview::Audio {
                path,
                file_name,
                mime_type,
                stream_url: Some(stream_url),
                html,
                last_modified,
            })
        }
        FilePreview::Video {
            path,
            file_name,
            mime_type,
            html,
            last_modified,
            ..
        } => {
            let stream_url = register_media_stream_url(&path, &mime_type, state)?;

            Ok(FilePreview::Video {
                path,
                file_name,
                mime_type,
                stream_url: Some(stream_url),
                html,
                last_modified,
            })
        }
        _ => Ok(preview),
    }
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
    pub query: Option<String>,
    pub hide_git_ignored: bool,
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
    verbose_log::mark_frontend_ready();
    Ok(state.startup_context())
}

#[tauri::command]
pub async fn load_pr_diff(target: GitHubPrTarget) -> Result<PrDiffSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        GitHubPrDiffService::new()
            .and_then(|service| service.load(&target))
            .map_err(format_command_error)
    })
    .await
    .map_err(format_command_error)?
}

#[tauri::command]
pub async fn load_git_diff(target: GitDiffTarget) -> Result<PrDiffSnapshot, String> {
    tauri::async_runtime::spawn_blocking(move || {
        GitDiffService::new()
            .load(&target)
            .map_err(format_command_error)
    })
    .await
    .map_err(format_command_error)?
}

#[tauri::command]
pub async fn load_git_diff_file_text(
    target: GitDiffTarget,
    path: String,
) -> Result<PrDiffFileText, String> {
    tauri::async_runtime::spawn_blocking(move || {
        GitDiffService::new()
            .load_file_text(&target, &path)
            .map_err(format_command_error)
    })
    .await
    .map_err(format_command_error)?
}

#[tauri::command]
pub async fn detect_git_repository(path: String) -> Result<Option<GitDiffTarget>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        GitDiffService::new()
            .detect_repository(Path::new(&path))
            .map_err(format_command_error)
    })
    .await
    .map_err(format_command_error)?
}

#[tauri::command]
pub async fn load_pr_diff_file_text(raw_url: String) -> Result<PrDiffFileText, String> {
    tauri::async_runtime::spawn_blocking(move || {
        GitHubPrDiffService::new()
            .and_then(|service| service.load_file_text(&raw_url))
            .map_err(format_command_error)
    })
    .await
    .map_err(format_command_error)?
}

#[tauri::command]
pub fn list_directory(
    input: ListDirectoryInput,
    state: State<'_, AppState>,
) -> Result<DirectoryPage, String> {
    state
        .viewer_service()
        .list_directory(
            Path::new(&input.path),
            input.sort.unwrap_or_default(),
            input.query.as_deref(),
            input.hide_git_ignored,
            input.offset.unwrap_or(0),
            input.limit.unwrap_or(0),
        )
        .map_err(format_command_error)
}

#[tauri::command]
pub fn list_explicit_file_set(
    paths: Vec<String>,
    sort: Option<DirectoryListSort>,
    query: Option<String>,
    offset: Option<usize>,
    limit: Option<usize>,
    state: State<'_, AppState>,
) -> Result<ExplicitFileSetPage, String> {
    let resolved_sort = sort.unwrap_or_default();
    let resolved_offset = offset.unwrap_or(0);
    let resolved_limit = limit.unwrap_or(0);

    state
        .viewer_service()
        .list_explicit_file_set(
            &paths,
            resolved_sort,
            query.as_deref(),
            resolved_offset,
            resolved_limit,
        )
        .map_err(format_command_error)
}

#[tauri::command]
pub async fn open_file_preview(
    path: String,
    state: State<'_, AppState>,
) -> Result<FilePreview, String> {
    let command_started_at = verbose_log::is_enabled().then(Instant::now);
    let startup_started_at = verbose_log::startup_load_started(Path::new(&path));
    let theme = state.syntax_ui_theme();
    let viewer_service = state.viewer_service();
    let task_path = path.clone();

    let preview_result = match tauri::async_runtime::spawn_blocking(move || {
        viewer_service.open_file_preview(Path::new(&task_path), theme)
    })
    .await
    {
        Ok(preview_result) => preview_result,
        Err(error) => {
            return Err(handle_open_file_preview_join_error(
                Path::new(&path),
                command_started_at,
                startup_started_at,
                error,
            ));
        }
    };

    let preview = match preview_result {
        Ok(preview) => preview,
        Err(error) => {
            if let Some(started_at) = command_started_at {
                verbose_log::record_app_error(
                    "open_file_preview_command",
                    Some(Path::new(&path)),
                    started_at,
                    &error,
                );
            }
            verbose_log::complete_startup_load(Path::new(&path), startup_started_at, "failure");
            return Err(format_command_error(error));
        }
    };

    match attach_media_stream_url(preview, &state) {
        Ok(preview) => {
            if let Some(started_at) = command_started_at {
                verbose_log::record_phase("open_file_preview_command", started_at, "success");
            }
            verbose_log::complete_startup_load(Path::new(&path), startup_started_at, "success");
            Ok(preview)
        }
        Err(error) => {
            if let Some(started_at) = command_started_at {
                verbose_log::record_phase_message(
                    "open_file_preview_command",
                    started_at,
                    "failure",
                    &error,
                );
            }
            verbose_log::complete_startup_load(Path::new(&path), startup_started_at, "failure");
            Err(error)
        }
    }
}

#[tauri::command]
pub fn stop_document_watch(state: State<'_, AppState>) -> Result<(), String> {
    state.watcher_service().stop().map_err(format_command_error)
}

#[tauri::command]
pub fn open_document(path: String, state: State<'_, AppState>) -> Result<DocumentSnapshot, String> {
    let command_started_at = verbose_log::is_enabled().then(Instant::now);
    let startup_started_at = verbose_log::startup_load_started(Path::new(&path));
    let theme = state.syntax_ui_theme();
    let document_service = state.document_service();
    let result = document_service
        .open(Path::new(&path), theme)
        .and_then(|snapshot| {
            state.watcher_service().watch_active_document(
                PathBuf::from(&snapshot.path),
                state.app_handle(),
                document_service,
                state.syntax_ui_theme_handle(),
            )?;
            Ok(snapshot)
        });

    match result {
        Ok(snapshot) => {
            if let Some(started_at) = command_started_at {
                verbose_log::record_phase("open_document_command", started_at, "success");
            }
            verbose_log::complete_startup_load(Path::new(&path), startup_started_at, "success");
            Ok(snapshot)
        }
        Err(error) => {
            if let Some(started_at) = command_started_at {
                verbose_log::record_app_error(
                    "open_document_command",
                    Some(Path::new(&path)),
                    started_at,
                    &error,
                );
            }
            verbose_log::complete_startup_load(Path::new(&path), startup_started_at, "failure");
            Err(format_command_error(error))
        }
    }
}

#[tauri::command]
pub fn save_document(
    path: String,
    source_text: String,
    expected_revision_token: String,
    state: State<'_, AppState>,
) -> Result<DocumentSnapshot, String> {
    let theme = state.syntax_ui_theme();
    let snapshot = state
        .document_service()
        .save(
            Path::new(&path),
            &source_text,
            &expected_revision_token,
            theme,
        )
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

#[cfg(test)]
mod tests {
    use std::{
        io,
        path::Path,
        time::{Duration, Instant},
    };

    use super::handle_open_file_preview_join_error;
    use crate::verbose_log;

    #[test]
    fn open_file_preview_join_failure_is_recorded_and_preserves_error_text() {
        let command_started_at = Instant::now()
            .checked_sub(Duration::from_millis(2))
            .expect("test instant");
        let path = Path::new("./join-failure.md");

        let (error, lines) = verbose_log::with_test_sink(|| {
            handle_open_file_preview_join_error(
                path,
                Some(command_started_at),
                None,
                io::Error::other("preview worker failed"),
            )
        });

        assert_eq!(error, "preview worker failed");
        assert_eq!(lines.len(), 1);
        assert!(lines[0].contains("event=\"open_file_preview_command\" outcome=\"failure\""));
        assert!(lines[0].contains("error=\"preview worker failed\""));
    }
}
