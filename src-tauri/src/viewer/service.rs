use std::{
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use crate::{
    cli::StartupTarget,
    document::service::DocumentService,
    error::{AppError, AppResult},
    syntax_highlight::{self, SyntaxUiTheme},
    viewer::types::{
        DirectoryEntry, DirectoryListSort, DirectoryPage, DirectorySortDirection,
        DirectorySortField, FilePreview, StartupContext, WorkspaceMode,
    },
};

const MARKDOWN_EXTENSIONS: [&str; 3] = ["md", "markdown", "mdown"];
const TEXTUAL_MIME_PREFIXES: [&str; 2] = ["text/", "inode/x-empty"];
const TEXTUAL_APPLICATION_MIME_TYPES: [&str; 10] = [
    "application/json",
    "application/ld+json",
    "application/schema+json",
    "application/toml",
    "application/typescript",
    "application/x-httpd-php",
    "application/x-javascript",
    "application/x-sh",
    "application/xml",
    "application/yaml",
];
/// When magic(1) reports `application/octet-stream` but the path is a known text config/data suffix.
const TEXT_PREVIEW_EXTENSIONS: [&str; 11] = [
    "toml",
    "json",
    "jsonc",
    "yaml",
    "yml",
    "xml",
    "lock",
    "svg",
    "csv",
    "webmanifest",
    "gradle",
];
const IMAGE_EXTENSION_MIME_TYPES: [(&str, &str); 6] = [
    ("apng", "image/apng"),
    ("gif", "image/gif"),
    ("jpeg", "image/jpeg"),
    ("jpg", "image/jpeg"),
    ("png", "image/png"),
    ("webp", "image/webp"),
];
const VIDEO_EXTENSION_MIME_TYPES: [(&str, &str); 5] = [
    ("m4v", "video/mp4"),
    ("mov", "video/quicktime"),
    ("mp4", "video/mp4"),
    ("ogv", "video/ogg"),
    ("webm", "video/webm"),
];
const PDF_EXTENSION_MIME_TYPES: [(&str, &str); 1] = [("pdf", "application/pdf")];
const MAX_DIRECTORY_PAGE_SIZE: usize = 200;

#[derive(Debug)]
struct DirectoryEntrySeed {
    path: PathBuf,
    name: String,
    is_directory: bool,
}

#[derive(Debug)]
struct DirectoryEntryRecord {
    seed: DirectoryEntrySeed,
    size_bytes: u64,
    modified_at_unix_ms: u64,
}

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
                    current_directory_path: display_path(&directory_path),
                    selected_file_path: None,
                })
            }
            StartupTarget::File(path) => {
                let file_path = canonicalize_file_path(path)?;
                let current_directory_path = parent_directory_path(&file_path)?;

                Ok(StartupContext {
                    initial_mode: WorkspaceMode::FileView,
                    current_directory_path: display_path(&current_directory_path),
                    selected_file_path: Some(display_path(&file_path)),
                })
            }
        }
    }

    pub fn list_directory(
        &self,
        path: &Path,
        sort: DirectoryListSort,
        offset: usize,
        limit: usize,
    ) -> AppResult<DirectoryPage> {
        let current_directory_path = canonicalize_directory_path(path)?;
        let parent_directory_path = current_directory_path.parent().map(display_path);
        let page_limit = normalize_directory_page_limit(limit);

        match sort.field {
            DirectorySortField::Name | DirectorySortField::Extension => {
                let mut seeds = read_directory_entry_seeds(&current_directory_path)?;
                seeds.sort_by(|left, right| compare_directory_entry_seeds(left, right, sort));

                let total_entry_count = seeds.len();
                let (start, end) = page_bounds(total_entry_count, offset, page_limit);
                let entries = seeds[start..end]
                    .iter()
                    .map(directory_entry_from_seed)
                    .collect::<AppResult<Vec<_>>>()?;

                Ok(DirectoryPage {
                    current_directory_path: display_path(&current_directory_path),
                    parent_directory_path,
                    entries,
                    total_entry_count,
                    offset: start,
                    limit: page_limit,
                    has_more: end < total_entry_count,
                })
            }
            DirectorySortField::Mtime | DirectorySortField::Size => {
                let mut records = read_directory_entry_records(&current_directory_path)?;
                records.sort_by(|left, right| compare_directory_entry_records(left, right, sort));

                let total_entry_count = records.len();
                let (start, end) = page_bounds(total_entry_count, offset, page_limit);
                let entries = records[start..end]
                    .iter()
                    .map(directory_entry_from_record)
                    .collect::<AppResult<Vec<_>>>()?;

                Ok(DirectoryPage {
                    current_directory_path: display_path(&current_directory_path),
                    parent_directory_path,
                    entries,
                    total_entry_count,
                    offset: start,
                    limit: page_limit,
                    has_more: end < total_entry_count,
                })
            }
        }
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

        if mime_type == "application/pdf" {
            return self.open_pdf_preview(&file_path, mime_type);
        }

        if is_textual_mime(&mime_type) {
            return self.open_text_preview(&file_path, mime_type, ui_theme);
        }

        if is_text_preview_extension(&file_path) {
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
            // Playback uses the frontend `<video src={convertFileSrc(path)}>`; HTML unused.
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

    fn open_text_preview(
        &self,
        path: &Path,
        mime_type: String,
        ui_theme: SyntaxUiTheme,
    ) -> AppResult<FilePreview> {
        let file_bytes = fs::read(path).map_err(|source| AppError::io("read", path, source))?;
        let source_text = String::from_utf8_lossy(&file_bytes);
        let html = syntax_highlight::highlight_file_source(&source_text, path, ui_theme);

        Ok(FilePreview::Text {
            path: display_path(path),
            file_name: file_name(path),
            mime_type,
            html,
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
            message,
        })
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

fn canonicalize_path(path: &Path) -> AppResult<PathBuf> {
    fs::canonicalize(path).map_err(|source| AppError::io("canonicalize", path, source))
}

fn canonicalize_directory_path(path: &Path) -> AppResult<PathBuf> {
    let canonical_path = canonicalize_path(path)?;
    let metadata = fs::metadata(&canonical_path)
        .map_err(|source| AppError::io("read metadata for", &canonical_path, source))?;

    if metadata.is_dir() {
        Ok(canonical_path)
    } else {
        Err(AppError::NotADirectory(display_path(&canonical_path)))
    }
}

fn canonicalize_file_path(path: &Path) -> AppResult<PathBuf> {
    let canonical_path = canonicalize_path(path)?;
    let metadata = fs::metadata(&canonical_path)
        .map_err(|source| AppError::io("read metadata for", &canonical_path, source))?;

    if metadata.is_file() {
        Ok(canonical_path)
    } else {
        Err(AppError::NotAFile(display_path(&canonical_path)))
    }
}

fn parent_directory_path(path: &Path) -> AppResult<PathBuf> {
    path.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| AppError::NotADirectory(display_path(path)))
}

fn normalize_directory_page_limit(limit: usize) -> usize {
    if limit == 0 {
        return MAX_DIRECTORY_PAGE_SIZE;
    }

    limit.min(MAX_DIRECTORY_PAGE_SIZE)
}

fn page_bounds(total_entries: usize, offset: usize, limit: usize) -> (usize, usize) {
    let start = offset.min(total_entries);
    let end = start.saturating_add(limit).min(total_entries);

    (start, end)
}

fn read_directory_entry_seeds(current_directory_path: &Path) -> AppResult<Vec<DirectoryEntrySeed>> {
    fs::read_dir(current_directory_path)
        .map_err(|source| AppError::io("read directory", current_directory_path, source))?
        .map(|entry_result| {
            let entry = entry_result.map_err(|source| {
                AppError::io("read directory entry", current_directory_path, source)
            })?;
            directory_entry_seed_from_fs_entry(&entry)
        })
        .collect()
}

fn read_directory_entry_records(
    current_directory_path: &Path,
) -> AppResult<Vec<DirectoryEntryRecord>> {
    fs::read_dir(current_directory_path)
        .map_err(|source| AppError::io("read directory", current_directory_path, source))?
        .map(|entry_result| {
            let entry = entry_result.map_err(|source| {
                AppError::io("read directory entry", current_directory_path, source)
            })?;
            directory_entry_record_from_fs_entry(&entry)
        })
        .collect()
}

fn directory_entry_seed_from_fs_entry(entry: &fs::DirEntry) -> AppResult<DirectoryEntrySeed> {
    let entry_path = entry.path();
    let entry_name = entry.file_name().to_string_lossy().to_string();
    let file_type = entry
        .file_type()
        .map_err(|source| AppError::io("read file type for", &entry_path, source))?;

    let is_directory = if file_type.is_symlink() {
        entry
            .metadata()
            .map_err(|source| AppError::io("read metadata for", &entry_path, source))?
            .is_dir()
    } else {
        file_type.is_dir()
    };

    Ok(DirectoryEntrySeed {
        path: entry_path,
        name: entry_name,
        is_directory,
    })
}

fn directory_entry_record_from_fs_entry(entry: &fs::DirEntry) -> AppResult<DirectoryEntryRecord> {
    let seed = directory_entry_seed_from_fs_entry(entry)?;
    let entry_metadata = entry
        .metadata()
        .map_err(|source| AppError::io("read metadata for", &seed.path, source))?;
    let modified_at_unix_ms = metadata_modified_at_unix_ms(&entry_metadata)
        .map_err(|source| AppError::io("read modified time for", &seed.path, source))?;

    Ok(DirectoryEntryRecord {
        seed,
        size_bytes: entry_metadata.len(),
        modified_at_unix_ms,
    })
}

fn directory_entry_from_seed(seed: &DirectoryEntrySeed) -> AppResult<DirectoryEntry> {
    let entry_metadata = fs::metadata(&seed.path)
        .map_err(|source| AppError::io("read metadata for", &seed.path, source))?;
    let modified_at_unix_ms = metadata_modified_at_unix_ms(&entry_metadata)
        .map_err(|source| AppError::io("read modified time for", &seed.path, source))?;

    Ok(DirectoryEntry {
        // Use the directory listing path (symlink name), not the canonical target, so
        // each row is unique and keyboard navigation matches the focused item.
        path: display_path(&seed.path),
        canonical_path: display_path(&canonicalize_path(&seed.path)?),
        name: seed.name.clone(),
        is_directory: seed.is_directory,
        size_bytes: entry_metadata.len(),
        modified_at_unix_ms,
    })
}

fn directory_entry_from_record(record: &DirectoryEntryRecord) -> AppResult<DirectoryEntry> {
    Ok(DirectoryEntry {
        path: display_path(&record.seed.path),
        canonical_path: display_path(&canonicalize_path(&record.seed.path)?),
        name: record.seed.name.clone(),
        is_directory: record.seed.is_directory,
        size_bytes: record.size_bytes,
        modified_at_unix_ms: record.modified_at_unix_ms,
    })
}

fn compare_directory_entry_records(
    left: &DirectoryEntryRecord,
    right: &DirectoryEntryRecord,
    sort: DirectoryListSort,
) -> std::cmp::Ordering {
    compare_directory_priority(left.seed.is_directory, right.seed.is_directory)
        .then_with(|| compare_directory_entry_record_field(left, right, sort))
        .then_with(|| {
            compare_directory_names(
                &left.seed.name,
                &right.seed.name,
                DirectorySortDirection::Asc,
            )
        })
        .then_with(|| display_path(&left.seed.path).cmp(&display_path(&right.seed.path)))
}

fn compare_directory_entry_record_field(
    left: &DirectoryEntryRecord,
    right: &DirectoryEntryRecord,
    sort: DirectoryListSort,
) -> std::cmp::Ordering {
    match sort.field {
        DirectorySortField::Mtime => compare_numbers(
            left.modified_at_unix_ms,
            right.modified_at_unix_ms,
            sort.direction,
        ),
        DirectorySortField::Size => {
            compare_numbers(left.size_bytes, right.size_bytes, sort.direction)
        }
        DirectorySortField::Name => {
            compare_directory_names(&left.seed.name, &right.seed.name, sort.direction)
        }
        DirectorySortField::Extension => {
            compare_directory_extensions(&left.seed.name, &right.seed.name, sort.direction)
        }
    }
}

fn compare_directory_entry_seeds(
    left: &DirectoryEntrySeed,
    right: &DirectoryEntrySeed,
    sort: DirectoryListSort,
) -> std::cmp::Ordering {
    compare_directory_entry_seed_field(left, right, sort)
        .then_with(|| compare_directory_names(&left.name, &right.name, DirectorySortDirection::Asc))
        .then_with(|| display_path(&left.path).cmp(&display_path(&right.path)))
}

fn compare_directory_entry_seed_field(
    left: &DirectoryEntrySeed,
    right: &DirectoryEntrySeed,
    sort: DirectoryListSort,
) -> std::cmp::Ordering {
    match sort.field {
        DirectorySortField::Name => {
            compare_directory_names(&left.name, &right.name, sort.direction)
        }
        DirectorySortField::Extension => {
            compare_directory_extensions(&left.name, &right.name, sort.direction)
        }
        DirectorySortField::Mtime | DirectorySortField::Size => std::cmp::Ordering::Equal,
    }
}

fn compare_directory_priority(
    left_is_directory: bool,
    right_is_directory: bool,
) -> std::cmp::Ordering {
    right_is_directory.cmp(&left_is_directory)
}

fn compare_directory_names(
    left_name: &str,
    right_name: &str,
    direction: DirectorySortDirection,
) -> std::cmp::Ordering {
    let ordering = left_name
        .to_ascii_lowercase()
        .cmp(&right_name.to_ascii_lowercase())
        .then_with(|| left_name.cmp(right_name));

    match direction {
        DirectorySortDirection::Asc => ordering,
        DirectorySortDirection::Desc => ordering.reverse(),
    }
}

fn compare_numbers<T>(left: T, right: T, direction: DirectorySortDirection) -> std::cmp::Ordering
where
    T: Ord,
{
    match direction {
        DirectorySortDirection::Asc => left.cmp(&right),
        DirectorySortDirection::Desc => right.cmp(&left),
    }
}

fn compare_directory_extensions(
    left_name: &str,
    right_name: &str,
    direction: DirectorySortDirection,
) -> std::cmp::Ordering {
    let ordering = file_extension(left_name)
        .cmp(&file_extension(right_name))
        .then_with(|| compare_directory_names(left_name, right_name, DirectorySortDirection::Asc));

    match direction {
        DirectorySortDirection::Asc => ordering,
        DirectorySortDirection::Desc => ordering.reverse(),
    }
}

fn file_extension(name: &str) -> String {
    let Some((_, extension)) = name.rsplit_once('.') else {
        return String::new();
    };

    if extension.is_empty() || name.starts_with('.') && !name[1..].contains('.') {
        return String::new();
    }

    extension.to_ascii_lowercase()
}

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(std::ffi::OsStr::to_str)
        .map(|extension| extension.to_ascii_lowercase())
        .is_some_and(|extension| MARKDOWN_EXTENSIONS.contains(&extension.as_str()))
}

fn is_textual_mime(mime_type: &str) -> bool {
    let lower = mime_type.to_ascii_lowercase();
    TEXTUAL_MIME_PREFIXES
        .iter()
        .any(|prefix| lower.starts_with(prefix))
        || TEXTUAL_APPLICATION_MIME_TYPES.contains(&lower.as_str())
        || is_textual_application_structured_subtype(&lower)
}

/// `application/*+json`, `+xml`, `+yaml` (e.g. `application/schema+json`, `application/xhtml+xml`).
fn is_textual_application_structured_subtype(lower_mime: &str) -> bool {
    if !lower_mime.starts_with("application/") {
        return false;
    }
    lower_mime.contains("+json")
        || lower_mime.contains("+xml")
        || lower_mime.ends_with("+yaml")
        || lower_mime.ends_with("+yml")
}

fn is_text_preview_extension(path: &Path) -> bool {
    path.extension()
        .and_then(std::ffi::OsStr::to_str)
        .map(|extension| {
            let lower = extension.to_ascii_lowercase();
            TEXT_PREVIEW_EXTENSIONS.contains(&lower.as_str())
        })
        .unwrap_or(false)
}

fn fallback_media_mime_type<'a>(path: &Path, detected_mime_type: &'a str) -> Option<&'a str> {
    if detected_mime_type.starts_with("image/")
        || detected_mime_type.starts_with("video/")
        || detected_mime_type == "application/pdf"
    {
        return None;
    }

    let extension = path
        .extension()
        .and_then(std::ffi::OsStr::to_str)?
        .to_ascii_lowercase();

    IMAGE_EXTENSION_MIME_TYPES
        .iter()
        .chain(VIDEO_EXTENSION_MIME_TYPES.iter())
        .chain(PDF_EXTENSION_MIME_TYPES.iter())
        .find_map(|(candidate_extension, candidate_mime_type)| {
            (extension == *candidate_extension).then_some(*candidate_mime_type)
        })
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|file_name| file_name.to_string_lossy().to_string())
        .unwrap_or_else(|| path.display().to_string())
}

