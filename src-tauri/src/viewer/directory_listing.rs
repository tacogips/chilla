use std::{
    fs,
    io::{Read, Write},
    path::{Path, PathBuf},
    process::{Command, Stdio},
    thread,
};

use crate::{
    error::{AppError, AppResult},
    viewer::path_utils::{
        canonicalize_directory_path, canonicalize_file_path, canonicalize_path, display_path,
        file_name, metadata_modified_at_unix_ms,
    },
    viewer::types::{
        DirectoryEntry, DirectoryListSort, DirectoryPage, DirectorySortDirection,
        DirectorySortField, ExplicitFileSetPage,
    },
};

const MAX_DIRECTORY_PAGE_SIZE: usize = 200;
const GIT_COMMAND_PATH: &str = "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin";

#[derive(Debug)]
struct DirectoryEntrySeed {
    path: PathBuf,
    name: String,
    is_directory: bool,
    is_symlink: bool,
    size_bytes: u64,
    modified_at_unix_ms: u64,
}

#[derive(Debug)]
struct DirectoryEntryRecord {
    seed: DirectoryEntrySeed,
    size_bytes: u64,
    modified_at_unix_ms: u64,
}

#[derive(Debug)]
struct ExplicitEntryRecord {
    path: PathBuf,
    canonical_path: String,
    name: String,
    directory_hint: String,
    size_bytes: u64,
    modified_at_unix_ms: u64,
}

pub(super) fn list_directory(
    path: &Path,
    sort: DirectoryListSort,
    query: Option<&str>,
    hide_git_ignored: bool,
    offset: usize,
    limit: usize,
) -> AppResult<DirectoryPage> {
    let current_directory_path = canonicalize_directory_path(path)?;
    let parent_directory_path = current_directory_path.parent().map(display_path);
    let page_limit = normalize_directory_page_limit(limit);
    let normalized_query = normalize_directory_query(query);

    match sort.field {
        DirectorySortField::Name | DirectorySortField::Extension => {
            let mut seeds = read_directory_entry_seeds(&current_directory_path)?;
            if hide_git_ignored {
                retain_non_git_ignored_entry_seeds(&mut seeds, &current_directory_path);
            }
            if let Some(query) = normalized_query.as_deref() {
                seeds.retain(|entry| directory_entry_matches_query(&entry.name, query));
            }
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
            if hide_git_ignored {
                retain_non_git_ignored_entry_records(&mut records, &current_directory_path);
            }
            if let Some(query) = normalized_query.as_deref() {
                records.retain(|entry| directory_entry_matches_query(&entry.seed.name, query));
            }
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

pub(super) fn list_explicit_file_set(
    paths: &[String],
    sort: DirectoryListSort,
    query: Option<&str>,
    offset: usize,
    limit: usize,
) -> AppResult<ExplicitFileSetPage> {
    let page_limit = normalize_directory_page_limit(limit);
    let normalized_query = normalize_directory_query(query);

    let mut dedup_ordered = Vec::new();
    let mut seen_canonical_paths = std::collections::HashSet::<String>::new();

    for raw_path in paths {
        let canonical_path_buf = canonicalize_file_path(Path::new(raw_path))?;
        let key = display_path(&canonical_path_buf);
        if seen_canonical_paths.insert(key.clone()) {
            dedup_ordered.push(explicit_entry_record_from_canonical(
                canonical_path_buf,
                key,
            )?);
        }
    }

    let mut records = dedup_ordered;
    if let Some(query_slice) = normalized_query.as_deref() {
        records.retain(|entry| {
            explicit_entry_matches_query(&entry.name, &entry.directory_hint, query_slice)
        });
    }

    match sort.field {
        DirectorySortField::Name | DirectorySortField::Extension => {
            records.sort_by(|left, right| compare_explicit_seed_entries(left, right, sort));
        }
        DirectorySortField::Mtime | DirectorySortField::Size => records.sort_by(|left, right| {
            compare_explicit_entry_records(left, right, sort)
                .then_with(|| {
                    compare_directory_names(&left.name, &right.name, DirectorySortDirection::Asc)
                })
                .then_with(|| left.canonical_path.cmp(&right.canonical_path))
        }),
    }

    let total_entry_count = records.len();
    let (start, end) = page_bounds(total_entry_count, offset, page_limit);
    let entries = records[start..end]
        .iter()
        .map(|record| DirectoryEntry {
            path: display_path(&record.path),
            canonical_path: record.canonical_path.clone(),
            name: record.name.clone(),
            directory_hint: record.directory_hint.clone(),
            is_directory: false,
            is_symlink: false,
            size_bytes: record.size_bytes,
            modified_at_unix_ms: record.modified_at_unix_ms,
        })
        .collect();

    Ok(ExplicitFileSetPage {
        entries,
        total_entry_count,
        offset: start,
        limit: page_limit,
        has_more: end < total_entry_count,
    })
}

fn normalize_directory_page_limit(limit: usize) -> usize {
    if limit == 0 {
        return MAX_DIRECTORY_PAGE_SIZE;
    }

    limit.min(MAX_DIRECTORY_PAGE_SIZE)
}

fn normalize_directory_query(query: Option<&str>) -> Option<String> {
    query
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_ascii_lowercase)
}

fn directory_entry_matches_query(name: &str, query: &str) -> bool {
    name.to_ascii_lowercase().contains(query)
}

fn explicit_entry_record_from_canonical(
    path: PathBuf,
    canonical_path: String,
) -> AppResult<ExplicitEntryRecord> {
    let entry_metadata =
        fs::metadata(&path).map_err(|source| AppError::io("read metadata for", &path, source))?;
    let modified_at_unix_ms = metadata_modified_at_unix_ms(&entry_metadata)
        .map_err(|source| AppError::io("read modified time for", &path, source))?;

    Ok(ExplicitEntryRecord {
        directory_hint: path.parent().map(display_path).unwrap_or_default(),
        name: file_name(&path),
        canonical_path,
        path,
        size_bytes: entry_metadata.len(),
        modified_at_unix_ms,
    })
}

fn explicit_entry_matches_query(name: &str, directory_hint: &str, query: &str) -> bool {
    directory_entry_matches_query(name, query)
        || directory_hint.to_ascii_lowercase().contains(query)
}

fn compare_explicit_seed_entries(
    left: &ExplicitEntryRecord,
    right: &ExplicitEntryRecord,
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
    .then_with(|| compare_directory_names(&left.name, &right.name, DirectorySortDirection::Asc))
    .then_with(|| left.canonical_path.cmp(&right.canonical_path))
}

fn compare_explicit_entry_records(
    left: &ExplicitEntryRecord,
    right: &ExplicitEntryRecord,
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
            compare_directory_names(&left.name, &right.name, sort.direction)
        }
        DirectorySortField::Extension => {
            compare_directory_extensions(&left.name, &right.name, sort.direction)
        }
    }
}

