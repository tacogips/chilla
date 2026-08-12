use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
    time::{Instant, SystemTime, UNIX_EPOCH},
};

use crate::{
    document::types::DocumentSnapshot,
    error::{AppError, AppResult},
    markdown::render_markdown,
    syntax_highlight::{self, SyntaxUiTheme},
    verbose_log::{self, VerboseIoOutcome},
};

const SUPPORTED_EXTENSIONS: [&str; 3] = ["md", "markdown", "mdown"];

#[derive(Clone, Default)]
pub struct DocumentService;

impl DocumentService {
    pub fn new() -> Self {
        Self
    }

    pub fn open(&self, path: &Path, ui_theme: SyntaxUiTheme) -> AppResult<DocumentSnapshot> {
        let canonical_path = canonicalize_document_path(path)?;
        let source_text = read_to_string(&canonical_path)
            .map_err(|source| AppError::io("read", &canonical_path, source))?;
        let rendered_document = render_markdown(&source_text, ui_theme);
        let source_html =
            syntax_highlight::highlight_file_source(&source_text, &canonical_path, ui_theme);
        let metadata = read_metadata(&canonical_path)
            .map_err(|source| AppError::io("read metadata for", &canonical_path, source))?;
        let modified_time = read_modified_time(&canonical_path, &metadata)
            .map_err(|source| AppError::io("read modified time for", &canonical_path, source))?;
        let last_modified = modified_time
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis()
            .to_string();

        let revision_token = blake3::hash(format!("{last_modified}:{source_text}").as_bytes())
            .to_hex()
            .to_string();

        Ok(DocumentSnapshot {
            path: canonical_path.display().to_string(),
            file_name: canonical_path
                .file_name()
                .map(|file_name| file_name.to_string_lossy().to_string())
                .unwrap_or_else(|| "document.md".to_string()),
            source_text,
            source_html,
            html: rendered_document.html,
            headings: rendered_document.headings,
            revision_token,
            last_modified,
        })
    }

    pub fn save(
        &self,
        path: &Path,
        source_text: &str,
        expected_revision_token: &str,
        ui_theme: SyntaxUiTheme,
    ) -> AppResult<DocumentSnapshot> {
        let canonical_path = canonicalize_document_path(path)?;
        let current_snapshot = self.open(&canonical_path, ui_theme)?;
        if current_snapshot.revision_token != expected_revision_token {
            return Err(AppError::DocumentConflict {
                path: canonical_path.display().to_string(),
            });
        }

        fs::write(&canonical_path, source_text)
            .map_err(|source| AppError::io("write", &canonical_path, source))?;
        self.open(&canonical_path, ui_theme)
    }

    pub fn reload(&self, path: &Path, ui_theme: SyntaxUiTheme) -> AppResult<DocumentSnapshot> {
        self.open(path, ui_theme)
    }
}

pub fn canonicalize_document_path(path: &Path) -> AppResult<PathBuf> {
    let canonical_path =
        canonicalize(path).map_err(|source| AppError::io("canonicalize", path, source))?;

    let metadata = read_metadata(&canonical_path)
        .map_err(|source| AppError::io("read metadata for", &canonical_path, source))?;

    if !metadata.is_file() {
        return Err(AppError::NotAFile(canonical_path.display().to_string()));
    }

    let supported_extensions = BTreeSet::from(SUPPORTED_EXTENSIONS);
    let Some(extension) = canonical_path
        .extension()
        .and_then(std::ffi::OsStr::to_str)
        .map(|extension| extension.to_ascii_lowercase())
    else {
        return Err(AppError::UnsupportedExtension(
            canonical_path.display().to_string(),
        ));
    };

    if supported_extensions.contains(extension.as_str()) {
        Ok(canonical_path)
    } else {
        Err(AppError::UnsupportedExtension(
            canonical_path.display().to_string(),
        ))
    }
}

fn canonicalize(path: &Path) -> std::io::Result<PathBuf> {
    if !verbose_log::is_enabled() {
        return fs::canonicalize(path);
    }

    let diagnostic_path = absolute_path(path);
    let started_at = Instant::now();
    let result = fs::canonicalize(path);
    match &result {
        Ok(canonical_path) => verbose_log::record_io(
            "canonicalize",
            canonical_path,
            started_at,
            VerboseIoOutcome::Success { size_bytes: None },
        ),
        Err(error) => verbose_log::record_io(
            "canonicalize",
            &diagnostic_path,
            started_at,
            VerboseIoOutcome::Failure { error },
        ),
    }
    result
}

fn read_to_string(path: &Path) -> std::io::Result<String> {
    if !verbose_log::is_enabled() {
        return fs::read_to_string(path);
    }

    let started_at = Instant::now();
    let result = fs::read_to_string(path);
    record_io_result("read", path, started_at, &result, |contents| {
        Some(contents.len() as u64)
    });
    result
}

fn read_metadata(path: &Path) -> std::io::Result<fs::Metadata> {
    if !verbose_log::is_enabled() {
        return fs::metadata(path);
    }

    let started_at = Instant::now();
    let result = fs::metadata(path);
    record_io_result("read_metadata", path, started_at, &result, |metadata| {
        Some(metadata.len())
    });
    result
}

