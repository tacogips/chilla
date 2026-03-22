use std::{
    collections::BTreeSet,
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use crate::{
    document::types::DocumentSnapshot,
    error::{AppError, AppResult},
    markdown::render_markdown,
    syntax_highlight::{self, SyntaxUiTheme},
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
        let source_text = fs::read_to_string(&canonical_path)
            .map_err(|source| AppError::io("read", &canonical_path, source))?;
        let rendered_document = render_markdown(&source_text, ui_theme);
        let source_html =
            syntax_highlight::highlight_file_source(&source_text, &canonical_path, ui_theme);
        let metadata = fs::metadata(&canonical_path)
            .map_err(|source| AppError::io("read metadata for", &canonical_path, source))?;
        let modified_time = metadata
            .modified()
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
        ui_theme: SyntaxUiTheme,
    ) -> AppResult<DocumentSnapshot> {
        let canonical_path = canonicalize_document_path(path)?;
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
        fs::canonicalize(path).map_err(|source| AppError::io("canonicalize", path, source))?;

    let metadata = fs::metadata(&canonical_path)
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
