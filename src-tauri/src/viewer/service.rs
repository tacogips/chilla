use std::{
    fs,
    io::{Read, Seek, SeekFrom},
    path::Path,
    time::Instant,
};

use crate::{
    cli::StartupTarget,
    document::service::DocumentService,
    error::{AppError, AppResult},
    syntax_highlight::{self, SyntaxUiTheme},
    verbose_log::{self, VerboseIoOutcome},
    viewer::csv::{parse_csv_preview, CsvPreviewLimits},
    viewer::directory_listing,
    viewer::epub::render_epub,
    viewer::html::{escape_html_attribute, escape_html_text, format_file_size},
    viewer::path_utils::{
        canonicalize_directory_path, canonicalize_file_path, canonicalize_path, display_path,
        file_name, last_modified_string, observed_metadata, parent_directory_path,
    },
    viewer::preview_detection::{
        fallback_media_mime_type, is_csv_path, is_markdown_path, is_text_preview_extension,
        is_textual_mime, should_preview_as_csv,
    },
    viewer::types::{
        BrowserRoot, CsvRowCountStatus, DirectoryListSort, DirectoryPage, ExplicitFileSetPage,
        FilePreview, StartupContext, WorkspaceMode,
    },
};

#[derive(Clone, Default)]
pub struct ViewerService;

impl ViewerService {
    pub fn new() -> Self {
        Self
    }

    pub fn startup_context(&self, target: &StartupTarget) -> AppResult<StartupContext> {
        match target {
            StartupTarget::CurrentDirectory(path) | StartupTarget::Directory(path) => {
                let directory_path = canonicalize_directory_path(path)?;
                Ok(StartupContext {
                    initial_mode: WorkspaceMode::FileView,
                    browser_root: BrowserRoot::Directory {
                        current_directory_path: display_path(&directory_path),
                        selected_file_path: None,
                    },
                })
            }
            StartupTarget::File(path) => {
                let file_path = canonicalize_file_path(path)?;
                let current_directory_path = parent_directory_path(&file_path)?;

                Ok(StartupContext {
                    initial_mode: WorkspaceMode::FileView,
                    browser_root: BrowserRoot::Directory {
                        current_directory_path: display_path(&current_directory_path),
                        selected_file_path: Some(display_path(&file_path)),
                    },
                })
            }
            StartupTarget::FileSet(paths) => {
                let source_order_paths: Vec<String> =
                    paths.iter().map(|p| display_path(p.as_path())).collect();
                let Some(selected_file_path) = source_order_paths.first().cloned() else {
                    return Err(AppError::State(
                        "multi-file startup must include at least one path".into(),
                    ));
                };

                Ok(StartupContext {
                    initial_mode: WorkspaceMode::FileView,
                    browser_root: BrowserRoot::ExplicitFileSet {
                        file_count: source_order_paths.len(),
                        selected_file_path,
                        source_order_paths,
                    },
                })
            }
            StartupTarget::GitHubPr(target) => Ok(StartupContext {
                initial_mode: WorkspaceMode::PrDiff,
                browser_root: BrowserRoot::GitHubPr {
                    target: target.clone(),
                },
            }),
            StartupTarget::GitDiff(target) => Ok(StartupContext {
                initial_mode: WorkspaceMode::PrDiff,
                browser_root: BrowserRoot::GitDiff {
                    target: target.clone(),
                },
            }),
        }
    }

    pub fn list_directory(
        &self,
        path: &Path,
        sort: DirectoryListSort,
        query: Option<&str>,
        hide_git_ignored: bool,
        offset: usize,
        limit: usize,
    ) -> AppResult<DirectoryPage> {
        directory_listing::list_directory(path, sort, query, hide_git_ignored, offset, limit)
    }

    pub fn list_explicit_file_set(
        &self,
        paths: &[String],
        sort: DirectoryListSort,
        query: Option<&str>,
        offset: usize,
        limit: usize,
    ) -> AppResult<ExplicitFileSetPage> {
        directory_listing::list_explicit_file_set(paths, sort, query, offset, limit)
    }

    pub fn open_file_preview(
        &self,
        path: &Path,
        ui_theme: SyntaxUiTheme,
    ) -> AppResult<FilePreview> {
        let file_path = canonicalize_file_path(path)?;

        if is_markdown_path(&file_path) {
            return self.open_markdown_preview(&file_path, ui_theme);
        }

        let detected_mime_type = detect_mime_type(&file_path);
        let mime_type = fallback_media_mime_type(&file_path, detected_mime_type)
            .unwrap_or(detected_mime_type)
            .to_string();

        if mime_type.starts_with("image/") {
            return self.open_image_preview(&file_path, mime_type);
        }

        if mime_type.starts_with("video/") {
            return self.open_video_preview(&file_path, mime_type);
        }

        if mime_type.starts_with("audio/") {
            return self.open_audio_preview(&file_path, mime_type);
        }

        if mime_type == "application/pdf" {
            return self.open_pdf_preview(&file_path, mime_type);
        }

        if mime_type == "application/epub+zip" {
            return self.open_epub_preview(&file_path, mime_type);
        }

        if should_preview_as_csv(&file_path, &mime_type) {
            return self.open_csv_preview(&file_path, mime_type, ui_theme);
        }

        if is_textual_mime(&mime_type) {
            return self.open_text_preview(&file_path, mime_type, ui_theme);
        }

        if is_text_preview_extension(&file_path)
            || syntax_highlight::should_treat_path_as_text(&file_path)
        {
            return self.open_text_preview(&file_path, mime_type, ui_theme);
        }

        self.open_binary_preview(&file_path, mime_type)
    }