fn display_path(path: &Path) -> String {
    path.display().to_string()
}

fn metadata_modified_at_unix_ms(metadata: &fs::Metadata) -> std::io::Result<u64> {
    let modified_time = metadata.modified()?;
    let millis = modified_time
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    Ok(u64::try_from(millis).unwrap_or(u64::MAX))
}

fn last_modified_string(path: &Path) -> AppResult<String> {
    let metadata =
        fs::metadata(path).map_err(|source| AppError::io("read metadata for", path, source))?;
    let modified_at_unix_ms = metadata_modified_at_unix_ms(&metadata)
        .map_err(|source| AppError::io("read modified time for", path, source))?;

    Ok(modified_at_unix_ms.to_string())
}

fn escape_html_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn escape_html_attribute(value: &str) -> String {
    escape_html_text(value)
        .replace('\"', "&quot;")
        .replace('\'', "&#39;")
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::ViewerService;
    use crate::{
        cli::StartupTarget,
        syntax_highlight::SyntaxUiTheme,
        viewer::types::{
            DirectoryListSort, DirectorySortDirection, DirectorySortField, FilePreview,
            WorkspaceMode,
        },
    };

    struct TestDir {
        path: PathBuf,
    }

    impl TestDir {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            let path = std::env::temp_dir().join(format!("chilla-viewer-tests-{unique}"));
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

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
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
        assert_eq!(
            context.selected_file_path,
            Some(
                markdown_path
                    .canonicalize()
                    .expect("canonical path")
                    .display()
                    .to_string()
            )
        );
    }

    #[test]
    fn list_directory_name_sort_orders_entries_without_directory_priority() {
        let test_dir = TestDir::new();
        fs::create_dir_all(test_dir.path().join("beta")).expect("create beta directory");
        fs::create_dir_all(test_dir.path().join("zulu")).expect("create zulu directory");
        fs::write(test_dir.path().join("Alpha.txt"), "alpha").expect("write alpha");
        fs::write(test_dir.path().join("bravo.txt"), "bravo").expect("write bravo");

        let snapshot = ViewerService::new()
            .list_directory(test_dir.path(), default_directory_sort(), 0, 200)
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
            .list_directory(test_dir.path(), default_directory_sort(), 0, 200)
            .expect("first page");
        let second_page = ViewerService::new()
            .list_directory(test_dir.path(), default_directory_sort(), 200, 200)
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
            .list_directory(test_dir.path(), default_directory_sort(), 0, 200)
            .expect("directory snapshot");

        let paths: Vec<String> = snapshot.entries.iter().map(|e| e.path.clone()).collect();
        assert!(
            paths.contains(&target.display().to_string()),
            "expected real file path in listing: {paths:?}"
        );
        assert!(
            paths.contains(&link.display().to_string()),
            "expected symlink path in listing, not only canonical target: {paths:?}"
        );
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
            target_entry.canonical_path,
            target_canonical.display().to_string(),
            "canonical path is returned for each row so the client can match symlink targets",
        );

        let link_entry = snapshot
            .entries
            .iter()
            .find(|e| e.name == "via_link.txt")
            .expect("symlink row");
        assert_eq!(link_entry.path, link.display().to_string());
        assert_eq!(
            link_entry.canonical_path,
            target_canonical.display().to_string()
        );
    }

    #[test]
    fn open_file_preview_distinguishes_markdown_text_media_and_binary_files() {
        let test_dir = TestDir::new();
        let markdown_path = test_dir.path().join("guide.md");
        let text_path = test_dir.path().join("notes.txt");
        let image_path = test_dir.path().join("photo.png");
        let video_path = test_dir.path().join("clip.mp4");
        let pdf_path = test_dir.path().join("notes.pdf");
        let binary_path = test_dir.path().join("asset.bin");

        fs::write(&markdown_path, "# Heading").expect("write markdown");
        fs::write(&text_path, "plain text").expect("write text");
        fs::write(
            &image_path,
            [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82],
        )
        .expect("write png header");
        fs::write(
            &video_path,
            [0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109],
        )
        .expect("write mp4 header");
        fs::write(
            &pdf_path,
            b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n",
        )
        .expect("write minimal pdf");
        fs::write(&binary_path, [0_u8, 159, 146, 150]).expect("write binary");

        let viewer_service = ViewerService::new();

        match viewer_service
            .open_file_preview(&markdown_path, SyntaxUiTheme::Dark)
            .expect("markdown preview")
        {
            FilePreview::Markdown { snapshot, .. } => {
                assert_eq!(snapshot.file_name, "guide.md");
                assert!(snapshot.html.contains("<h1 id=\"heading\">Heading</h1>"));
            }
            _ => panic!("expected markdown preview"),
        }

        match viewer_service
            .open_file_preview(&text_path, SyntaxUiTheme::Dark)
            .expect("text preview")
        {
            FilePreview::Text { html, .. } => {
                assert!(html.contains("<pre"));
                assert!(html.contains("plain text"));
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
            .open_file_preview(&video_path, SyntaxUiTheme::Dark)
            .expect("video preview")
        {
            FilePreview::Video { html, path, .. } => {
                assert!(html.is_empty());
                assert!(path.ends_with("clip.mp4"));
            }
            _ => panic!("expected video preview"),
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
}
