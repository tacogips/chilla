use std::{
    fs,
    path::{Path, PathBuf},
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use super::test_epub::{write_test_epub, write_test_epub_with_toc_mode, EpubFixtureTocMode};
use super::{fallback_media_mime_type, ViewerService};
use crate::{
    cli::StartupTarget,
    error::AppError,
    syntax_highlight::SyntaxUiTheme,
    verbose_log,
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
        let process_id = std::process::id();
        let counter = TEST_DIR_COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "chilla-viewer-tests-{process_id}-{unique}-{counter}"
        ));
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
    let bravo_metadata = fs::metadata(bravo_logical).expect("metadata for bravo logical file path");
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
    fs::write(test_dir.path().join("needle-target.txt"), "needle").expect("write filter target");

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
                snapshot.source_html.contains("style=") && snapshot.source_html.contains("<span"),
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
fn text_preview_records_validation_read_and_metadata_once_per_operation() {
    let test_dir = TestDir::new();
    let path = test_dir.path().join("observed.txt");
    let contents = "diagnostic text\n";
    fs::write(&path, contents).expect("write text");
    let canonical_path = path.canonicalize().expect("canonical path");

    let (preview, lines) = verbose_log::with_test_sink(|| {
        ViewerService::new()
            .open_file_preview(&path, SyntaxUiTheme::Dark)
            .expect("text preview")
    });

    assert!(matches!(preview, FilePreview::Text { .. }));
    assert_eq!(
        lines
            .iter()
            .filter(|line| line.contains("operation=\"canonicalize\""))
            .count(),
        1
    );
    assert_eq!(
        lines
            .iter()
            .filter(|line| line.contains("operation=\"detect_mime\""))
            .count(),
        1
    );
    assert_eq!(
        lines
            .iter()
            .filter(|line| line.contains("operation=\"read\""))
            .count(),
        1
    );
    assert_eq!(
        lines
            .iter()
            .filter(|line| line.contains("operation=\"read_metadata\""))
            .count(),
        2
    );
    assert_eq!(
        lines
            .iter()
            .filter(|line| line.contains("operation=\"read_modified_time\""))
            .count(),
        1
    );
    assert!(lines.iter().all(|line| {
        line.contains(&format!("path=\"{}\"", canonical_path.display()))
            && line.contains("outcome=\"success\"")
    }));
}

#[test]
fn verbose_mime_detection_matches_quiet_file_classification() {
    let test_dir = TestDir::new();
    let fixtures: [(&str, &[u8]); 6] = [
        ("notes.txt", b"plain text\n"),
        (
            "photo.png",
            &[137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82],
        ),
        (
            "clip.mp4",
            &[0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109],
        ),
        ("podcast.mp3", &[73, 68, 51, 4, 0, 0, 0, 0, 0, 0]),
        (
            "notes.pdf",
            b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
        ),
        ("asset.bin", &[0, 159, 146, 150]),
    ];

    for (file_name, contents) in fixtures {
        let path = test_dir.path().join(file_name);
        fs::write(&path, contents).expect("write MIME fixture");

        let (quiet_mime_type, quiet_lines) =
            verbose_log::with_disabled_test_sink(|| super::detect_mime_type(&path));
        let (verbose_mime_type, verbose_lines) =
            verbose_log::with_test_sink(|| super::detect_mime_type(&path));

        assert_eq!(
            verbose_mime_type, quiet_mime_type,
            "verbose MIME detection changed classification for {file_name}"
        );
        assert!(quiet_lines.is_empty());
        assert_eq!(verbose_lines.len(), 1);
        assert!(verbose_lines[0].contains("operation=\"detect_mime\""));
        assert!(verbose_lines[0].contains("outcome=\"success\""));
    }
}

#[cfg(unix)]
#[test]
fn mime_detection_open_failure_is_recorded_and_preserves_binary_fallback() {
    use std::os::unix::fs::PermissionsExt;

    let test_dir = TestDir::new();
    let path = test_dir.path().join("unreadable.bin");
    fs::write(&path, [0_u8, 159, 146, 150]).expect("write binary");
    let canonical_path = path.canonicalize().expect("canonical path");
    let original_permissions = fs::metadata(&path)
        .expect("read original permissions")
        .permissions();
    let mut unreadable_permissions = original_permissions.clone();
    unreadable_permissions.set_mode(0o000);
    fs::set_permissions(&path, unreadable_permissions).expect("make fixture unreadable");

    let (preview, lines) = verbose_log::with_test_sink(|| {
        ViewerService::new()
            .open_file_preview(&path, SyntaxUiTheme::Dark)
            .expect("fallback binary preview")
    });

    fs::set_permissions(&path, original_permissions).expect("restore fixture permissions");

    assert!(matches!(preview, FilePreview::Binary { .. }));
    let mime_failure = lines
        .iter()
        .find(|line| {
            line.contains("operation=\"detect_mime\"") && line.contains("outcome=\"failure\"")
        })
        .expect("MIME detection failure record");
    assert!(mime_failure.contains("duration_ms="));
    assert!(mime_failure.contains(&format!("path=\"{}\"", canonical_path.display())));
    assert!(mime_failure.contains("size_bytes=unavailable"));
    assert!(mime_failure.contains("error="));
    assert!(mime_failure.contains("raw_os_error="));
    assert!(!mime_failure.contains("raw_os_error=unavailable"));
}

#[test]
fn startup_resolution_records_canonicalize_failure_once() {
    let test_dir = TestDir::new();
    let path = test_dir.path().join("missing.md");

    let (error, lines) = verbose_log::with_test_sink(|| {
        super::resolve_startup_target(&path).expect_err("missing path should fail")
    });

    assert!(matches!(
        error,
        AppError::Io {
            action: "canonicalize",
            ..
        }
    ));
    assert_eq!(lines.len(), 1);
    assert!(lines[0].contains("operation=\"canonicalize\""));
    assert!(lines[0].contains("outcome=\"failure\""));
    assert!(lines[0].contains(&format!("path=\"{}\"", path.display())));
    assert!(lines[0].contains("size_bytes=unavailable"));
    assert!(lines[0].contains("error="));
    assert!(lines[0].contains("raw_os_error="));
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