    fn open_markdown_preview(
        &self,
        path: &Path,
        ui_theme: SyntaxUiTheme,
    ) -> AppResult<FilePreview> {
        let snapshot = DocumentService::new().open(path, ui_theme)?;

        Ok(FilePreview::Markdown {
            mime_type: "text/markdown".to_string(),
            snapshot,
        })
    }

    fn open_image_preview(&self, path: &Path, mime_type: String) -> AppResult<FilePreview> {
        let display_path = display_path(path);
        let file_name = file_name(path);
        let last_modified = last_modified_string(path)?;
        let escaped_display_path = escape_html_attribute(&display_path);

        Ok(FilePreview::Image {
            path: display_path,
            file_name: file_name.clone(),
            mime_type,
            html: format!(
                "<figure class=\"preview-media preview-media--image\"><img src=\"{}\" alt=\"{}\" /></figure>",
                escaped_display_path,
                escape_html_attribute(&file_name),
            ),
            last_modified,
        })
    }

    fn open_video_preview(&self, path: &Path, mime_type: String) -> AppResult<FilePreview> {
        let file_name = file_name(path);

        Ok(FilePreview::Video {
            path: display_path(path),
            file_name: file_name.clone(),
            mime_type,
            stream_url: None,
            // Playback uses the frontend `<video src={convertFileSrc(path)}>`; HTML unused.
            html: String::new(),
            last_modified: last_modified_string(path)?,
        })
    }

    fn open_audio_preview(&self, path: &Path, mime_type: String) -> AppResult<FilePreview> {
        let file_name = file_name(path);

        Ok(FilePreview::Audio {
            path: display_path(path),
            file_name: file_name.clone(),
            mime_type,
            stream_url: None,
            // Playback uses the frontend `<audio src={convertFileSrc(path)}>`; HTML unused.
            html: String::new(),
            last_modified: last_modified_string(path)?,
        })
    }

    fn open_pdf_preview(&self, path: &Path, mime_type: String) -> AppResult<FilePreview> {
        let file_name = file_name(path);

        Ok(FilePreview::Pdf {
            path: display_path(path),
            file_name: file_name.clone(),
            mime_type,
            // Inline viewer uses the frontend iframe + convertFileSrc(path); HTML unused.
            html: String::new(),
            last_modified: last_modified_string(path)?,
        })
    }

    fn open_epub_preview(&self, path: &Path, mime_type: String) -> AppResult<FilePreview> {
        let rendered = render_epub(path)?;

        Ok(FilePreview::Epub {
            path: display_path(path),
            file_name: file_name(path),
            mime_type,
            html: rendered.html,
            toc: rendered.toc,
            last_modified: last_modified_string(path)?,
        })
    }

    fn open_text_preview(
        &self,
        path: &Path,
        mime_type: String,
        ui_theme: SyntaxUiTheme,
    ) -> AppResult<FilePreview> {
        let file_bytes =
            observed_read(path).map_err(|source| AppError::io("read", path, source))?;
        let source_text = String::from_utf8_lossy(&file_bytes);
        let encoding_notice = lossy_utf8_notice(&file_bytes);
        let file_type = syntax_highlight::describe_file_syntax(path);
        let highlighted_html =
            syntax_highlight::highlight_file_source(&source_text, path, ui_theme);
        let html = format!(
            "<section class=\"file-preview file-preview--text\"><p class=\"file-preview__meta\">File type: {} | File size: {}{}</p>{}</section>",
            escape_html_text(&file_type),
            escape_html_text(&format_file_size(file_bytes.len() as u64)),
            encoding_notice,
            highlighted_html,
        );

        Ok(FilePreview::Text {
            path: display_path(path),
            file_name: file_name(path),
            mime_type,
            file_type,
            html,
            size_bytes: file_bytes.len() as u64,
            last_modified: last_modified_string(path)?,
        })
    }

