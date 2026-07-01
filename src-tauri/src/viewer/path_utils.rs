use std::{
    fs,
    path::{Path, PathBuf},
    time::UNIX_EPOCH,
};

use crate::error::{AppError, AppResult};

pub(super) fn canonicalize_path(path: &Path) -> AppResult<PathBuf> {
    fs::canonicalize(path).map_err(|source| AppError::io("canonicalize", path, source))
}

pub(super) fn canonicalize_directory_path(path: &Path) -> AppResult<PathBuf> {
    let canonical_path = canonicalize_path(path)?;
    let metadata = fs::metadata(&canonical_path)
        .map_err(|source| AppError::io("read metadata for", &canonical_path, source))?;

    if metadata.is_dir() {
        Ok(canonical_path)
    } else {
        Err(AppError::NotADirectory(display_path(&canonical_path)))
    }
}

pub(super) fn canonicalize_file_path(path: &Path) -> AppResult<PathBuf> {
    let canonical_path = canonicalize_path(path)?;
    let metadata = fs::metadata(&canonical_path)
        .map_err(|source| AppError::io("read metadata for", &canonical_path, source))?;

    if metadata.is_file() {
        Ok(canonical_path)
    } else {
        Err(AppError::NotAFile(display_path(&canonical_path)))
    }
}

pub(super) fn parent_directory_path(path: &Path) -> AppResult<PathBuf> {
    path.parent()
        .map(Path::to_path_buf)
        .ok_or_else(|| AppError::NotADirectory(display_path(path)))
}

pub(super) fn file_name(path: &Path) -> String {
    path.file_name()
        .map(|file_name| file_name.to_string_lossy().to_string())
        .unwrap_or_else(|| path.display().to_string())
}

pub(super) fn display_path(path: &Path) -> String {
    path.display().to_string()
}

pub(super) fn metadata_modified_at_unix_ms(metadata: &fs::Metadata) -> std::io::Result<u64> {
    let modified_time = metadata.modified()?;
    let millis = modified_time
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();

    Ok(u64::try_from(millis).unwrap_or(u64::MAX))
}

pub(super) fn last_modified_string(path: &Path) -> AppResult<String> {
    let metadata =
        fs::metadata(path).map_err(|source| AppError::io("read metadata for", path, source))?;
    let modified_at_unix_ms = metadata_modified_at_unix_ms(&metadata)
        .map_err(|source| AppError::io("read modified time for", path, source))?;

    Ok(modified_at_unix_ms.to_string())
}
