use std::{
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use crate::{
    cli::StartupTarget,
    document::service::DocumentService,
    error::{AppError, AppResult},
    viewer::types::{DirectoryEntry, DirectorySnapshot, FilePreview, StartupContext, WorkspaceMode},
};

const MARKDOWN_EXTENSIONS: [&str; 3] = ["md", "markdown", "mdown"];
const TEXTUAL_MIME_PREFIXES: [&str; 2] = ["text/", "inode/x-empty"];
const TEXTUAL_APPLICATION_MIME_TYPES: [&str; 9] = [
    "application/json",
    "application/ld+json",
    "application/toml",
    "application/typescript",
    "application/x-httpd-php",
    "application/x-javascript",
    "application/x-sh",
    "application/xml",
    "application/yaml",
];

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
                let initial_mode = if is_markdown_path(&file_path) {
                    WorkspaceMode::Markdown
                } else {
                    WorkspaceMode::FileView
                };

                Ok(StartupContext {
                    initial_mode,
                    current_directory_path: display_path(&current_directory_path),
                    selected_file_path: Some(display_path(&file_path)),
                })
            }
        }
    }

    pub fn list_directory(
        &self,
        path: &Path,
        selected_path: Option<&Path>,
    ) -> AppResult<DirectorySnapshot> {
        let current_directory_path = canonicalize_directory_path(path)?;
        let parent_directory_path = current_directory_path.parent().map(display_path);
        let selected_path = selected_path
            .map(canonicalize_path)
            .transpose()?
            .filter(|selected_path| selected_path.parent() == Some(current_directory_path.as_path()))
            .map(|selected_path| display_path(&selected_path));

        let mut entries = fs::read_dir(&current_directory_path)
            .map_err(|source| AppError::io("read directory", &current_directory_path, source))?
            .map(|entry_result| {
                let entry = entry_result
                    .map_err(|source| AppError::io("read directory entry", &current_directory_path, source))?;
                let entry_path = entry.path();
                let entry_metadata = entry
                    .metadata()
                    .map_err(|source| AppError::io("read metadata for", &entry_path, source))?;
                let entry_name = entry.file_name().to_string_lossy().to_string();

                Ok(DirectoryEntry {
                    path: display_path(&entry_path.canonicalize().map_err(|source| {
                        AppError::io("canonicalize", &entry_path, source)
                    })?),
                    name: entry_name,
                    is_directory: entry_metadata.is_dir(),
                })
            })
            .collect::<AppResult<Vec<_>>>()?;

        entries.sort_by(|left, right| {
            right
                .is_directory
                .cmp(&left.is_directory)
                .then_with(|| left.name.to_ascii_lowercase().cmp(&right.name.to_ascii_lowercase()))
                .then_with(|| left.name.cmp(&right.name))
        });

        Ok(DirectorySnapshot {
            current_directory_path: display_path(&current_directory_path),
            parent_directory_path,
            entries,
            selected_path,
        })
    }

    pub fn open_file_preview(&self, path: &Path) -> AppResult<FilePreview> {
        let file_path = canonicalize_file_path(path)?;

        if is_markdown_path(&file_path) {
            return self.open_markdown_preview(&file_path);
        }

        let mime_type = tree_magic_mini::from_filepath(&file_path)
            .unwrap_or("application/octet-stream")
            .to_string();

        if mime_type.starts_with("image/") {
            return self.open_image_preview(&file_path, mime_type);
        }

        if mime_type.starts_with("video/") {
            return self.open_video_preview(&file_path, mime_type);
        }

        if is_textual_mime(&mime_type) {
            return self.open_text_preview(&file_path, mime_type);
        }

        self.open_binary_preview(&file_path, mime_type)
    }

    fn open_markdown_preview(&self, path: &Path) -> AppResult<FilePreview> {
        let snapshot = DocumentService::new().open(path)?;

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
            html: format!(
                "<figure class=\"preview-media preview-media--video\"><video controls preload=\"metadata\" src=\"{}\" aria-label=\"{}\">{}</video></figure>",
                escape_html_attribute(&display_path(path)),
                escape_html_attribute(&file_name),
                escape_html_text(&file_name),
            ),
            last_modified: last_modified_string(path)?,
        })
    }

    fn open_text_preview(
        &self,
        path: &Path,
        mime_type: String,
    ) -> AppResult<FilePreview> {
        let file_bytes = fs::read(path).map_err(|source| AppError::io("read", path, source))?;
        let source_text = String::from_utf8_lossy(&file_bytes);

        Ok(FilePreview::Text {
            path: display_path(path),
            file_name: file_name(path),
            mime_type,
            html: format!(
                "<pre class=\"file-preview file-preview--text\"><code>{}</code></pre>",
                escape_html_text(&source_text),
            ),
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

fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(std::ffi::OsStr::to_str)
        .map(|extension| extension.to_ascii_lowercase())
        .is_some_and(|extension| MARKDOWN_EXTENSIONS.contains(&extension.as_str()))
}

fn is_textual_mime(mime_type: &str) -> bool {
    TEXTUAL_MIME_PREFIXES
        .iter()
        .any(|prefix| mime_type.starts_with(prefix))
        || TEXTUAL_APPLICATION_MIME_TYPES.contains(&mime_type)
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|file_name| file_name.to_string_lossy().to_string())
        .unwrap_or_else(|| path.display().to_string())
}

fn display_path(path: &Path) -> String {
    path.display().to_string()
}

fn last_modified_string(path: &Path) -> AppResult<String> {
    let metadata =
        fs::metadata(path).map_err(|source| AppError::io("read metadata for", path, source))?;
    let modified_time = metadata
        .modified()
        .map_err(|source| AppError::io("read modified time for", path, source))?;

    Ok(modified_time
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis()
        .to_string())
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
        viewer::types::{FilePreview, WorkspaceMode},
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
            let path = std::env::temp_dir().join(format!("marky-viewer-tests-{unique}"));
            fs::create_dir_all(&path).expect("create temp test directory");
            Self { path }
        }

        fn path(&self) -> &Path {
            &self.path
        }
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn startup_context_uses_markdown_mode_for_markdown_files() {
        let test_dir = TestDir::new();
        let markdown_path = test_dir.path().join("guide.md");
        fs::write(&markdown_path, "# Hello").expect("write markdown");

        let context = ViewerService::new()
            .startup_context(&StartupTarget::File(
                markdown_path.canonicalize().expect("canonical path"),
            ))
            .expect("startup context");

        assert_eq!(context.initial_mode, WorkspaceMode::Markdown);
        assert_eq!(
            context.selected_file_path,
            Some(markdown_path.canonicalize().expect("canonical path").display().to_string())
        );
    }

    #[test]
    fn list_directory_sorts_directories_before_files() {
        let test_dir = TestDir::new();
        fs::create_dir_all(test_dir.path().join("beta")).expect("create beta directory");
        fs::create_dir_all(test_dir.path().join("Alpha")).expect("create alpha directory");
        fs::write(test_dir.path().join("zeta.txt"), "zeta").expect("write zeta");
        fs::write(test_dir.path().join("Bravo.txt"), "bravo").expect("write bravo");

        let snapshot = ViewerService::new()
            .list_directory(test_dir.path(), None)
            .expect("directory snapshot");

        let names = snapshot
            .entries
            .iter()
            .map(|entry| entry.name.clone())
            .collect::<Vec<_>>();
        assert_eq!(names, vec!["Alpha", "beta", "Bravo.txt", "zeta.txt"]);
    }

    #[test]
    fn open_file_preview_distinguishes_markdown_text_media_and_binary_files() {
        let test_dir = TestDir::new();
        let markdown_path = test_dir.path().join("guide.md");
        let text_path = test_dir.path().join("notes.txt");
        let image_path = test_dir.path().join("photo.png");
        let video_path = test_dir.path().join("clip.mp4");
        let binary_path = test_dir.path().join("asset.bin");

        fs::write(&markdown_path, "# Heading").expect("write markdown");
        fs::write(&text_path, "plain text").expect("write text");
        fs::write(&image_path, [
            137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82,
        ])
        .expect("write png header");
        fs::write(&video_path, [
            0, 0, 0, 24, 102, 116, 121, 112, 105, 115, 111, 109,
        ])
        .expect("write mp4 header");
        fs::write(&binary_path, [0_u8, 159, 146, 150]).expect("write binary");

        let viewer_service = ViewerService::new();

        match viewer_service
            .open_file_preview(&markdown_path)
            .expect("markdown preview")
        {
            FilePreview::Markdown { snapshot, .. } => {
                assert_eq!(snapshot.file_name, "guide.md");
                assert!(snapshot.html.contains("<h1 id=\"heading\">Heading</h1>"));
            }
            _ => panic!("expected markdown preview"),
        }

        match viewer_service.open_file_preview(&text_path).expect("text preview") {
            FilePreview::Text { html, .. } => {
                assert!(html.contains("<pre"));
                assert!(html.contains("plain text"));
            }
            _ => panic!("expected text preview"),
        }

        match viewer_service
            .open_file_preview(&image_path)
            .expect("image preview")
        {
            FilePreview::Image { html, .. } => {
                assert!(html.contains("<img"));
                assert!(html.contains("photo.png"));
            }
            _ => panic!("expected image preview"),
        }

        match viewer_service
            .open_file_preview(&video_path)
            .expect("video preview")
        {
            FilePreview::Video { html, .. } => {
                assert!(html.contains("<video"));
                assert!(html.contains("clip.mp4"));
            }
            _ => panic!("expected video preview"),
        }

        match viewer_service
            .open_file_preview(&binary_path)
            .expect("binary preview")
        {
            FilePreview::Binary { message, .. } => {
                assert_eq!(message, "Binary file preview is not available.");
            }
            _ => panic!("expected binary preview"),
        }
    }
}
