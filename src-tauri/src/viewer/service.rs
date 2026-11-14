use std::{fs, path::Path};

use crate::{
    cli::StartupTarget,
    document::service::DocumentService,
    error::{AppError, AppResult},
    syntax_highlight::{self, SyntaxUiTheme},
    viewer::csv::{parse_csv_preview, CsvPreviewLimits},
    viewer::directory_listing,
    viewer::epub::render_epub,
    viewer::html::{escape_html_attribute, escape_html_text, format_file_size},
    viewer::path_utils::{
        canonicalize_directory_path, canonicalize_file_path, canonicalize_path, display_path,
        file_name, last_modified_string, parent_directory_path,
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
        offset: usize,
        limit: usize,
    ) -> AppResult<DirectoryPage> {
        directory_listing::list_directory(path, sort, query, offset, limit)
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

        let detected_mime_type =
            tree_magic_mini::from_filepath(&file_path).unwrap_or("application/octet-stream");
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
        Ok(FilePreview::Image {
            path: display_path(path),
            file_name: file_name(path),
            mime_type,
            html: format!(
                "<figure class=\"preview-media preview-media--image\"><img src=\"{}\" alt=\"{}\" /></figure>",
                escape_html_attribute(&display_path(path)),
                escape_html_attribute(&file_name(path)),
            ),
            last_modified: last_modified_string(path)?,
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
        let file_bytes = fs::read(path).map_err(|source| AppError::io("read", path, source))?;
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
        let file_bytes = fs::read(path).map_err(|source| AppError::io("read", path, source))?;
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
            size_bytes: fs::metadata(path)
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
    let metadata = fs::metadata(&canonical_path)
        .map_err(|source| AppError::io("read metadata for", &canonical_path, source))?;

    if metadata.is_dir() {
        Ok(StartupTarget::Directory(canonical_path))
    } else if metadata.is_file() {
        Ok(StartupTarget::File(canonical_path))
    } else {
        Err(AppError::UnsupportedPathKind(display_path(&canonical_path)))
    }
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::{Path, PathBuf},
        sync::atomic::{AtomicU64, Ordering},
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{fallback_media_mime_type, ViewerService};
    use crate::{
        cli::StartupTarget,
        syntax_highlight::SyntaxUiTheme,
        viewer::types::{
            BrowserRoot, CsvRowCountStatus, DirectoryListSort, DirectorySortDirection,
            DirectorySortField, FilePreview, WorkspaceMode,
        },
    };

    static TEST_DIR_COUNTER: AtomicU64 = AtomicU64::new(0);

    struct TestDir {
        path: PathBuf,
    }

    impl TestDir {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            let counter = TEST_DIR_COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!("chilla-viewer-tests-{unique}-{counter}"));
            fs::create_dir_all(&path).expect("create temp test directory");
            Self { path }
        }

        fn path(&self) -> &Path {
            &self.path
        }
    }

    fn default_directory_sort() -> DirectoryListSort {
        DirectoryListSort {
            field: DirectorySortField::Name,
            direction: DirectorySortDirection::Asc,
        }
    }

    #[test]
    fn fallback_media_mime_type_infers_heic_and_heif_extensions() {
        let cases = [
            ("photo.heic", "image/heic"),
            ("photo.HEIF", "image/heif"),
            ("burst.heics", "image/heic-sequence"),
            ("burst.HEIFS", "image/heif-sequence"),
        ];

        for (file_name, expected_mime_type) in cases {
            assert_eq!(
                fallback_media_mime_type(Path::new(file_name), "application/octet-stream"),
                Some(expected_mime_type),
                "expected MIME fallback for {file_name}"
            );
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    fn repository_fixture_path(relative_path: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR")).join(relative_path)
    }

    #[test]
    fn startup_context_is_file_view_for_opening_markdown_file() {
        let test_dir = TestDir::new();
        let markdown_path = test_dir.path().join("guide.md");
        fs::write(&markdown_path, "# Hello").expect("write markdown");

        let context = ViewerService::new()
            .startup_context(&StartupTarget::File(
                markdown_path.canonicalize().expect("canonical path"),
            ))
            .expect("startup context");

        assert_eq!(context.initial_mode, WorkspaceMode::FileView);
        match &context.browser_root {
            BrowserRoot::Directory {
                selected_file_path, ..
            } => {
                assert_eq!(
                    *selected_file_path,
                    Some(
                        markdown_path
                            .canonicalize()
                            .expect("canonical path")
                            .display()
                            .to_string()
                    )
                );
            }
            BrowserRoot::ExplicitFileSet { .. }
            | BrowserRoot::GitHubPr { .. }
            | BrowserRoot::GitDiff { .. } => panic!("expected directory startup root"),
        }
    }

    #[test]
    fn startup_context_explicit_file_set_preserves_ordered_paths() {
        let test_dir = TestDir::new();
        let first = test_dir.path().join("a.txt");
        let second = test_dir.path().join("b.txt");
        fs::write(&first, "one").expect("write file");
        fs::write(&second, "two").expect("write file");
        let first_canon = first.canonicalize().expect("canonical path");
        let second_canon = second.canonicalize().expect("canonical path");

        let context = ViewerService::new()
            .startup_context(&StartupTarget::FileSet(vec![
                first_canon.clone(),
                second_canon.clone(),
            ]))
            .expect("startup context");

        match &context.browser_root {
            BrowserRoot::ExplicitFileSet {
                file_count,
                selected_file_path,
                source_order_paths,
            } => {
                assert_eq!(*file_count, 2);
                assert_eq!(selected_file_path, &first_canon.display().to_string());
                let expected = vec![
                    first_canon.display().to_string(),
                    second_canon.display().to_string(),
                ];
                assert_eq!(source_order_paths.as_slice(), expected.as_slice());
            }
            BrowserRoot::Directory { .. }
            | BrowserRoot::GitHubPr { .. }
            | BrowserRoot::GitDiff { .. } => panic!("expected explicit file-set root"),
        }
    }

    #[test]
    fn list_explicit_file_set_filters_across_hints_and_basenames() {
        let test_dir = TestDir::new();
        let reports = test_dir.path().join("reports");
        fs::create_dir_all(&reports).expect("reports directory");

        let left = reports.join("notes.txt");
        let right = test_dir.path().join("readme.txt");

        fs::write(&left, "left").expect("write left");
        fs::write(&right, "right").expect("write right");

        let source_order = vec![
            left.canonicalize()
                .expect("canonical")
                .display()
                .to_string(),
            right
                .canonicalize()
                .expect("canonical")
                .display()
                .to_string(),
        ];

        let page = ViewerService::new()
            .list_explicit_file_set(
                &source_order,
                default_directory_sort(),
                Some("reports"),
                0,
                200,
            )
            .expect("explicit page");

        assert_eq!(page.entries.len(), 1);
        assert_eq!(page.entries[0].name, "notes.txt");
        assert!(page.entries[0].directory_hint.contains("reports"));

        assert_eq!(page.total_entry_count, 1);
        assert!(!page.has_more);
    }

    #[test]
    fn list_directory_name_sort_orders_entries_without_directory_priority() {
        let test_dir = TestDir::new();
        fs::create_dir_all(test_dir.path().join("beta")).expect("create beta directory");
        fs::create_dir_all(test_dir.path().join("zulu")).expect("create zulu directory");
        fs::write(test_dir.path().join("Alpha.txt"), "alpha").expect("write alpha");
        fs::write(test_dir.path().join("bravo.txt"), "bravo").expect("write bravo");

        let snapshot = ViewerService::new()
            .list_directory(test_dir.path(), default_directory_sort(), None, 0, 200)
            .expect("directory snapshot");

        let names = snapshot
            .entries
            .iter()
            .map(|entry| entry.name.clone())
            .collect::<Vec<_>>();
        assert_eq!(names, vec!["Alpha.txt", "beta", "bravo.txt", "zulu"]);

        let bravo_logical = test_dir.path().join("bravo.txt");
        assert_eq!(snapshot.total_entry_count, 4);
        assert!(!snapshot.has_more);

        let bravo_entry = snapshot
            .entries
            .iter()
            .find(|entry| entry.name == "bravo.txt")
            .expect("bravo entry");
        let bravo_metadata =
            fs::metadata(bravo_logical).expect("metadata for bravo logical file path");
        assert_eq!(bravo_entry.size_bytes, bravo_metadata.len());
        assert!(bravo_entry.modified_at_unix_ms > 0);
        assert_eq!(
            bravo_entry.canonical_path, bravo_entry.path,
            "non-symlink file rows keep identical logical and canonical paths",
        );
    }

    #[test]
    fn list_directory_paginates_large_directories_in_requested_batches() {
        let test_dir = TestDir::new();
        for index in 0..205 {
            fs::write(test_dir.path().join(format!("file-{index:03}.txt")), "x")
                .expect("write paged test file");
        }

        let first_page = ViewerService::new()
            .list_directory(test_dir.path(), default_directory_sort(), None, 0, 200)
            .expect("first page");
        let second_page = ViewerService::new()
            .list_directory(test_dir.path(), default_directory_sort(), None, 200, 200)
            .expect("second page");

        assert_eq!(first_page.entries.len(), 200);
        assert_eq!(first_page.total_entry_count, 205);
        assert!(first_page.has_more);
        assert_eq!(first_page.offset, 0);
        assert_eq!(first_page.limit, 200);

        assert_eq!(second_page.entries.len(), 5);
        assert_eq!(second_page.total_entry_count, 205);
        assert!(!second_page.has_more);
        assert_eq!(second_page.offset, 200);
    }

    #[cfg(unix)]
    #[test]
    fn list_directory_symlink_entry_path_is_the_link_not_the_target() {
        use std::os::unix::fs::symlink;

        let test_dir = TestDir::new();
        let target = test_dir.path().join("target.txt");
        let link = test_dir.path().join("via_link.txt");
        fs::write(&target, "x").expect("write target");
        symlink(&target, &link).expect("symlink");

        let snapshot = ViewerService::new()
            .list_directory(test_dir.path(), default_directory_sort(), None, 0, 200)
            .expect("directory snapshot");

        assert_ne!(
            target.canonicalize().expect("canonical target"),
            link,
            "sanity: link path differs from target path",
        );

        let target_entry = snapshot
            .entries
            .iter()
            .find(|e| e.name == "target.txt")
            .expect("target row");
        let target_canonical = target.canonicalize().expect("canonical");
        assert_eq!(
            Path::new(&target_entry.path)
                .file_name()
                .and_then(|value| value.to_str()),
            Some("target.txt")
        );
        assert_eq!(
            target_entry.canonical_path,
            target_canonical.display().to_string(),
            "canonical path is returned for each row so the client can match symlink targets",
        );

        let link_entry = snapshot
            .entries
            .iter()
            .find(|e| e.name == "via_link.txt")
            .expect("symlink row");
        assert_eq!(
            Path::new(&link_entry.path)
                .file_name()
                .and_then(|value| value.to_str()),
            Some("via_link.txt")
        );
        assert_eq!(
            link_entry.canonical_path,
            target_canonical.display().to_string()
        );
    }

    #[cfg(unix)]
    #[test]
    fn list_directory_skips_dangling_symlinks_without_failing_the_directory() {
        use std::os::unix::fs::symlink;

        let test_dir = TestDir::new();
        let valid_file = test_dir.path().join("visible.txt");
        let dangling_link = test_dir.path().join(".manpath");
        fs::write(&valid_file, "visible").expect("write visible file");
        symlink(test_dir.path().join("missing-target"), &dangling_link).expect("dangling symlink");

        let snapshot = ViewerService::new()
            .list_directory(test_dir.path(), default_directory_sort(), None, 0, 200)
            .expect("directory snapshot");

        assert_eq!(snapshot.total_entry_count, 1);
        assert_eq!(snapshot.entries.len(), 1);
        assert_eq!(snapshot.entries[0].name, "visible.txt");
    }

    #[test]
    fn list_directory_filters_before_pagination() {
        let test_dir = TestDir::new();
        for index in 0..205 {
            fs::write(test_dir.path().join(format!("file-{index:03}.txt")), "x")
                .expect("write paged test file");
        }
        fs::write(test_dir.path().join("needle-target.txt"), "needle")
            .expect("write filter target");

        let page = ViewerService::new()
            .list_directory(
                test_dir.path(),
                default_directory_sort(),
                Some("needle-target"),
                0,
                200,
            )
            .expect("filtered page");

        assert_eq!(page.total_entry_count, 1);
        assert_eq!(page.entries.len(), 1);
        assert_eq!(page.entries[0].name, "needle-target.txt");
        assert!(!page.has_more);
    }

    #[test]
    fn open_file_preview_distinguishes_markdown_text_media_and_binary_files() {
        let test_dir = TestDir::new();
        let markdown_path = test_dir.path().join("guide.md");
        let text_path = test_dir.path().join("notes.txt");
        let image_path = test_dir.path().join("photo.png");
        let heic_path = test_dir.path().join("photo.HEIC");
        let video_path = test_dir.path().join("clip.mp4");
        let audio_path = test_dir.path().join("podcast.mp3");
        let pdf_path = test_dir.path().join("notes.pdf");
        let epub_path = test_dir.path().join("book.epub");
        let binary_path = test_dir.path().join("asset.bin");

        fs::write(&markdown_path, "# Heading").expect("write markdown");
        fs::write(&text_path, "plain text").expect("write text");
        fs::write(
            &image_path,
            [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82],
        )
        .expect("write png header");
        fs::write(&heic_path, [0_u8, 1, 2, 3, 4, 5]).expect("write heic placeholder");
        fs::write(
            &video_path,
            [0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109],
        )
        .expect("write mp4 header");
        fs::write(&audio_path, [73, 68, 51, 4, 0, 0, 0, 0, 0, 0]).expect("write mp3 header");
        fs::write(
            &pdf_path,
            b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
        )
        .expect("write minimal pdf");
        write_test_epub(
            &epub_path,
            "Algorithms Notes",
            "Ada Lovelace",
            "A compact EPUB fixture.",
        );
        fs::write(&binary_path, [0_u8, 159, 146, 150]).expect("write binary");

        let viewer_service = ViewerService::new();

        match viewer_service
            .open_file_preview(&markdown_path, SyntaxUiTheme::Dark)
            .expect("markdown preview")
        {
            FilePreview::Markdown { snapshot, .. } => {
                assert_eq!(snapshot.file_name, "guide.md");
                assert!(snapshot.html.contains("<h1 id=\"heading\">Heading</h1>"));
                assert!(
                    snapshot.source_html.contains("style=")
                        && snapshot.source_html.contains("<span"),
                    "expected syntect-highlighted markdown source HTML, got: {}",
                    snapshot.source_html
                );
            }
            _ => panic!("expected markdown preview"),
        }

        match viewer_service
            .open_file_preview(&text_path, SyntaxUiTheme::Dark)
            .expect("text preview")
        {
            FilePreview::Text {
                html, size_bytes, ..
            } => {
                assert!(html.contains("File type: Plain Text | File size: 10 B"));
                assert!(html.contains("<pre"));
                assert!(html.contains("plain text"));
                assert_eq!(size_bytes, 10);
                assert!(
                    html.contains("style=") && html.contains("<span"),
                    "expected syntect-highlighted HTML, got: {html}"
                );
            }
            _ => panic!("expected text preview"),
        }

        match viewer_service
            .open_file_preview(&image_path, SyntaxUiTheme::Dark)
            .expect("image preview")
        {
            FilePreview::Image { html, .. } => {
                assert!(html.contains("<img"));
                assert!(html.contains("photo.png"));
            }
            _ => panic!("expected image preview"),
        }

        match viewer_service
            .open_file_preview(&heic_path, SyntaxUiTheme::Dark)
            .expect("heic preview")
        {
            FilePreview::Image {
                html, mime_type, ..
            } => {
                assert_eq!(mime_type, "image/heic");
                assert!(html.contains("<img"));
                assert!(html.contains("photo.HEIC"));
            }
            _ => panic!("expected heic image preview"),
        }

        match viewer_service
            .open_file_preview(&video_path, SyntaxUiTheme::Dark)
            .expect("video preview")
        {
            FilePreview::Video {
                html,
                path,
                stream_url,
                ..
            } => {
                assert!(html.is_empty());
                assert!(path.ends_with("clip.mp4"));
                assert!(stream_url.is_none());
            }
            _ => panic!("expected video preview"),
        }

        match viewer_service
            .open_file_preview(&audio_path, SyntaxUiTheme::Dark)
            .expect("audio preview")
        {
            FilePreview::Audio {
                html,
                path,
                stream_url,
                ..
            } => {
                assert!(html.is_empty());
                assert!(path.ends_with("podcast.mp3"));
                assert!(stream_url.is_none());
            }
            _ => panic!("expected audio preview"),
        }

        match viewer_service
            .open_file_preview(&pdf_path, SyntaxUiTheme::Dark)
            .expect("pdf preview")
        {
            FilePreview::Pdf { html, path, .. } => {
                assert!(html.is_empty());
                assert!(path.ends_with("notes.pdf"));
            }
            _ => panic!("expected pdf preview"),
        }

        match viewer_service
            .open_file_preview(&epub_path, SyntaxUiTheme::Dark)
            .expect("epub preview")
        {
            FilePreview::Epub {
                html, path, toc, ..
            } => {
                assert!(path.ends_with("book.epub"));
                assert!(html.contains("Algorithms Notes"));
                assert!(html.contains("Ada Lovelace"));
                assert!(html.contains("A compact EPUB fixture."));
                assert!(html.contains("<style class=\"epub-preview__styles\">"));
                assert!(html.contains(".chapter{color:#202020}"));
                assert!(html.contains("data:image/png;base64,"));
                assert!(html.contains("id=\"epub-chapter-oebps-chapter-xhtml-frag-intro\""));
                assert!(html.contains("data-epub-href=\"OEBPS/chapter.xhtml#intro\""));
                assert!(html.contains("href=\"#epub-chapter-oebps-chapter-xhtml-frag-details\""));
                assert_eq!(toc.len(), 1);
                assert_eq!(toc[0].label, "Algorithms Notes");
                assert_eq!(toc[0].href.as_deref(), Some("OEBPS/chapter.xhtml#intro"));
                assert_eq!(
                    toc[0].anchor_id.as_deref(),
                    Some("epub-chapter-oebps-chapter-xhtml-frag-intro")
                );
                assert_eq!(toc[0].children.len(), 1);
                assert_eq!(toc[0].children[0].label, "Details");
            }
            _ => panic!("expected epub preview"),
        }

        match viewer_service
            .open_file_preview(&binary_path, SyntaxUiTheme::Dark)
            .expect("binary preview")
        {
            FilePreview::Binary { message, .. } => {
                assert_eq!(message, "Binary file preview is not available.");
            }
            _ => panic!("expected binary preview"),
        }
    }

    #[test]
    fn open_file_preview_treats_heic_and_heif_paths_as_images() {
        let test_dir = TestDir::new();
        let viewer_service = ViewerService::new();
        let cases = [
            ("photo.heic", "image/heic"),
            ("photo.heif", "image/heif"),
            ("burst.heics", "image/heic-sequence"),
            ("burst.heifs", "image/heif-sequence"),
        ];

        for (file_name, expected_mime_type) in cases {
            let image_path = test_dir.path().join(file_name);
            fs::write(&image_path, [0_u8, 0, 0, 0]).expect("write placeholder HEIC fixture");

            match viewer_service
                .open_file_preview(&image_path, SyntaxUiTheme::Dark)
                .expect("HEIC/HEIF preview")
            {
                FilePreview::Image {
                    mime_type, html, ..
                } => {
                    assert_eq!(mime_type, expected_mime_type);
                    assert!(html.contains("<img"));
                    assert!(html.contains(file_name));
                }
                _ => panic!("expected image preview for {file_name}"),
            }
        }
    }

    #[test]
    fn open_file_preview_treats_csv_as_structured_preview() {
        let test_dir = TestDir::new();
        let csv_path = test_dir.path().join("data.csv");
        fs::write(&csv_path, "a,b\n\"c,d\",e\n").expect("write csv");

        match ViewerService::new()
            .open_file_preview(&csv_path, SyntaxUiTheme::Dark)
            .expect("csv preview")
        {
            FilePreview::Csv {
                mime_type,
                rows,
                column_count,
                row_count_status,
                formatted_available,
                parse_error,
                raw_html,
                ..
            } => {
                assert_eq!(mime_type, "text/csv");
                assert!(formatted_available);
                assert!(parse_error.is_none());
                assert_eq!(row_count_status, CsvRowCountStatus::Complete);
                assert_eq!(column_count, 2);
                assert_eq!(rows.len(), 2);
                assert_eq!(rows[0], vec!["a", "b"]);
                assert_eq!(rows[1], vec!["c,d", "e"]);
                assert!(
                    raw_html.contains("file-preview") && raw_html.contains("<pre"),
                    "expected highlighted raw HTML wrapper, got: {raw_html}"
                );
            }
            _ => panic!("expected CSV preview"),
        }
    }

    #[test]
    fn open_file_preview_opens_real_mp3_fixture_as_audio() {
        let audio_path = repository_fixture_path("tests/fixtures/file_example_MP3_1MG.mp3");

        match ViewerService::new()
            .open_file_preview(&audio_path, SyntaxUiTheme::Dark)
            .expect("audio preview")
        {
            FilePreview::Audio {
                html,
                path,
                mime_type,
                stream_url,
                ..
            } => {
                assert!(html.is_empty());
                assert!(path.ends_with("file_example_MP3_1MG.mp3"));
                assert_eq!(mime_type, "audio/mpeg");
                assert!(stream_url.is_none());
            }
            _ => panic!("expected audio preview"),
        }
    }

    #[test]
    fn open_file_preview_opens_real_mp4_fixture_as_video() {
        let video_path = repository_fixture_path("tests/fixtures/file_example_MP4_480_1_5MG.mp4");

        match ViewerService::new()
            .open_file_preview(&video_path, SyntaxUiTheme::Dark)
            .expect("video preview")
        {
            FilePreview::Video {
                html,
                path,
                mime_type,
                stream_url,
                ..
            } => {
                assert!(html.is_empty());
                assert!(path.ends_with("file_example_MP4_480_1_5MG.mp4"));
                assert_eq!(mime_type, "video/mp4");
                assert!(stream_url.is_none());
            }
            _ => panic!("expected video preview"),
        }
    }

    #[test]
    fn open_file_preview_reads_epub_ncx_navigation_when_nav_document_is_missing() {
        let test_dir = TestDir::new();
        let epub_path = test_dir.path().join("ncx-book.epub");
        write_test_epub_with_toc_mode(
            &epub_path,
            "NCX Notes",
            "Grace Hopper",
            "Fallback navigation should still work.",
            EpubFixtureTocMode::Ncx,
        );

        match ViewerService::new()
            .open_file_preview(&epub_path, SyntaxUiTheme::Dark)
            .expect("epub preview")
        {
            FilePreview::Epub { toc, .. } => {
                assert_eq!(toc.len(), 1);
                assert_eq!(toc[0].label, "NCX Notes");
                assert_eq!(toc[0].href.as_deref(), Some("OEBPS/chapter.xhtml#intro"));
                assert_eq!(
                    toc[0].anchor_id.as_deref(),
                    Some("epub-chapter-oebps-chapter-xhtml-frag-intro")
                );
                assert_eq!(toc[0].children.len(), 1);
                assert_eq!(toc[0].children[0].label, "Details");
                assert_eq!(
                    toc[0].children[0].href.as_deref(),
                    Some("OEBPS/chapter.xhtml#details")
                );
            }
            _ => panic!("expected epub preview"),
        }
    }

    #[test]
    fn open_file_preview_synthesizes_epub_navigation_when_toc_metadata_is_missing() {
        let test_dir = TestDir::new();
        let epub_path = test_dir.path().join("spine-book.epub");
        write_test_epub_with_toc_mode(
            &epub_path,
            "Spine Notes",
            "Katherine Johnson",
            "Synthetic navigation should use the spine order.",
            EpubFixtureTocMode::SpineFallback,
        );

        match ViewerService::new()
            .open_file_preview(&epub_path, SyntaxUiTheme::Dark)
            .expect("epub preview")
        {
            FilePreview::Epub { toc, .. } => {
                assert_eq!(toc.len(), 1);
                assert_eq!(toc[0].label, "Spine Notes");
                assert_eq!(toc[0].href.as_deref(), Some("OEBPS/chapter.xhtml"));
                assert_eq!(
                    toc[0].anchor_id.as_deref(),
                    Some("epub-chapter-oebps-chapter-xhtml")
                );
                assert!(toc[0].children.is_empty());
            }
            _ => panic!("expected epub preview"),
        }
    }

    #[test]
    fn textual_mime_accepts_structured_application_subtypes() {
        assert!(super::is_textual_mime("application/schema+json"));
        assert!(super::is_textual_mime("Application/Schema+JSON"));
        assert!(super::is_textual_mime("application/vnd.api+json"));
        assert!(super::is_textual_mime("application/xhtml+xml"));
        assert!(super::is_textual_mime("application/vnd.oai.openapi+yaml"));
        assert!(!super::is_textual_mime("application/octet-stream"));
    }

    #[test]
    fn open_file_preview_highlights_toml_as_text() {
        let test_dir = TestDir::new();
        let path = test_dir.path().join("Cargo.toml");
        fs::write(&path, "[package]\nname = \"demo\"\n").expect("write toml");

        match ViewerService::new()
            .open_file_preview(&path, SyntaxUiTheme::Dark)
            .expect("toml preview")
        {
            FilePreview::Text { html, .. } => {
                assert!(html.contains("[package]"));
                assert!(
                    html.contains("style=") && html.contains("<span"),
                    "expected syntect HTML, got: {html}"
                );
            }
            _ => panic!("expected text preview for TOML"),
        }
    }

    #[test]
    fn open_file_preview_treats_shell_and_nix_sources_as_text() {
        let test_dir = TestDir::new();
        let shell_path = test_dir.path().join("install.sh");
        let zsh_path = test_dir.path().join("zsh");
        let nix_path = test_dir.path().join("flake.nix");

        fs::write(&shell_path, "#!/usr/bin/env bash\necho shell\n").expect("write shell");
        fs::write(&zsh_path, "echo zsh\n").expect("write zsh");
        fs::write(
            &nix_path,
            "{\n  description = \"demo\";\n  outputs = { self }: { };\n}\n",
        )
        .expect("write nix");

        match ViewerService::new()
            .open_file_preview(&shell_path, SyntaxUiTheme::Dark)
            .expect("shell preview")
        {
            FilePreview::Text {
                html, size_bytes, ..
            } => {
                assert!(html.contains("File type: Shell | File size: "));
                assert!(html.contains(" | File size: "));
                assert!(!html.contains("Syntax:"));
                assert_eq!(size_bytes, 31);
            }
            _ => panic!("expected text preview for shell"),
        }

        match ViewerService::new()
            .open_file_preview(&zsh_path, SyntaxUiTheme::Dark)
            .expect("zsh preview")
        {
            FilePreview::Text {
                html, size_bytes, ..
            } => {
                assert!(html.contains("File type: Shell | File size: "));
                assert!(html.contains(" | File size: "));
                assert!(!html.contains("Syntax:"));
                assert_eq!(size_bytes, 9);
            }
            _ => panic!("expected text preview for zsh"),
        }

        match ViewerService::new()
            .open_file_preview(&nix_path, SyntaxUiTheme::Dark)
            .expect("nix preview")
        {
            FilePreview::Text {
                html, size_bytes, ..
            } => {
                assert!(html.contains("File type: Nix | File size: "));
                assert!(html.contains(" | File size: "));
                assert!(!html.contains("Syntax:"));
                assert_eq!(size_bytes, 55);
            }
            _ => panic!("expected text preview for nix"),
        }
    }

    #[derive(Clone, Copy)]
    enum EpubFixtureTocMode {
        Nav,
        Ncx,
        SpineFallback,
    }

    fn write_test_epub(path: &Path, title: &str, author: &str, body_text: &str) {
        write_test_epub_with_toc_mode(path, title, author, body_text, EpubFixtureTocMode::Nav);
    }

    fn write_test_epub_with_toc_mode(
        path: &Path,
        title: &str,
        author: &str,
        body_text: &str,
        toc_mode: EpubFixtureTocMode,
    ) {
        use std::io::Write;
        use zip::{write::FileOptions, CompressionMethod, ZipWriter};

        let file = fs::File::create(path).expect("create epub fixture");
        let mut zip = ZipWriter::new(file);
        let stored = FileOptions::default().compression_method(CompressionMethod::Stored);
        let deflated = FileOptions::default().compression_method(CompressionMethod::Deflated);
        let (toc_manifest, spine_attributes) = match toc_mode {
            EpubFixtureTocMode::Nav => (
                r#"    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>"#,
                "",
            ),
            EpubFixtureTocMode::Ncx => (
                r#"    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>"#,
                r#" toc="ncx""#,
            ),
            EpubFixtureTocMode::SpineFallback => ("", ""),
        };

        zip.start_file("mimetype", stored)
            .expect("start mimetype file");
        zip.write_all(b"application/epub+zip")
            .expect("write mimetype");

        zip.start_file("META-INF/container.xml", deflated)
            .expect("start container.xml");
        zip.write_all(
            br#"<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"#,
        )
        .expect("write container.xml");

        zip.start_file("OEBPS/content.opf", deflated)
            .expect("start content.opf");
        zip.write_all(
            format!(
                r#"<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="BookId">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="BookId">urn:test:book</dc:identifier>
    <dc:title>{title}</dc:title>
    <dc:creator>{author}</dc:creator>
  </metadata>
  <manifest>
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
{toc_manifest}
    <item id="style" href="styles/book.css" media-type="text/css"/>
    <item id="cover" href="images/cover.png" media-type="image/png"/>
  </manifest>
  <spine{spine_attributes}>
    <itemref idref="chapter"/>
  </spine>
</package>"#
            )
            .as_bytes(),
        )
        .expect("write content.opf");

        zip.start_file("OEBPS/styles/book.css", deflated)
            .expect("start css");
        zip.write_all(
            b".chapter{color:#202020}.cover{background-image:url('../images/cover.png')}",
        )
        .expect("write css");

        if matches!(toc_mode, EpubFixtureTocMode::Nav) {
            zip.start_file("OEBPS/nav.xhtml", deflated)
                .expect("start nav.xhtml");
            zip.write_all(
                format!(
                    r#"<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
  <head><title>Contents</title></head>
  <body>
    <nav epub:type="toc">
      <ol>
        <li>
          <a href="chapter.xhtml#intro">{title}</a>
          <ol>
            <li><a href="chapter.xhtml#details">Details</a></li>
          </ol>
        </li>
      </ol>
    </nav>
  </body>
</html>"#
                )
                .as_bytes(),
            )
            .expect("write nav.xhtml");
        }

        if matches!(toc_mode, EpubFixtureTocMode::Ncx) {
            zip.start_file("OEBPS/toc.ncx", deflated)
                .expect("start toc.ncx");
            zip.write_all(
                format!(
                    r#"<?xml version="1.0" encoding="UTF-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <navMap>
    <navPoint id="intro" playOrder="1">
      <navLabel><text>{title}</text></navLabel>
      <content src="chapter.xhtml#intro"/>
      <navPoint id="details" playOrder="2">
        <navLabel><text>Details</text></navLabel>
        <content src="chapter.xhtml#details"/>
      </navPoint>
    </navPoint>
  </navMap>
</ncx>"#
                )
                .as_bytes(),
            )
            .expect("write toc.ncx");
        }

        zip.start_file("OEBPS/chapter.xhtml", deflated)
            .expect("start chapter.xhtml");
        zip.write_all(
            format!(
                r##"<?xml version="1.0" encoding="UTF-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
    <title>{title}</title>
    <link rel="stylesheet" href="styles/book.css" type="text/css"/>
  </head>
  <body>
    <section class="chapter">
      <h1 id="intro">{title}</h1>
      <p>{body_text}</p>
      <h2 id="details">Details</h2>
      <p><a href="#details">Jump</a></p>
      <img class="cover" src="images/cover.png" alt="cover"/>
    </section>
  </body>
</html>"##
            )
            .as_bytes(),
        )
        .expect("write chapter.xhtml");

        zip.start_file("OEBPS/images/cover.png", deflated)
            .expect("start cover image");
        zip.write_all(&[
            137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1,
            8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 255,
            255, 63, 0, 5, 254, 2, 254, 167, 53, 129, 132, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96,
            130,
        ])
        .expect("write cover image");

        zip.finish().expect("finish epub fixture");
    }
}