    fn open_csv_preview(
        &self,
        path: &Path,
        mime_type: String,
        ui_theme: SyntaxUiTheme,
    ) -> AppResult<FilePreview> {
        let file_bytes =
            observed_read(path).map_err(|source| AppError::io("read", path, source))?;
        let source_text = String::from_utf8_lossy(&file_bytes);
        let encoding_notice = lossy_utf8_notice(&file_bytes);
        let source_owned = source_text.into_owned();
        let source_for_view = source_owned
            .strip_prefix('\u{feff}')
            .unwrap_or(source_owned.as_str());

        let normalized_mime = if is_csv_path(path) {
            "text/csv".to_string()
        } else {
            mime_type
        };

        let file_type = syntax_highlight::describe_file_syntax(path);
        let highlighted_html =
            syntax_highlight::highlight_file_source(source_for_view, path, ui_theme);
        let raw_html = format!(
            "<section class=\"file-preview file-preview--text\"><p class=\"file-preview__meta\">File type: {} | File size: {}{}</p>{}</section>",
            escape_html_text(&file_type),
            escape_html_text(&format_file_size(file_bytes.len() as u64)),
            encoding_notice,
            highlighted_html,
        );

        let parsed = parse_csv_preview(source_for_view, CsvPreviewLimits::default());
        let formatted_available = parsed.parse_error.is_none();
        let parse_error = parsed.parse_error.clone();
        let row_count_status = if parse_error.is_some() {
            CsvRowCountStatus::ParseError
        } else if parsed.truncated {
            CsvRowCountStatus::Truncated
        } else {
            CsvRowCountStatus::Complete
        };

        Ok(FilePreview::Csv {
            path: display_path(path),
            file_name: file_name(path),
            mime_type: normalized_mime,
            raw_html,
            rows: parsed.rows,
            column_count: parsed.column_count,
            displayed_row_count: parsed.displayed_row_count,
            total_row_count: parsed.total_row_count,
            row_count_status,
            truncated: parsed.truncated,
            formatted_available,
            parse_error,
            size_bytes: file_bytes.len() as u64,
            last_modified: last_modified_string(path)?,
        })
    }

    fn open_binary_preview(&self, path: &Path, mime_type: String) -> AppResult<FilePreview> {
        let message = "Binary file preview is not available.".to_string();

        Ok(FilePreview::Binary {
            path: display_path(path),
            file_name: file_name(path),
            mime_type: mime_type.clone(),
            html: format!(
                "<section class=\"file-preview file-preview--binary\"><p>{}</p><p class=\"file-preview__meta\">Detected type: {}</p></section>",
                escape_html_text(&message),
                escape_html_text(&mime_type),
            ),
            last_modified: last_modified_string(path)?,
            size_bytes: observed_metadata(path)
                .map_err(|source| AppError::io("read metadata for", path, source))?
                .len(),
            message,
        })
    }
}

fn lossy_utf8_notice(bytes: &[u8]) -> &'static str {
    if std::str::from_utf8(bytes).is_ok() {
        ""
    } else {
        " | Encoding: UTF-8 with replacement characters"
    }
}

pub fn resolve_startup_target(path: &Path) -> AppResult<StartupTarget> {
    let canonical_path = canonicalize_path(path)?;
    let metadata = observed_metadata(&canonical_path)
        .map_err(|source| AppError::io("read metadata for", &canonical_path, source))?;

    if metadata.is_dir() {
        Ok(StartupTarget::Directory(canonical_path))
    } else if metadata.is_file() {
        Ok(StartupTarget::File(canonical_path))
    } else {
        Err(AppError::UnsupportedPathKind(display_path(&canonical_path)))
    }
}

fn observed_read(path: &Path) -> std::io::Result<Vec<u8>> {
    if !verbose_log::is_enabled() {
        return fs::read(path);
    }

    let started_at = Instant::now();
    let result = fs::read(path);
    match &result {
        Ok(bytes) => verbose_log::record_io(
            "read",
            path,
            started_at,
            VerboseIoOutcome::Success {
                size_bytes: Some(bytes.len() as u64),
            },
        ),
        Err(error) => verbose_log::record_io(
            "read",
            path,
            started_at,
            VerboseIoOutcome::Failure { error },
        ),
    }
    result
}

fn detect_mime_type(path: &Path) -> &'static str {
    if !verbose_log::is_enabled() {
        return tree_magic_mini::from_filepath(path).unwrap_or("application/octet-stream");
    }

    observed_mime_type(path)
        .ok()
        .flatten()
        .unwrap_or("application/octet-stream")
}

fn observed_mime_type(path: &Path) -> std::io::Result<Option<&'static str>> {
    const MIME_PREFIX_LIMIT_BYTES: usize = 2 * 1024;

    let started_at = Instant::now();
    let result = (|| {
        let mut file = fs::File::open(path)?;
        let mut bytes = Vec::with_capacity(MIME_PREFIX_LIMIT_BYTES);
        (&mut file)
            .take(MIME_PREFIX_LIMIT_BYTES as u64)
            .read_to_end(&mut bytes)?;
        file.seek(SeekFrom::Start(0))?;
        Ok((tree_magic_mini::from_file(&file), bytes.len() as u64))
    })();

    match &result {
        Ok((_, size_bytes)) => verbose_log::record_io(
            "detect_mime",
            path,
            started_at,
            VerboseIoOutcome::Success {
                size_bytes: Some(*size_bytes),
            },
        ),
        Err(error) => verbose_log::record_io(
            "detect_mime",
            path,
            started_at,
            VerboseIoOutcome::Failure { error },
        ),
    }
    result.map(|(mime_type, _)| mime_type)
}

#[cfg(test)]
mod image_revision_tests;

#[cfg(test)]
mod test_epub;

#[cfg(test)]
mod tests;