fn page_bounds(total_entries: usize, offset: usize, limit: usize) -> (usize, usize) {
    let start = offset.min(total_entries);
    let end = start.saturating_add(limit).min(total_entries);

    (start, end)
}

fn read_directory_entry_seeds(current_directory_path: &Path) -> AppResult<Vec<DirectoryEntrySeed>> {
    let mut seeds = Vec::new();

    for entry_result in fs::read_dir(current_directory_path)
        .map_err(|source| AppError::io("read directory", current_directory_path, source))?
    {
        let entry = entry_result.map_err(|source| {
            AppError::io("read directory entry", current_directory_path, source)
        })?;
        if let Some(seed) = directory_entry_seed_from_fs_entry(&entry)? {
            seeds.push(seed);
        }
    }

    Ok(seeds)
}

fn read_directory_entry_records(
    current_directory_path: &Path,
) -> AppResult<Vec<DirectoryEntryRecord>> {
    let mut records = Vec::new();

    for entry_result in fs::read_dir(current_directory_path)
        .map_err(|source| AppError::io("read directory", current_directory_path, source))?
    {
        let entry = entry_result.map_err(|source| {
            AppError::io("read directory entry", current_directory_path, source)
        })?;
        if let Some(record) = directory_entry_record_from_fs_entry(&entry)? {
            records.push(record);
        }
    }

    Ok(records)
}

fn retain_non_git_ignored_entry_seeds(
    seeds: &mut Vec<DirectoryEntrySeed>,
    current_directory_path: &Path,
) {
    let ignored_entry_names = git_ignored_entry_names(
        current_directory_path,
        seeds.iter().map(|entry| entry.name.as_str()),
    );
    seeds.retain(|entry| !ignored_entry_names.contains(&entry.name));
}

fn retain_non_git_ignored_entry_records(
    records: &mut Vec<DirectoryEntryRecord>,
    current_directory_path: &Path,
) {
    let ignored_entry_names = git_ignored_entry_names(
        current_directory_path,
        records.iter().map(|entry| entry.seed.name.as_str()),
    );
    records.retain(|entry| !ignored_entry_names.contains(&entry.seed.name));
}

