use crate::error::{AppError, AppResult};

use super::{
    GitHubPullFileResponse, PrDiffChange, PrDiffChangeType, PrDiffChunk, PrDiffFile, PrFileStatus,
};

pub fn parse_unified_diff(input: &str) -> Vec<PrDiffFile> {
    let mut files = Vec::new();
    let mut current_file: Option<PrDiffFile> = None;
    let mut current_chunk: Option<PrDiffChunk> = None;
    let mut old_line = 0_u32;
    let mut new_line = 0_u32;

    for line in input.lines() {
        if line.starts_with("diff --git ") {
            flush_chunk(&mut current_file, &mut current_chunk);
            if let Some(file) = current_file.take() {
                files.push(file);
            }
            current_file = Some(PrDiffFile {
                path: String::new(),
                old_path: None,
                status: PrFileStatus::Modified,
                additions: 0,
                deletions: 0,
                chunks: Vec::new(),
                is_binary: false,
                raw_url: None,
                full_text: None,
                full_text_truncated: false,
            });
            continue;
        }

        let Some(file) = current_file.as_mut() else {
            continue;
        };

        if let Some(path) = line.strip_prefix("rename from ") {
            file.old_path = Some(path.to_string());
            file.status = PrFileStatus::Renamed;
            continue;
        }

        if let Some(path) = line.strip_prefix("rename to ") {
            file.path = path.to_string();
            file.status = PrFileStatus::Renamed;
            continue;
        }

        if line.starts_with("new file mode ") {
            file.status = PrFileStatus::Added;
            continue;
        }

        if line.starts_with("deleted file mode ") {
            file.status = PrFileStatus::Deleted;
            continue;
        }

        if line.starts_with("copy from ") {
            file.status = PrFileStatus::Copied;
            continue;
        }

        if let Some(path) = line.strip_prefix("--- ") {
            if path != "/dev/null" {
                file.old_path = Some(strip_diff_path_prefix(path).to_string());
            }
            continue;
        }

        if let Some(path) = line.strip_prefix("+++ ") {
            if path != "/dev/null" && file.path.is_empty() {
                file.path = strip_diff_path_prefix(path).to_string();
            }
            continue;
        }

        if line.starts_with("Binary files ") {
            file.is_binary = true;
            continue;
        }

        if line.starts_with("@@ ") {
            flush_chunk(&mut current_file, &mut current_chunk);
            if let Some((next_chunk, next_old_line, next_new_line)) = parse_hunk_header(line) {
                old_line = next_old_line;
                new_line = next_new_line;
                current_chunk = Some(next_chunk);
            }
            continue;
        }

        let Some(chunk) = current_chunk.as_mut() else {
            continue;
        };

        if let Some(content) = line.strip_prefix('+') {
            file.additions += 1;
            chunk.changes.push(PrDiffChange {
                change_type: PrDiffChangeType::Add,
                old_line: None,
                new_line: Some(new_line),
                content: content.to_string(),
            });
            new_line += 1;
            continue;
        }

        if let Some(content) = line.strip_prefix('-') {
            file.deletions += 1;
            chunk.changes.push(PrDiffChange {
                change_type: PrDiffChangeType::Delete,
                old_line: Some(old_line),
                new_line: None,
                content: content.to_string(),
            });
            old_line += 1;
            continue;
        }

        if let Some(content) = line.strip_prefix(' ') {
            chunk.changes.push(PrDiffChange {
                change_type: PrDiffChangeType::Context,
                old_line: Some(old_line),
                new_line: Some(new_line),
                content: content.to_string(),
            });
            old_line += 1;
            new_line += 1;
        }
    }

    flush_chunk(&mut current_file, &mut current_chunk);
    if let Some(file) = current_file {
        files.push(file);
    }

    files
}

pub(super) fn normalize_pull_files(
    raw_files: Vec<GitHubPullFileResponse>,
) -> AppResult<Vec<PrDiffFile>> {
    raw_files
        .into_iter()
        .map(|file| {
            let status = normalize_file_status(&file.status)?;
            let is_binary = infer_is_binary_file(&file);
            let chunks = file
                .patch
                .as_deref()
                .map(parse_patch_chunks)
                .unwrap_or_default();

            Ok(PrDiffFile {
                path: file.filename,
                old_path: file.previous_filename,
                status,
                additions: file.additions,
                deletions: file.deletions,
                chunks,
                is_binary,
                raw_url: file.raw_url,
                full_text: file.full_text,
                full_text_truncated: file.full_text_truncated,
            })
        })
        .collect()
}