fn read_modified_time(path: &Path, metadata: &fs::Metadata) -> std::io::Result<SystemTime> {
    if !verbose_log::is_enabled() {
        return metadata.modified();
    }

    let started_at = Instant::now();
    let result = metadata.modified();
    record_io_result("read_modified_time", path, started_at, &result, |_| {
        Some(metadata.len())
    });
    result
}

fn record_io_result<T>(
    operation: &str,
    path: &Path,
    started_at: Instant,
    result: &std::io::Result<T>,
    success_size: impl FnOnce(&T) -> Option<u64>,
) {
    match result {
        Ok(value) => verbose_log::record_io(
            operation,
            path,
            started_at,
            VerboseIoOutcome::Success {
                size_bytes: success_size(value),
            },
        ),
        Err(error) => verbose_log::record_io(
            operation,
            path,
            started_at,
            VerboseIoOutcome::Failure { error },
        ),
    }
}

fn absolute_path(path: &Path) -> PathBuf {
    if path.is_absolute() {
        return path.to_path_buf();
    }

    std::env::current_dir()
        .map(|current_directory| current_directory.join(path))
        .unwrap_or_else(|_| path.to_path_buf())
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::{Path, PathBuf},
        sync::atomic::{AtomicU64, Ordering},
        time::{SystemTime, UNIX_EPOCH},
    };

    use crate::{error::AppError, syntax_highlight::SyntaxUiTheme, verbose_log};

    use super::DocumentService;

    struct TestDir {
        path: PathBuf,
    }

    static TEST_DIR_COUNTER: AtomicU64 = AtomicU64::new(0);

    impl TestDir {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            let counter = TEST_DIR_COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "chilla-document-service-tests-{}-{unique}-{counter}",
                std::process::id()
            ));
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
    fn save_rejects_stale_revision_token() {
        let test_dir = TestDir::new();
        let path = test_dir.path().join("notes.md");
        fs::write(&path, "# Original\n").expect("write markdown");
        let service = DocumentService::new();
        let snapshot = service.open(&path, SyntaxUiTheme::Dark).expect("open");

        fs::write(&path, "# External\n").expect("external write");
        let error = service
            .save(
                &path,
                "# Local\n",
                &snapshot.revision_token,
                SyntaxUiTheme::Dark,
            )
            .expect_err("stale save should fail");

        assert!(matches!(error, AppError::DocumentConflict { .. }));
        assert_eq!(
            fs::read_to_string(&path).expect("read markdown"),
            "# External\n"
        );
    }

    #[test]
    fn save_accepts_current_revision_token() {
        let test_dir = TestDir::new();
        let path = test_dir.path().join("notes.md");
        fs::write(&path, "# Original\n").expect("write markdown");
        let service = DocumentService::new();
        let snapshot = service.open(&path, SyntaxUiTheme::Dark).expect("open");

        let saved = service
            .save(
                &path,
                "# Local\n",
                &snapshot.revision_token,
                SyntaxUiTheme::Dark,
            )
            .expect("save");

        assert_eq!(saved.source_text, "# Local\n");
        assert_eq!(
            fs::read_to_string(&path).expect("read markdown"),
            "# Local\n"
        );
    }

    #[test]
    fn open_records_each_successful_filesystem_operation_once() {
        let test_dir = TestDir::new();
        let path = test_dir.path().join("observed.md");
        let contents = "# Observed\n";
        fs::write(&path, contents).expect("write markdown");
        let canonical_path = path.canonicalize().expect("canonical path");

        let (snapshot, lines) = verbose_log::with_test_sink(|| {
            DocumentService::new()
                .open(&path, SyntaxUiTheme::Dark)
                .expect("open markdown")
        });

        assert_eq!(snapshot.source_text, contents);
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
        assert!(lines.iter().any(|line| {
            line.contains("operation=\"read\"")
                && line.contains(&format!("size_bytes={}", contents.len()))
        }));
    }

    #[test]
    fn open_records_read_failure_with_unavailable_size_and_os_details() {
        let test_dir = TestDir::new();
        let path = test_dir.path().join("invalid-utf8.md");
        fs::write(&path, [0xff_u8]).expect("write invalid UTF-8 markdown");

        let (error, lines) = verbose_log::with_test_sink(|| {
            DocumentService::new()
                .open(&path, SyntaxUiTheme::Dark)
                .expect_err("invalid UTF-8 should fail")
        });

        assert!(matches!(error, AppError::Io { action: "read", .. }));
        let read_failures: Vec<_> = lines
            .iter()
            .filter(|line| {
                line.contains("operation=\"read\"") && line.contains("outcome=\"failure\"")
            })
            .collect();
        assert_eq!(read_failures.len(), 1);
        assert!(read_failures[0].contains("size_bytes=unavailable"));
        assert!(read_failures[0].contains("error="));
        assert!(read_failures[0].contains("raw_os_error=unavailable"));
    }
}