fn git_ignored_entry_names<'a>(
    current_directory_path: &Path,
    entry_names: impl Iterator<Item = &'a str>,
) -> std::collections::HashSet<String> {
    let entry_names = entry_names.collect::<Vec<_>>();
    if entry_names.is_empty() {
        return std::collections::HashSet::new();
    }

    let mut command = Command::new("git");
    command
        .current_dir(current_directory_path)
        .args(["check-ignore", "-z", "--stdin"])
        .env_clear()
        .env("PATH", GIT_COMMAND_PATH)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null());
    for environment_name in ["HOME", "XDG_CONFIG_HOME"] {
        if let Some(environment_value) = std::env::var_os(environment_name) {
            command.env(environment_name, environment_value);
        }
    }

    let Ok(mut child) = command.spawn() else {
        return std::collections::HashSet::new();
    };
    let Some(mut stdin) = child.stdin.take() else {
        let _ = child.wait();
        return std::collections::HashSet::new();
    };
    let Some(mut stdout) = child.stdout.take() else {
        drop(stdin);
        let _ = child.wait();
        return std::collections::HashSet::new();
    };
    let stdout_reader = match thread::Builder::new()
        .name("git-check-ignore-stdout".to_owned())
        .spawn(move || {
            let mut output = Vec::new();
            stdout.read_to_end(&mut output).map(|_| output)
        }) {
        Ok(stdout_reader) => stdout_reader,
        Err(_) => {
            drop(stdin);
            let _ = child.wait();
            return std::collections::HashSet::new();
        }
    };
    let write_result = entry_names.iter().try_for_each(|entry_name| {
        stdin
            .write_all(entry_name.as_bytes())
            .and_then(|_| stdin.write_all(&[0]))
    });
    drop(stdin);

    let status = match child.wait() {
        Ok(status) => status,
        Err(_) => {
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_reader.join();
            return std::collections::HashSet::new();
        }
    };
    let Ok(Ok(output)) = stdout_reader.join() else {
        return std::collections::HashSet::new();
    };
    if write_result.is_err() || !status.success() {
        return std::collections::HashSet::new();
    }

    output
        .split(|byte| *byte == 0)
        .filter(|entry_name| !entry_name.is_empty())
        .map(|entry_name| String::from_utf8_lossy(entry_name).into_owned())
        .collect()
}

fn directory_entry_seed_from_fs_entry(
    entry: &fs::DirEntry,
) -> AppResult<Option<DirectoryEntrySeed>> {
    let entry_path = entry.path();
    let entry_name = entry.file_name().to_string_lossy().to_string();
    let file_type = entry
        .file_type()
        .map_err(|source| AppError::io("read file type for", &entry_path, source))?;

    let entry_metadata = match fs::metadata(&entry_path) {
        Ok(metadata) => metadata,
        Err(_) => return Ok(None),
    };
    let modified_at_unix_ms = metadata_modified_at_unix_ms(&entry_metadata)
        .map_err(|source| AppError::io("read modified time for", &entry_path, source))?;
    let is_directory = if file_type.is_symlink() {
        entry_metadata.is_dir()
    } else {
        file_type.is_dir()
    };

    Ok(Some(DirectoryEntrySeed {
        path: entry_path,
        name: entry_name,
        is_directory,
        is_symlink: file_type.is_symlink(),
        size_bytes: entry_metadata.len(),
        modified_at_unix_ms,
    }))
}

fn directory_entry_record_from_fs_entry(
    entry: &fs::DirEntry,
) -> AppResult<Option<DirectoryEntryRecord>> {
    let Some(seed) = directory_entry_seed_from_fs_entry(entry)? else {
        return Ok(None);
    };
    Ok(Some(DirectoryEntryRecord {
        size_bytes: seed.size_bytes,
        modified_at_unix_ms: seed.modified_at_unix_ms,
        seed,
    }))
}

fn directory_entry_from_seed(seed: &DirectoryEntrySeed) -> AppResult<DirectoryEntry> {
    Ok(DirectoryEntry {
        // Use the directory listing path (symlink name), not the canonical target, so
        // each row is unique and keyboard navigation matches the focused item.
        path: display_path(&seed.path),
        canonical_path: canonical_display_path_or_logical(&seed.path),
        name: seed.name.clone(),
        directory_hint: String::new(),
        is_directory: seed.is_directory,
        is_symlink: seed.is_symlink,
        size_bytes: seed.size_bytes,
        modified_at_unix_ms: seed.modified_at_unix_ms,
    })
}

fn directory_entry_from_record(record: &DirectoryEntryRecord) -> AppResult<DirectoryEntry> {
    Ok(DirectoryEntry {
        path: display_path(&record.seed.path),
        canonical_path: canonical_display_path_or_logical(&record.seed.path),
        name: record.seed.name.clone(),
        directory_hint: String::new(),
        is_directory: record.seed.is_directory,
        is_symlink: record.seed.is_symlink,
        size_bytes: record.size_bytes,
        modified_at_unix_ms: record.modified_at_unix_ms,
    })
}

fn canonical_display_path_or_logical(path: &Path) -> String {
    canonicalize_path(path)
        .map(|canonical_path| display_path(&canonical_path))
        .unwrap_or_else(|_| display_path(path))
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

#[cfg(test)]
mod tests;