fn infer_is_binary_file(file: &GitHubPullFileResponse) -> bool {
    file.patch.is_none() && (file.raw_url.is_none() || is_removed_file_status(&file.status))
}

fn is_removed_file_status(status: &str) -> bool {
    status == "removed" || status == "deleted"
}

fn normalize_file_status(status: &str) -> AppResult<PrFileStatus> {
    match status {
        "added" => Ok(PrFileStatus::Added),
        "modified" | "changed" => Ok(PrFileStatus::Modified),
        "removed" | "deleted" => Ok(PrFileStatus::Deleted),
        "renamed" => Ok(PrFileStatus::Renamed),
        "copied" => Ok(PrFileStatus::Copied),
        other => Err(AppError::State(format!(
            "unsupported GitHub diff file status `{other}`"
        ))),
    }
}

fn parse_patch_chunks(input: &str) -> Vec<PrDiffChunk> {
    let mut chunks = Vec::new();
    let mut current_chunk: Option<PrDiffChunk> = None;
    let mut old_line = 0_u32;
    let mut new_line = 0_u32;

    for line in input.lines() {
        if line.starts_with("@@ ") {
            if let Some(chunk) = current_chunk.take() {
                chunks.push(chunk);
            }
            if let Some((next_chunk, next_old_line, next_new_line)) = parse_hunk_header(line) {
                old_line = next_old_line;
                new_line = next_new_line;
                current_chunk = Some(next_chunk);
            }
            continue;
        }

        let Some(chunk) = current_chunk.as_mut() else {
            continue;
        };

        if let Some(content) = line.strip_prefix('+') {
            chunk.changes.push(PrDiffChange {
                change_type: PrDiffChangeType::Add,
                old_line: None,
                new_line: Some(new_line),
                content: content.to_string(),
            });
            new_line += 1;
            continue;
        }

        if let Some(content) = line.strip_prefix('-') {
            chunk.changes.push(PrDiffChange {
                change_type: PrDiffChangeType::Delete,
                old_line: Some(old_line),
                new_line: None,
                content: content.to_string(),
            });
            old_line += 1;
            continue;
        }

        if let Some(content) = line.strip_prefix(' ') {
            chunk.changes.push(PrDiffChange {
                change_type: PrDiffChangeType::Context,
                old_line: Some(old_line),
                new_line: Some(new_line),
                content: content.to_string(),
            });
            old_line += 1;
            new_line += 1;
        }
    }

    if let Some(chunk) = current_chunk {
        chunks.push(chunk);
    }

    chunks
}

fn flush_chunk(file: &mut Option<PrDiffFile>, chunk: &mut Option<PrDiffChunk>) {
    if let (Some(file), Some(chunk)) = (file.as_mut(), chunk.take()) {
        file.chunks.push(chunk);
    }
}

fn strip_diff_path_prefix(path: &str) -> &str {
    path.strip_prefix("a/")
        .or_else(|| path.strip_prefix("b/"))
        .unwrap_or(path)
}

fn parse_hunk_header(line: &str) -> Option<(PrDiffChunk, u32, u32)> {
    let rest = line.strip_prefix("@@ ")?;
    let marker_index = rest.find(" @@")?;
    let ranges = &rest[..marker_index];
    let header = line.to_string();
    let mut parts = ranges.split_whitespace();
    let old_range = parts.next()?.strip_prefix('-')?;
    let new_range = parts.next()?.strip_prefix('+')?;
    let (old_start, old_lines) = parse_range(old_range)?;
    let (new_start, new_lines) = parse_range(new_range)?;

    Some((
        PrDiffChunk {
            old_start,
            old_lines,
            new_start,
            new_lines,
            header,
            changes: Vec::new(),
        },
        old_start,
        new_start,
    ))
}

fn parse_range(range: &str) -> Option<(u32, u32)> {
    let (start, lines) = match range.split_once(',') {
        Some((start, lines)) => (start.parse().ok()?, lines.parse().ok()?),
        None => (range.parse().ok()?, 1),
    };

    Some((start, lines))
}
