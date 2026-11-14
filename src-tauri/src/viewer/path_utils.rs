use std::{
    fs,
    path::{Path, PathBuf},
    time::{Instant, SystemTime, UNIX_EPOCH},
};

use crate::{
    error::{AppError, AppResult},
    verbose_log::{self, VerboseIoOutcome},
};

pub(super) fn canonicalize_path(path: &Path) -> AppResult<PathBuf> {
    observed_canonicalize(path).map_err(|source| AppError::io("canonicalize", path, source))
}

pub(super) fn canonicalize_directory_path(path: &Path) -> AppResult<PathBuf> {
    let canonical_path = canonicalize_path(path)?;
    let metadata = observed_metadata(&canonical_path)
        .map_err(|source| AppError::io("read metadata for", &canonical_path, source))?;

    if metadata.is_dir() {
        Ok(canonical_path)
    } else {
        Err(AppError::NotADirectory(display_path(&canonical_path)))
    }
}

pub(super) fn canonicalize_file_path(path: &Path) -> AppResult<PathBuf> {
    let canonical_path = canonicalize_path(path)?;
    let metadata = observed_metadata(&canonical_path)
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
    let metadata = observed_metadata(path)
        .map_err(|source| AppError::io("read metadata for", path, source))?;
    let modified_time = observed_modified_time(path, &metadata)
        .map_err(|source| AppError::io("read modified time for", path, source))?;
    let modified_at_unix_ms = modified_time
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let modified_at_unix_ms = u64::try_from(modified_at_unix_ms).unwrap_or(u64::MAX);

    Ok(modified_at_unix_ms.to_string())
}

pub(super) fn observed_metadata(path: &Path) -> std::io::Result<fs::Metadata> {
    if !verbose_log::is_enabled() {
        return fs::metadata(path);
    }

    let started_at = Instant::now();
    let result = fs::metadata(path);
    match &result {
        Ok(metadata) => verbose_log::record_io(
            "read_metadata",
            path,
            started_at,
            VerboseIoOutcome::Success {
                size_bytes: Some(metadata.len()),
            },
        ),
        Err(error) => verbose_log::record_io(
            "read_metadata",
            path,
            started_at,
            VerboseIoOutcome::Failure { error },
        ),
    }
    result
}

fn observed_canonicalize(path: &Path) -> std::io::Result<PathBuf> {
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

fn observed_modified_time(path: &Path, metadata: &fs::Metadata) -> std::io::Result<SystemTime> {
    if !verbose_log::is_enabled() {
        return metadata.modified();
    }

    let started_at = Instant::now();
    let result = metadata.modified();
    match &result {
        Ok(_) => verbose_log::record_io(
            "read_modified_time",
            path,
            started_at,
            VerboseIoOutcome::Success {
                size_bytes: Some(metadata.len()),
            },
        ),
        Err(error) => verbose_log::record_io(
            "read_modified_time",
            path,
            started_at,
            VerboseIoOutcome::Failure { error },
        ),
    }
    result
}

fn absolute_path(path: &Path) -> PathBuf {
    if path.is_absolute() {
        return path.to_path_buf();
    }

    std::env::current_dir()
        .map(|current_directory| current_directory.join(path))
        .unwrap_or_else(|_| path.to_path_buf())
}
