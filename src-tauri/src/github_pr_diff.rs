use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    path::PathBuf,
    time::Duration,
};

use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use reqwest::{StatusCode, Url};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

const GITHUB_HOST: &str = "github.com";
const GITHUB_API_HOST: &str = "https://api.github.com";
const HTTP_TIMEOUT: Duration = Duration::from_secs(20);
const FILES_PAGE_SIZE: u16 = 100;
const MAX_DIFF_FILES: usize = 300;
const MAX_FULL_FILE_BYTES: usize = 512 * 1024;
const USER_AGENT_VALUE: &str = concat!("chilla/", env!("CARGO_PKG_VERSION"));

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct GitHubPrTarget {
    pub owner: String,
    pub repo: String,
    pub number: u64,
    pub url: String,
    #[serde(default = "default_use_cache")]
    pub use_cache: bool,
}

impl GitHubPrTarget {
    pub fn parse(input: &str) -> AppResult<Self> {
        let trimmed = input.trim();
        let without_fragment = trimmed.split_once('#').map_or(trimmed, |(head, _)| head);
        let without_query = without_fragment
            .split_once('?')
            .map_or(without_fragment, |(head, _)| head);
        let Some(rest) = without_query.strip_prefix("https://") else {
            return Err(AppError::cli_usage(
                "GitHub pull request URLs must start with https://github.com/",
                2,
            ));
        };
        let Some(path) = rest.strip_prefix(GITHUB_HOST).and_then(|value| {
            if value.is_empty() {
                Some("")
            } else {
                value.strip_prefix('/')
            }
        }) else {
            return Err(AppError::cli_usage(
                "Only github.com pull request URLs are supported",
                2,
            ));
        };

        let parts = path
            .split('/')
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>();
        if parts.len() < 4 || parts[2] != "pull" {
            return Err(AppError::cli_usage(
                "Expected GitHub pull request URL shape: https://github.com/<owner>/<repo>/pull/<number> or https://github.com/<owner>/<repo>/pull/<number>/files",
                2,
            ));
        }

        let number = parts[3].parse::<u64>().map_err(|_| {
            AppError::cli_usage("GitHub pull request number must be a positive integer", 2)
        })?;
        if number == 0 {
            return Err(AppError::cli_usage(
                "GitHub pull request number must be greater than zero",
                2,
            ));
        }

        let owner = parts[0].to_string();
        let repo = parts[1].to_string();

        Ok(Self {
            url: format!("https://github.com/{owner}/{repo}/pull/{number}"),
            owner,
            repo,
            number,
            use_cache: true,
        })
    }

    #[must_use]
    pub fn diff_url(&self) -> String {
        format!("{}.diff", self.url)
    }

    #[must_use]
    pub fn api_url(&self) -> String {
        format!(
            "{GITHUB_API_HOST}/repos/{}/{}/pulls/{}",
            self.owner, self.repo, self.number
        )
    }

    #[must_use]
    pub fn files_api_url(&self) -> String {
        format!("{}/files", self.api_url())
    }
}

