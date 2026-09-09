use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    time::{Duration, Instant},
};

use serde::{Deserialize, Serialize};

use super::{
    directory_listing::git_ignored_entry_names,
    path_utils::{canonicalize_directory_path, display_path, metadata_modified_at_unix_ms},
    types::DirectoryEntry,
};
use crate::error::{AppError, AppResult};

#[derive(Clone, Copy, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum DirectorySearchKind {
    Name,
    Content,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DirectorySearchInput {
    pub path: String,
    pub query: String,
    pub kind: DirectorySearchKind,
    pub hide_git_ignored: bool,
}

#[derive(Serialize)]
pub struct DirectorySearchMatch {
    pub entry: DirectoryEntry,
    pub relative_path: String,
    pub line_number: Option<usize>,
    pub line_text: Option<String>,
}

#[derive(Serialize)]
pub struct DirectorySearchResult {
    pub root_path: String,
    pub matches: Vec<DirectorySearchMatch>,
    pub truncated: bool,
    pub skipped_count: usize,
    pub scanned_files: usize,
}

struct SearchLimits {
    matches: usize,
    entries: usize,
    file_bytes: u64,
    total_bytes: u64,
    duration: Duration,
}

impl Default for SearchLimits {
    fn default() -> Self {
        Self {
            matches: 200,
            entries: 50_000,
            file_bytes: 8 * 1024 * 1024,
            total_bytes: 64 * 1024 * 1024,
            duration: Duration::from_secs(5),
        }
    }
}

struct SearchState {
    result: DirectorySearchResult,
    limits: SearchLimits,
    started: Instant,
    visited: usize,
    bytes: u64,
}

impl SearchState {
    fn stopped(&mut self) -> bool {
        if self.result.matches.len() >= self.limits.matches
            || self.started.elapsed() >= self.limits.duration
        {
            self.result.truncated = true;
            return true;
        }
        false
    }

    fn scan_file(&mut self, path: &Path, root: &Path, input: &DirectorySearchInput) {
        let Ok(metadata) = fs::symlink_metadata(path) else {
            self.result.skipped_count += 1;
            return;
        };
        if !metadata.is_file() {
            self.result.skipped_count += 1;
            return;
        }
        self.result.scanned_files += 1;
        let relative_path = path
            .strip_prefix(root)
            .unwrap_or(path)
            .to_string_lossy()
            .into_owned();
        let entry = DirectoryEntry {
            path: display_path(path),
            canonical_path: display_path(path),
            name: path
                .file_name()
                .unwrap_or_default()
                .to_string_lossy()
                .into_owned(),
            directory_hint: Path::new(&relative_path)
                .parent()
                .map(display_path)
                .unwrap_or_default(),
            is_directory: false,
            is_symlink: false,
            size_bytes: metadata.len(),
            modified_at_unix_ms: metadata_modified_at_unix_ms(&metadata).unwrap_or(0),
        };
        if input.kind == DirectorySearchKind::Name {
            if relative_path
                .to_lowercase()
                .contains(&input.query.to_lowercase())
            {
                self.result.matches.push(DirectorySearchMatch {
                    entry,
                    relative_path,
                    line_number: None,
                    line_text: None,
                });
            }
            return;
        }
        if metadata.len() > self.limits.file_bytes {
            self.result.skipped_count += 1;
            return;
        }
        let remaining = self.limits.total_bytes.saturating_sub(self.bytes);
        if metadata.len() > remaining || remaining == 0 {
            self.result.truncated = true;
            self.result.skipped_count += 1;
            return;
        }
        let read_limit = self.limits.file_bytes.min(remaining);
        let contents = fs::File::open(path).and_then(|file| {
            let mut bytes = Vec::new();
            file.take(read_limit + 1).read_to_end(&mut bytes)?;
            Ok(bytes)
        });
        let Ok(contents) = contents else {
            self.result.skipped_count += 1;
            return;
        };
        self.bytes += contents.len() as u64;
        if contents.len() as u64 > read_limit || contents.contains(&0) {
            self.result.skipped_count += 1;
            if self.bytes > self.limits.total_bytes {
                self.result.truncated = true;
            }
            return;
        }
        let Ok(contents) = std::str::from_utf8(&contents) else {
            self.result.skipped_count += 1;
            return;
        };
        for (line_index, line) in contents.lines().enumerate() {
            if self.stopped() {
                break;
            }
            if let Some(position) = line.find(&input.query) {
                self.result.matches.push(DirectorySearchMatch {
                    entry: entry.clone(),
                    relative_path: relative_path.clone(),
                    line_number: Some(line_index + 1),
                    line_text: Some(match_excerpt(line, position, input.query.len())),
                });
            }
        }
    }
}