fn default_use_cache() -> bool {
    true
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PrFileStatus {
    Added,
    Modified,
    Deleted,
    Renamed,
    Copied,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PrDiffChange {
    pub change_type: PrDiffChangeType,
    pub old_line: Option<u32>,
    pub new_line: Option<u32>,
    pub content: String,
}

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum PrDiffChangeType {
    Add,
    Delete,
    Context,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PrDiffChunk {
    pub old_start: u32,
    pub old_lines: u32,
    pub new_start: u32,
    pub new_lines: u32,
    pub header: String,
    pub changes: Vec<PrDiffChange>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PrDiffFile {
    pub path: String,
    pub old_path: Option<String>,
    pub status: PrFileStatus,
    pub additions: u32,
    pub deletions: u32,
    pub chunks: Vec<PrDiffChunk>,
    pub is_binary: bool,
    pub raw_url: Option<String>,
    pub full_text: Option<String>,
    pub full_text_truncated: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PrDiffFileText {
    pub full_text: String,
    pub full_text_truncated: bool,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PrDiffIdentity {
    pub owner: String,
    pub repo: String,
    pub number: u64,
    pub url: String,
    pub title: String,
    pub state: Option<String>,
    pub merged: bool,
    pub merged_at: Option<String>,
    pub updated_at: Option<String>,
    pub base_branch: Option<String>,
    pub head_branch: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct PrDiffSnapshot {
    pub identity: PrDiffIdentity,
    pub files: Vec<PrDiffFile>,
    pub additions: u32,
    pub deletions: u32,
    pub warnings: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct GitHubPullResponse {
    title: Option<String>,
    state: Option<String>,
    merged: Option<bool>,
    merged_at: Option<String>,
    updated_at: Option<String>,
    base: Option<GitHubBranchRef>,
    head: Option<GitHubBranchRef>,
}

#[derive(Debug, Deserialize, Serialize)]
struct PrDiffCacheRecord {
    updated_at: String,
    snapshot: PrDiffSnapshot,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct GitHubPullFileResponse {
    filename: String,
    previous_filename: Option<String>,
    status: String,
    additions: u32,
    deletions: u32,
    patch: Option<String>,
    raw_url: Option<String>,
    #[serde(default, skip_deserializing)]
    full_text: Option<String>,
    #[serde(default, skip_deserializing)]
    full_text_truncated: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct GitHubBranchRef {
    #[serde(rename = "ref")]
    branch_ref: Option<String>,
}

pub(crate) trait GitHubPrApi {
    fn fetch_metadata(&self, target: &GitHubPrTarget) -> AppResult<GitHubPullResponse>;

    fn fetch_files_page(
        &self,
        target: &GitHubPrTarget,
        page: u16,
    ) -> AppResult<Vec<GitHubPullFileResponse>>;

    fn fetch_full_text(&self, raw_url: &str) -> Result<(String, bool), String>;
}

pub(crate) struct ReqwestGitHubPrApi {
    client: Client,
}

impl ReqwestGitHubPrApi {
    pub fn new() -> AppResult<Self> {
        let mut headers = HeaderMap::new();
        headers.insert(USER_AGENT, HeaderValue::from_static(USER_AGENT_VALUE));

        let client = Client::builder()
            .default_headers(headers)
            .timeout(HTTP_TIMEOUT)
            .build()
            .map_err(|source| {
                AppError::State(format!("failed to create GitHub client: {source}"))
            })?;

        Ok(Self { client })
    }
}

impl GitHubPrApi for ReqwestGitHubPrApi {
    fn fetch_metadata(&self, target: &GitHubPrTarget) -> AppResult<GitHubPullResponse> {
        let request = self
            .client
            .get(target.api_url())
            .header(ACCEPT, "application/vnd.github+json");
        let request = apply_github_token(request);
        let response = request
            .send()
            .map_err(|source| github_network_error("PR metadata", source))?;

        if !response.status().is_success() {
            return Err(github_http_error("PR metadata", response.status()));
        }

        response
            .json::<GitHubPullResponse>()
            .map_err(|source| AppError::State(format!("failed to parse PR metadata: {source}")))
    }

    fn fetch_files_page(
        &self,
        target: &GitHubPrTarget,
        page: u16,
    ) -> AppResult<Vec<GitHubPullFileResponse>> {
        let request = self
            .client
            .get(target.files_api_url())
            .header(ACCEPT, "application/vnd.github+json")
            .query(&[("per_page", FILES_PAGE_SIZE), ("page", page)]);
        let request = apply_github_token(request);
        let response = request
            .send()
            .map_err(|source| github_network_error("PR files", source))?;

        if !response.status().is_success() {
            return Err(github_http_error("PR files", response.status()));
        }

        response
            .json::<Vec<GitHubPullFileResponse>>()
            .map_err(|source| AppError::State(format!("failed to parse PR files: {source}")))
    }

    fn fetch_full_text(&self, raw_url: &str) -> Result<(String, bool), String> {
        let request = self.client.get(raw_url).header(ACCEPT, "text/plain");
        let request = apply_github_token(request);
        let response = request
            .send()
            .map_err(|source| format!("request failed: {source}"))?;

        if !response.status().is_success() {
            return Err(format!("HTTP {}", response.status()));
        }

        let bytes = response
            .bytes()
            .map_err(|source| format!("response body failed: {source}"))?;
        let truncated = bytes.len() > MAX_FULL_FILE_BYTES;
        let visible_bytes = if truncated {
            &bytes[..MAX_FULL_FILE_BYTES]
        } else {
            &bytes
        };

        Ok((
            String::from_utf8_lossy(visible_bytes).to_string(),
            truncated,
        ))
    }
}

pub(crate) struct GitHubPrDiffService<Api = ReqwestGitHubPrApi> {
    api: Api,
}

impl GitHubPrDiffService<ReqwestGitHubPrApi> {
    pub fn new() -> AppResult<Self> {
        Ok(Self {
            api: ReqwestGitHubPrApi::new()?,
        })
    }
}

impl<Api: GitHubPrApi> GitHubPrDiffService<Api> {
    #[cfg(test)]
    fn with_api(api: Api) -> Self {
        Self { api }
    }

    pub fn load(&self, target: &GitHubPrTarget) -> AppResult<PrDiffSnapshot> {
        let metadata = self.api.fetch_metadata(target)?;
        if target.use_cache {
            if let Some(snapshot) = read_cached_snapshot(target, metadata.updated_at.as_deref()) {
                return Ok(snapshot);
            }
        }

        let (files, warnings) = self.fetch_files(target)?;
        let additions = files.iter().map(|file| file.additions).sum();
        let deletions = files.iter().map(|file| file.deletions).sum();

        let mut snapshot = PrDiffSnapshot {
            identity: PrDiffIdentity {
                owner: target.owner.clone(),
                repo: target.repo.clone(),
                number: target.number,
                url: target.url.clone(),
                title: metadata
                    .title
                    .unwrap_or_else(|| format!("Pull request #{}", target.number)),
                state: metadata.state,
                merged: metadata.merged.unwrap_or(false),
                merged_at: metadata.merged_at,
                updated_at: metadata.updated_at,
                base_branch: metadata
                    .base
                    .as_ref()
                    .and_then(|value| value.branch_ref.clone()),
                head_branch: metadata
                    .head
                    .as_ref()
                    .and_then(|value| value.branch_ref.clone()),
            },
            files,
            additions,
            deletions,
            warnings,
        };

        if target.use_cache {
            if let Some(updated_at) = snapshot.identity.updated_at.as_deref() {
                if let Err(source) = write_cached_snapshot(target, updated_at, &snapshot) {
                    snapshot.warnings.push(format!(
                        "Failed to update PR diff cache; continuing with fresh data: {source}"
                    ));
                }
            }
        }

        Ok(snapshot)
    }

    fn fetch_files(&self, target: &GitHubPrTarget) -> AppResult<(Vec<PrDiffFile>, Vec<String>)> {
        let mut all_files = Vec::new();
        let mut warnings = Vec::new();

        for page in 1_u16.. {
            let page_files = self.api.fetch_files_page(target, page)?;
            let is_last_page = page_files.len() < usize::from(FILES_PAGE_SIZE);
            all_files.extend(page_files);

            if all_files.len() >= MAX_DIFF_FILES {
                all_files.truncate(MAX_DIFF_FILES);
                warnings.push(format!(
                    "Only the first {MAX_DIFF_FILES} changed files are shown."
                ));
                break;
            }

            if is_last_page {
                break;
            }
        }

        let (all_files, cap_warnings) = apply_file_cap(all_files);
        warnings.extend(cap_warnings);

        normalize_pull_files(all_files).map(|mut files| {
            files.sort_by(|left, right| left.path.cmp(&right.path));
            (files, warnings)
        })
    }

    pub fn load_file_text(&self, raw_url: &str) -> AppResult<PrDiffFileText> {
        validate_github_raw_url(raw_url)?;
        let (full_text, full_text_truncated) =
            self.api.fetch_full_text(raw_url).map_err(|message| {
                AppError::State(format!("failed to load PR file content: {message}"))
            })?;

        Ok(PrDiffFileText {
            full_text,
            full_text_truncated,
        })
    }
}

fn github_network_error(context: &str, source: reqwest::Error) -> AppError {
    if source.is_timeout() {
        return AppError::State(format!(
            "GitHub {context} request timed out. Check network connectivity and try again."
        ));
    }

    AppError::State(format!(
        "GitHub {context} request failed before a response was received: {source}"
    ))
}

fn github_http_error(context: &str, status: StatusCode) -> AppError {
    let message = match status {
        StatusCode::UNAUTHORIZED => {
            "GitHub authentication failed. Set a valid GITHUB_TOKEN or GH_TOKEN and try again."
                .to_string()
        }
        StatusCode::FORBIDDEN => {
            "GitHub denied the request. Check token permissions or wait for rate limits to reset."
                .to_string()
        }
        StatusCode::NOT_FOUND => {
            "GitHub could not find this pull request, or the repository is private and credentials are missing."
                .to_string()
        }
        StatusCode::TOO_MANY_REQUESTS => {
            "GitHub rate limit was exceeded. Wait for the limit to reset or provide a token."
                .to_string()
        }
        status if status.is_server_error() => {
            format!("GitHub is temporarily unavailable for {context}; retry later.")
        }
        status => format!("GitHub {context} request failed with HTTP {status}."),
    };

    AppError::State(message)
}

fn apply_github_token(
    request: reqwest::blocking::RequestBuilder,
) -> reqwest::blocking::RequestBuilder {
    let token = std::env::var("GITHUB_TOKEN")
        .ok()
        .or_else(|| std::env::var("GH_TOKEN").ok())
        .filter(|value| !value.trim().is_empty());

    match token {
        Some(token) => request.header(AUTHORIZATION, format!("Bearer {token}")),
        None => request,
    }
}

fn validate_github_raw_url(raw_url: &str) -> AppResult<()> {
    let parsed = Url::parse(raw_url)
        .map_err(|source| AppError::State(format!("invalid GitHub raw file URL: {source}")))?;
    if parsed.scheme() != "https" {
        return Err(AppError::State(
            "GitHub raw file URLs must use https".to_string(),
        ));
    }

    match parsed.host_str() {
        Some("raw.githubusercontent.com" | "github.com") => Ok(()),
        Some(host) => Err(AppError::State(format!(
            "unsupported GitHub raw file host `{host}`"
        ))),
        None => Err(AppError::State(
            "GitHub raw file URL is missing a host".to_string(),
        )),
    }
}

fn read_cached_snapshot(
    target: &GitHubPrTarget,
    updated_at: Option<&str>,
) -> Option<PrDiffSnapshot> {
    let updated_at = updated_at?;
    let cache_path = cache_file_path(target);
    let cache_text = fs::read_to_string(cache_path).ok()?;
    let cache_record = serde_json::from_str::<PrDiffCacheRecord>(&cache_text).ok()?;

    if cache_record.updated_at == updated_at {
        Some(cache_record.snapshot)
    } else {
        None
    }
}

fn write_cached_snapshot(
    target: &GitHubPrTarget,
    updated_at: &str,
    snapshot: &PrDiffSnapshot,
) -> std::io::Result<()> {
    let cache_path = cache_file_path(target);
    if let Some(parent) = cache_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let cache_record = PrDiffCacheRecord {
        updated_at: updated_at.to_string(),
        snapshot: snapshot.clone(),
    };
    let cache_text = serde_json::to_string(&cache_record).map_err(std::io::Error::other)?;
    fs::write(cache_path, cache_text)
}

fn cache_file_path(target: &GitHubPrTarget) -> PathBuf {
    let mut hasher = DefaultHasher::new();
    target.owner.hash(&mut hasher);
    target.repo.hash(&mut hasher);
    target.number.hash(&mut hasher);
    let key = hasher.finish();

    std::env::temp_dir()
        .join("chilla")
        .join("github-pr-diff-cache")
        .join(format!("pr-{key:016x}.json"))
}

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

fn normalize_pull_files(raw_files: Vec<GitHubPullFileResponse>) -> AppResult<Vec<PrDiffFile>> {
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

fn apply_file_cap(
    mut raw_files: Vec<GitHubPullFileResponse>,
) -> (Vec<GitHubPullFileResponse>, Vec<String>) {
    if raw_files.len() <= MAX_DIFF_FILES {
        return (raw_files, Vec::new());
    }

    raw_files.truncate(MAX_DIFF_FILES);
    (
        raw_files,
        vec![format!(
            "Only the first {MAX_DIFF_FILES} changed files are shown."
        )],
    )
}

fn normalize_file_status(status: &str) -> AppResult<PrFileStatus> {
    match status {
        "added" => Ok(PrFileStatus::Added),
        "modified" | "changed" => Ok(PrFileStatus::Modified),
        "removed" | "deleted" => Ok(PrFileStatus::Deleted),
        "renamed" => Ok(PrFileStatus::Renamed),
        "copied" => Ok(PrFileStatus::Copied),
        other => Err(AppError::State(format!(
            "unsupported GitHub PR file status `{other}`"
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

#[cfg(test)]
mod tests {
    use std::cell::RefCell;

    use super::{
        apply_file_cap, cache_file_path, normalize_pull_files, parse_unified_diff,
        read_cached_snapshot, write_cached_snapshot, GitHubBranchRef, GitHubPrApi,
        GitHubPrDiffService, GitHubPrTarget, GitHubPullFileResponse, GitHubPullResponse,
        PrDiffChangeType, PrDiffIdentity, PrDiffSnapshot, PrFileStatus, FILES_PAGE_SIZE,
    };

    #[test]
    fn parses_github_pr_url_with_files_tab_query_and_fragment() {
        let target = GitHubPrTarget::parse(
            "https://github.com/tacogips/rielflow/pull/44/files?foo=bar#diff",
        )
        .expect("valid PR URL");

        assert_eq!(target.owner, "tacogips");
        assert_eq!(target.repo, "rielflow");
        assert_eq!(target.number, 44);
        assert_eq!(target.url, "https://github.com/tacogips/rielflow/pull/44");
        assert!(target.use_cache);
    }

    #[test]
    fn parses_github_pr_url_with_trailing_slash() {
        let target = GitHubPrTarget::parse("https://github.com/tacogips/rielflow/pull/44/")
            .expect("valid PR URL");

        assert_eq!(target.owner, "tacogips");
        assert_eq!(target.repo, "rielflow");
        assert_eq!(target.number, 44);
        assert_eq!(target.url, "https://github.com/tacogips/rielflow/pull/44");
        assert!(target.use_cache);
    }

    #[test]
    fn rejects_non_pr_github_url() {
        assert!(GitHubPrTarget::parse("https://github.com/tacogips/chilla").is_err());
    }

    #[test]
    fn parses_unified_diff_files_and_hunks() {
        let diff = "\
diff --git a/src/main.rs b/src/main.rs
index 1111111..2222222 100644
--- a/src/main.rs
+++ b/src/main.rs
@@ -1,2 +1,3 @@
 fn main() {
-    println!(\"old\");
+    println!(\"new\");
+    println!(\"extra\");
 }
";

        let files = parse_unified_diff(diff);

        assert_eq!(files.len(), 1);
        let file = &files[0];
        assert_eq!(file.path, "src/main.rs");
        assert!(matches!(file.status, PrFileStatus::Modified));
        assert_eq!(file.additions, 2);
        assert_eq!(file.deletions, 1);
        assert_eq!(file.chunks.len(), 1);
        assert_eq!(file.chunks[0].old_start, 1);
        assert_eq!(file.chunks[0].new_start, 1);
        assert_eq!(
            file.chunks[0].changes[1].change_type,
            PrDiffChangeType::Delete
        );
        assert_eq!(file.chunks[0].changes[2].change_type, PrDiffChangeType::Add);
    }

    #[test]
    fn normalizes_github_rest_file_entries_and_patch_chunks() {
        let raw_files: Vec<GitHubPullFileResponse> =
            serde_json::from_str(include_str!("../tests/fixtures/github-pr-files.json"))
                .expect("fixture should deserialize");

        let files = normalize_pull_files(raw_files).expect("normalize files");

        assert_eq!(files.len(), 3);
        let renamed = &files[0];
        assert_eq!(renamed.path, "src/new_name.ts");
        assert_eq!(renamed.old_path.as_deref(), Some("src/old_name.ts"));
        assert_eq!(
            renamed.raw_url.as_deref(),
            Some("https://raw.githubusercontent.com/tacogips/chilla/main/src/new_name.ts")
        );
        assert!(matches!(renamed.status, PrFileStatus::Renamed));
        assert_eq!(renamed.chunks.len(), 1);
        assert_eq!(
            renamed.chunks[0].changes[1].change_type,
            PrDiffChangeType::Delete
        );
        assert_eq!(
            renamed.chunks[0].changes[2].change_type,
            PrDiffChangeType::Add
        );
        assert_eq!(renamed.full_text, None);
        assert!(!renamed.full_text_truncated);

        let binary = &files[1];
        assert!(binary.is_binary);
        assert!(binary.chunks.is_empty());

        let deleted = &files[2];
        assert!(matches!(deleted.status, PrFileStatus::Deleted));
    }

    #[test]
    fn keeps_large_text_files_without_patch_lazy_loadable() {
        let raw_url = "https://raw.githubusercontent.com/tacogips/chilla/main/src/large.ts";
        let files = normalize_pull_files(vec![mock_file(
            "src/large.ts",
            "modified",
            None,
            Some(raw_url),
        )])
        .expect("normalize files");

        assert_eq!(files.len(), 1);
        assert!(!files[0].is_binary);
        assert!(files[0].chunks.is_empty());
        assert_eq!(files[0].raw_url.as_deref(), Some(raw_url));
    }

    #[test]
    fn deserializes_github_rest_metadata_fixture() {
        let metadata: GitHubPullResponse =
            serde_json::from_str(include_str!("../tests/fixtures/github-pr-metadata.json"))
                .expect("fixture should deserialize");

        assert_eq!(metadata.title.as_deref(), Some("Add PR diff viewer"));
        assert_eq!(metadata.state.as_deref(), Some("open"));
        assert_eq!(metadata.merged, Some(false));
        assert_eq!(metadata.merged_at, None);
        assert_eq!(metadata.updated_at.as_deref(), Some("2026-06-02T00:00:00Z"));
        assert_eq!(
            metadata
                .base
                .as_ref()
                .and_then(|branch| branch.branch_ref.as_deref()),
            Some("main")
        );
        assert_eq!(
            metadata
                .head
                .as_ref()
                .and_then(|branch| branch.branch_ref.as_deref()),
            Some("feature/pr-diff")
        );
    }

    #[test]
    fn reads_cached_snapshot_when_updated_at_matches() {
        let target =
            GitHubPrTarget::parse("https://github.com/tacogips/rielflow/pull/44").expect("target");
        let cache_path = cache_file_path(&target);
        let _ = std::fs::remove_file(&cache_path);
        let snapshot = test_snapshot(&target, "2026-06-02T00:00:00Z");

        write_cached_snapshot(&target, "2026-06-02T00:00:00Z", &snapshot).expect("write cache");

        let cached = read_cached_snapshot(&target, Some("2026-06-02T00:00:00Z"))
            .expect("cache should match");

        assert_eq!(cached.identity.url, target.url);
        assert_eq!(
            cached.identity.updated_at.as_deref(),
            Some("2026-06-02T00:00:00Z")
        );

        let _ = std::fs::remove_file(cache_path);
    }

    #[test]
    fn ignores_cached_snapshot_when_updated_at_changes() {
        let target =
            GitHubPrTarget::parse("https://github.com/tacogips/rielflow/pull/45").expect("target");
        let cache_path = cache_file_path(&target);
        let _ = std::fs::remove_file(&cache_path);
        let snapshot = test_snapshot(&target, "2026-06-02T00:00:00Z");

        write_cached_snapshot(&target, "2026-06-02T00:00:00Z", &snapshot).expect("write cache");

        assert!(read_cached_snapshot(&target, Some("2026-06-03T00:00:00Z")).is_none());

        let _ = std::fs::remove_file(cache_path);
    }

    #[test]
    fn caps_github_rest_file_entries_with_warning() {
        let mut raw_files = Vec::new();
        for index in 0..(super::MAX_DIFF_FILES + 1) {
            raw_files.push(GitHubPullFileResponse {
                filename: format!("file-{index}.txt"),
                previous_filename: None,
                status: "modified".to_string(),
                additions: 1,
                deletions: 0,
                patch: Some("@@ -1 +1 @@\n-old\n+new".to_string()),
                raw_url: None,
                full_text: None,
                full_text_truncated: false,
            });
        }

        let (capped, warnings) = apply_file_cap(raw_files);

        assert_eq!(capped.len(), super::MAX_DIFF_FILES);
        assert_eq!(
            warnings,
            vec![format!(
                "Only the first {} changed files are shown.",
                super::MAX_DIFF_FILES
            )]
        );
    }

    #[test]
    fn maps_github_http_statuses_to_actionable_messages() {
        fn message(error: crate::error::AppError) -> String {
            match error {
                crate::error::AppError::State(message) => message,
                other => other.to_string(),
            }
        }

        assert_eq!(
            message(super::github_http_error(
                "PR metadata",
                reqwest::StatusCode::UNAUTHORIZED
            )),
            "GitHub authentication failed. Set a valid GITHUB_TOKEN or GH_TOKEN and try again."
        );
        assert_eq!(
            message(super::github_http_error(
                "PR files",
                reqwest::StatusCode::FORBIDDEN
            )),
            "GitHub denied the request. Check token permissions or wait for rate limits to reset."
        );
        assert_eq!(
            message(super::github_http_error(
                "PR files",
                reqwest::StatusCode::NOT_FOUND
            )),
            "GitHub could not find this pull request, or the repository is private and credentials are missing."
        );
        assert_eq!(
            message(super::github_http_error(
                "PR files",
                reqwest::StatusCode::TOO_MANY_REQUESTS
            )),
            "GitHub rate limit was exceeded. Wait for the limit to reset or provide a token."
        );
    }

    #[test]
    fn loads_snapshot_from_mock_github_api_without_hydrating_full_text() {
        let mut target =
            GitHubPrTarget::parse("https://github.com/tacogips/rielflow/pull/44").expect("target");
        target.use_cache = false;
        let service = GitHubPrDiffService::with_api(MockGitHubPrApi::new(
            mock_metadata("2026-06-02T00:00:00Z"),
            vec![vec![mock_file(
                "src/main.rs",
                "modified",
                Some("@@ -1 +1 @@\n-fn old() {}\n+fn main() {}"),
                Some("mock://src/main.rs"),
            )]],
            vec![(
                "mock://src/main.rs".to_string(),
                Ok(("fn main() {}".to_string(), false)),
            )],
        ));

        let snapshot = service.load(&target).expect("load snapshot");

        assert_eq!(snapshot.identity.title, "Add PR diff viewer");
        assert_eq!(snapshot.identity.state.as_deref(), Some("open"));
        assert!(!snapshot.identity.merged);
        assert_eq!(snapshot.files.len(), 1);
        assert_eq!(snapshot.files[0].path, "src/main.rs");
        assert_eq!(
            snapshot.files[0].raw_url.as_deref(),
            Some("mock://src/main.rs")
        );
        assert_eq!(snapshot.files[0].full_text, None);
        assert!(!snapshot.files[0].full_text_truncated);
        assert_eq!(snapshot.files[0].chunks.len(), 1);
        assert_eq!(snapshot.additions, 1);
        assert_eq!(snapshot.deletions, 1);
        assert!(snapshot.warnings.is_empty());
        assert!(service.api.requested_raw_urls.borrow().is_empty());
    }

    #[test]
    fn lazily_loads_full_text_from_mock_github_api() {
        let service = GitHubPrDiffService::with_api(MockGitHubPrApi::new(
            mock_metadata("2026-06-02T00:00:00Z"),
            Vec::new(),
            vec![(
                "https://raw.githubusercontent.com/tacogips/chilla/main/src/main.rs".to_string(),
                Ok(("fn main() {}".to_string(), false)),
            )],
        ));

        let text = service
            .load_file_text("https://raw.githubusercontent.com/tacogips/chilla/main/src/main.rs")
            .expect("load text");

        assert_eq!(text.full_text, "fn main() {}");
        assert!(!text.full_text_truncated);
        assert_eq!(
            service.api.requested_raw_urls.borrow().as_slice(),
            ["https://raw.githubusercontent.com/tacogips/chilla/main/src/main.rs"]
        );
    }

    #[test]
    fn rejects_lazy_full_text_urls_outside_github_raw_hosts() {
        let service = GitHubPrDiffService::with_api(MockGitHubPrApi::new(
            mock_metadata("2026-06-02T00:00:00Z"),
            Vec::new(),
            Vec::new(),
        ));

        assert!(service
            .load_file_text("https://example.com/file.txt")
            .is_err());
        assert!(service.api.requested_raw_urls.borrow().is_empty());
    }

    #[test]
    fn service_uses_cache_without_fetching_files_when_updated_at_matches() {
        let target =
            GitHubPrTarget::parse("https://github.com/tacogips/rielflow/pull/46").expect("target");
        let cache_path = cache_file_path(&target);
        let _ = std::fs::remove_file(&cache_path);
        let cached_snapshot = test_snapshot(&target, "2026-06-02T00:00:00Z");
        write_cached_snapshot(&target, "2026-06-02T00:00:00Z", &cached_snapshot)
            .expect("write cache");

        let api = MockGitHubPrApi::new(
            mock_metadata("2026-06-02T00:00:00Z"),
            vec![vec![mock_file(
                "src/should-not-fetch.rs",
                "modified",
                Some("@@ -1 +1 @@\n-old\n+new"),
                None,
            )]],
            Vec::new(),
        );
        let service = GitHubPrDiffService::with_api(api);

        let snapshot = service.load(&target).expect("load cached snapshot");

        assert_eq!(snapshot.identity.title, "Example");
        assert!(snapshot.files.is_empty());
        assert!(service.api.requested_pages.borrow().is_empty());

        let _ = std::fs::remove_file(cache_path);
    }

    fn test_snapshot(target: &GitHubPrTarget, updated_at: &str) -> PrDiffSnapshot {
        PrDiffSnapshot {
            identity: PrDiffIdentity {
                owner: target.owner.clone(),
                repo: target.repo.clone(),
                number: target.number,
                url: target.url.clone(),
                title: "Example".to_string(),
                state: Some("open".to_string()),
                merged: false,
                merged_at: None,
                updated_at: Some(updated_at.to_string()),
                base_branch: Some("main".to_string()),
                head_branch: Some("feature".to_string()),
            },
            files: Vec::new(),
            additions: 0,
            deletions: 0,
            warnings: Vec::new(),
        }
    }

    fn mock_metadata(updated_at: &str) -> GitHubPullResponse {
        GitHubPullResponse {
            title: Some("Add PR diff viewer".to_string()),
            state: Some("open".to_string()),
            merged: Some(false),
            merged_at: None,
            updated_at: Some(updated_at.to_string()),
            base: Some(GitHubBranchRef {
                branch_ref: Some("main".to_string()),
            }),
            head: Some(GitHubBranchRef {
                branch_ref: Some("feature/pr-diff".to_string()),
            }),
        }
    }

    fn mock_file(
        filename: &str,
        status: &str,
        patch: Option<&str>,
        raw_url: Option<&str>,
    ) -> GitHubPullFileResponse {
        GitHubPullFileResponse {
            filename: filename.to_string(),
            previous_filename: None,
            status: status.to_string(),
            additions: 1,
            deletions: 1,
            patch: patch.map(ToString::to_string),
            raw_url: raw_url.map(ToString::to_string),
            full_text: None,
            full_text_truncated: false,
        }
    }

    type MockFullTextResponse = Result<(String, bool), String>;
    type MockFullTextResponses = Vec<(String, MockFullTextResponse)>;

    struct MockGitHubPrApi {
        metadata: GitHubPullResponse,
        pages: Vec<Vec<GitHubPullFileResponse>>,
        full_text_responses: MockFullTextResponses,
        requested_pages: RefCell<Vec<u16>>,
        requested_raw_urls: RefCell<Vec<String>>,
    }

    impl MockGitHubPrApi {
        fn new(
            metadata: GitHubPullResponse,
            pages: Vec<Vec<GitHubPullFileResponse>>,
            full_text_responses: MockFullTextResponses,
        ) -> Self {
            Self {
                metadata,
                pages,
                full_text_responses,
                requested_pages: RefCell::new(Vec::new()),
                requested_raw_urls: RefCell::new(Vec::new()),
            }
        }
    }

    impl GitHubPrApi for MockGitHubPrApi {
        fn fetch_metadata(
            &self,
            _target: &GitHubPrTarget,
        ) -> crate::error::AppResult<GitHubPullResponse> {
            Ok(self.metadata.clone())
        }

        fn fetch_files_page(
            &self,
            _target: &GitHubPrTarget,
            page: u16,
        ) -> crate::error::AppResult<Vec<GitHubPullFileResponse>> {
            self.requested_pages.borrow_mut().push(page);
            Ok(self
                .pages
                .get(usize::from(page.saturating_sub(1)))
                .cloned()
                .unwrap_or_else(|| {
                    (0..usize::from(FILES_PAGE_SIZE))
                        .map(|index| {
                            mock_file(
                                &format!("empty-page-sentinel-{page}-{index}.txt"),
                                "modified",
                                Some("@@ -1 +1 @@\n-old\n+new"),
                                None,
                            )
                        })
                        .collect()
                }))
        }

        fn fetch_full_text(&self, raw_url: &str) -> Result<(String, bool), String> {
            self.requested_raw_urls
                .borrow_mut()
                .push(raw_url.to_string());
            self.full_text_responses
                .iter()
                .find(|(url, _)| url == raw_url)
                .map(|(_, response)| response.clone())
                .unwrap_or_else(|| Err("missing mock response".to_string()))
        }
    }
}