fn match_excerpt(line: &str, position: usize, match_bytes: usize) -> String {
    let start = line[..position]
        .char_indices()
        .rev()
        .nth(60)
        .map_or(0, |(index, _)| index);
    let match_end = position + match_bytes;
    let end = line[match_end..]
        .char_indices()
        .nth(100)
        .map_or(line.len(), |(index, _)| match_end + index);
    format!(
        "{}{}{}",
        if start > 0 { "…" } else { "" },
        &line[start..end],
        if end < line.len() { "…" } else { "" }
    )
}

/// Search regular files beneath a canonical directory with bounded traversal and reads.
pub fn search(input: DirectorySearchInput) -> AppResult<DirectorySearchResult> {
    search_with_limits(input, SearchLimits::default())
}

fn search_with_limits(
    input: DirectorySearchInput,
    limits: SearchLimits,
) -> AppResult<DirectorySearchResult> {
    if input.query.trim().is_empty() || input.query.len() > 1024 {
        return Err(AppError::State(
            "search query must contain 1–1024 UTF-8 bytes".into(),
        ));
    }
    let root = canonicalize_directory_path(Path::new(&input.path))?;
    let mut state = SearchState {
        result: DirectorySearchResult {
            root_path: display_path(&root),
            matches: Vec::new(),
            truncated: false,
            skipped_count: 0,
            scanned_files: 0,
        },
        limits,
        started: Instant::now(),
        visited: 0,
        bytes: 0,
    };
    let mut pending: Vec<PathBuf> = vec![root.clone()];
    while let Some(directory) = pending.pop() {
        if state.stopped() {
            break;
        }
        // A queued directory may have been replaced since its parent was listed.
        let valid_directory = fs::symlink_metadata(&directory)
            .is_ok_and(|metadata| metadata.is_dir())
            && directory
                .canonicalize()
                .is_ok_and(|path| path.starts_with(&root));
        if !valid_directory {
            state.result.skipped_count += 1;
            continue;
        }
        let entries = match fs::read_dir(&directory) {
            Ok(entries) => entries,
            Err(error) if directory == root => {
                return Err(AppError::io("read directory", &root, error))
            }
            Err(_) => {
                state.result.skipped_count += 1;
                continue;
            }
        };
        let mut children = Vec::new();
        for entry in entries {
            if state.stopped() || state.visited >= state.limits.entries {
                state.result.truncated = true;
                break;
            }
            state.visited += 1;
            match entry {
                Ok(entry) => children.push(entry),
                Err(_) => state.result.skipped_count += 1,
            }
        }
        let ignored = if input.hide_git_ignored {
            let names: Vec<_> = children
                .iter()
                .map(|entry| entry.file_name().to_string_lossy().into_owned())
                .collect();
            git_ignored_entry_names(&directory, names.iter().map(String::as_str))
        } else {
            Default::default()
        };
        children.sort_by_key(|entry| entry.file_name());
        for entry in children {
            if state.stopped() {
                break;
            }
            let name = entry.file_name();
            if name == ".git" || ignored.contains(name.to_string_lossy().as_ref()) {
                continue;
            }
            match entry.file_type() {
                Ok(kind) if kind.is_dir() => pending.push(entry.path()),
                Ok(kind) if kind.is_file() => state.scan_file(&entry.path(), &root, &input),
                _ => state.result.skipped_count += 1,
            }
        }
        if state.visited >= state.limits.entries {
            state.result.truncated = true;
            break;
        }
    }
    Ok(state.result)
}

#[cfg(test)]
mod tests;
