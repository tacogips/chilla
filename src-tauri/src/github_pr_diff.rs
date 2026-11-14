use std::time::Duration;

use reqwest::blocking::Client;
use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use reqwest::{StatusCode, Url};
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

mod cache;
mod metadata;
mod parser;

#[cfg(test)]
use cache::cache_file_path;
use cache::{read_cached_snapshot, write_cached_snapshot};
#[cfg(test)]
use metadata::GitHubBranchRef;
use metadata::{
    metadata_from_commit_response, metadata_from_compare_response, metadata_from_pull_response,
    GitHubCommitResponse, GitHubCompareResponse, GitHubDiffMetadata, GitHubPullFileResponse,
    GitHubPullResponse,
};
use parser::normalize_pull_files;
pub use parser::parse_unified_diff;

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
    pub source: GitHubDiffSource,
    pub url: String,
    #[serde(default = "default_use_cache")]
    pub use_cache: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Hash, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum GitHubDiffSource {
    PullRequest {
        number: u64,
    },
    Commit {
        sha: String,
    },
    Compare {
        base: String,
        head: String,
    },
    GitWorktree {
        repo_path: String,
    },
    GitCommit {
        repo_path: String,
        commit: String,
    },
    GitRange {
        repo_path: String,
        base: String,
        head: String,
        merge_base: bool,
    },
}

impl GitHubDiffSource {
    #[must_use]
    pub fn pull_request_number(&self) -> Option<u64> {
        match self {
            Self::PullRequest { number } => Some(*number),
            Self::Commit { .. }
            | Self::Compare { .. }
            | Self::GitWorktree { .. }
            | Self::GitCommit { .. }
            | Self::GitRange { .. } => None,
        }
    }

    #[must_use]
    fn request_context(&self) -> &'static str {
        match self {
            Self::PullRequest { .. } => "pull request",
            Self::Commit { .. } => "commit",
            Self::Compare { .. } => "compare",
            Self::GitWorktree { .. } => "local git worktree",
            Self::GitCommit { .. } => "local git commit",
            Self::GitRange { .. } => "local git range",
        }
    }

    #[must_use]
    pub(super) fn fallback_title(&self) -> String {
        match self {
            Self::PullRequest { number } => format!("Pull request #{number}"),
            Self::Commit { sha } => format!("Commit {}", short_sha(sha)),
            Self::Compare { base, head } => format!("Compare {base}...{head}"),
            Self::GitWorktree { repo_path } => format!("Uncommitted changes in {repo_path}"),
            Self::GitCommit { commit, .. } => format!("Commit {}", short_sha(commit)),
            Self::GitRange {
                base,
                head,
                merge_base,
                ..
            } => {
                let separator = if *merge_base { "..." } else { ".." };
                format!("Git diff {base}{separator}{head}")
            }
        }
    }
}

impl GitHubPrTarget {
    /// Resolve the CLI's short repository spelling without treating input as a URL.
    pub fn parse_shorthand(repository: &str, target: &str) -> AppResult<Self> {
        let Some((owner, repo)) = repository
            .strip_prefix("github:")
            .and_then(|value| value.split_once('/'))
        else {
            return Err(AppError::cli_usage(
                "Expected GitHub shorthand: github:<owner>/<repo> <pr-id|sha|commit:sha|base...head>",
                2,
            ));
        };
        let valid_owner = !owner.is_empty()
            && owner.len() <= 39
            && !owner.starts_with('-')
            && !owner.ends_with('-')
            && !owner.contains("--")
            && owner
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-');
        let valid_repo = !repo.is_empty()
            && repo.len() <= 100
            && repo != "."
            && repo != ".."
            && repo
                .bytes()
                .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'));
        if !valid_owner || !valid_repo {
            return Err(AppError::cli_usage(
                "GitHub shorthand requires a valid owner/repository name (no URL, spaces, or extra path segments)",
                2,
            ));
        }
        let source = parse_shorthand_source(target)?;
        let path = match &source {
            GitHubDiffSource::PullRequest { number } => format!("pull/{number}"),
            GitHubDiffSource::Commit { sha } => format!("commit/{sha}"),
            GitHubDiffSource::Compare { base, head } => format!("compare/{base}...{head}"),
            _ => return Err(AppError::State("unexpected GitHub shorthand source".into())),
        };
        Ok(Self {
            owner: owner.to_string(),
            repo: repo.to_string(),
            source,
            url: format!("https://github.com/{owner}/{repo}/{path}"),
            use_cache: true,
        })
    }

    pub fn parse(input: &str) -> AppResult<Self> {
        let trimmed = input.trim();
        let without_fragment = trimmed.split_once('#').map_or(trimmed, |(head, _)| head);
        let without_query = without_fragment
            .split_once('?')
            .map_or(without_fragment, |(head, _)| head);
        let Some(rest) = without_query.strip_prefix("https://") else {
            return Err(AppError::cli_usage(
                "GitHub diff URLs must start with https://github.com/",
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
                "Only github.com diff URLs are supported",
                2,
            ));
        };

        // Strip only the final transport suffix; compare refs may contain slashes.
        let path = path.trim_end_matches('/');
        let path = path
            .strip_suffix(".diff")
            .or_else(|| path.strip_suffix(".patch"))
            .unwrap_or(path);
        let parts = path
            .split('/')
            .filter(|part| !part.is_empty())
            .collect::<Vec<_>>();
        if parts.len() < 4 || parts[2] != "pull" {
            return Self::parse_non_pr_url(&parts);
        }

        if parts.len() > 5 || parts.get(4).is_some_and(|part| *part != "files") {
            return Err(github_url_shape_error());
        }

        let owner = parts[0].to_string();
        let repo = parts[1].to_string();
        let number = parse_pull_request_number(parts[3])?;

        Ok(Self {
            url: format!("https://github.com/{owner}/{repo}/pull/{number}"),
            owner,
            repo,
            source: GitHubDiffSource::PullRequest { number },
            use_cache: true,
        })
    }

    fn parse_non_pr_url(parts: &[&str]) -> AppResult<Self> {
        if parts.len() < 4 {
            return Err(github_url_shape_error());
        }

        let owner = parts[0].to_string();
        let repo = parts[1].to_string();

        match parts[2] {
            "commit" => {
                if parts.len() != 4 {
                    return Err(github_url_shape_error());
                }
                let sha = parts[3].trim();
                if sha.is_empty() {
                    return Err(AppError::cli_usage(
                        "GitHub commit URL is missing a commit SHA",
                        2,
                    ));
                }

                Ok(Self {
                    url: format!("https://github.com/{owner}/{repo}/commit/{sha}"),
                    owner,
                    repo,
                    source: GitHubDiffSource::Commit {
                        sha: sha.to_string(),
                    },
                    use_cache: true,
                })
            }
            "compare" => {
                let comparison = parts[3..].join("/");
                let Some((base, head)) = comparison.split_once("...") else {
                    return Err(AppError::cli_usage(
                        "GitHub compare URLs must use /compare/<base>...<head>",
                        2,
                    ));
                };
                if base.is_empty() || head.is_empty() || head.contains("...") {
                    return Err(AppError::cli_usage(
                        "GitHub compare URLs require both base and head refs",
                        2,
                    ));
                }

                Ok(Self {
                    url: format!("https://github.com/{owner}/{repo}/compare/{base}...{head}"),
                    owner,
                    repo,
                    source: GitHubDiffSource::Compare {
                        base: base.to_string(),
                        head: head.to_string(),
                    },
                    use_cache: true,
                })
            }
            _ => Err(github_url_shape_error()),
        }
    }

    #[must_use]
    pub fn diff_url(&self) -> String {
        format!("{}.diff", self.url)
    }

    #[must_use]
    pub fn api_url(&self) -> String {
        match &self.source {
            GitHubDiffSource::PullRequest { number } => format!(
                "{GITHUB_API_HOST}/repos/{}/{}/pulls/{}",
                self.owner, self.repo, number
            ),
            GitHubDiffSource::Commit { sha } => format!(
                "{GITHUB_API_HOST}/repos/{}/{}/commits/{}",
                self.owner, self.repo, sha
            ),
            GitHubDiffSource::Compare { base, head } => format!(
                "{GITHUB_API_HOST}/repos/{}/{}/compare/{}...{}",
                self.owner, self.repo, base, head
            ),
            GitHubDiffSource::GitWorktree { .. }
            | GitHubDiffSource::GitCommit { .. }
            | GitHubDiffSource::GitRange { .. } => String::new(),
        }
    }

    #[must_use]
    pub fn files_api_url(&self) -> String {
        format!("{}/files", self.api_url())
    }

    #[must_use]
    fn api_context(&self) -> &'static str {
        self.source.request_context()
    }
}

fn parse_shorthand_source(target: &str) -> AppResult<GitHubDiffSource> {
    if !target.is_empty() && target.bytes().all(|byte| byte.is_ascii_digit()) {
        return Ok(GitHubDiffSource::PullRequest {
            number: parse_pull_request_number(target)?,
        });
    }
    if let Some((base, head)) = target.split_once("...") {
        return Ok(GitHubDiffSource::Compare {
            base: encode_shorthand_ref(base)?,
            head: encode_shorthand_ref(head)?,
        });
    }
    let sha = target.strip_prefix("commit:").unwrap_or(target);
    if (4..=40).contains(&sha.len()) && sha.bytes().all(|byte| byte.is_ascii_hexdigit()) {
        return Ok(GitHubDiffSource::Commit {
            sha: sha.to_string(),
        });
    }
    Err(AppError::cli_usage(
        "GitHub shorthand target must be a positive PR number, a 4-40 character hexadecimal SHA, commit:<sha>, or <base>...<head>",
        2,
    ))
}

fn encode_shorthand_ref(value: &str) -> AppResult<String> {
    if value.is_empty()
        || value == "@"
        || value.starts_with('-')
        || value.ends_with('.')
        || value.contains("..")
        || value.contains("@{")
        || value.chars().any(|character| {
            character.is_control()
                || character.is_whitespace()
                || matches!(character, '~' | '^' | ':' | '?' | '*' | '[' | '\\')
        })
        || value
            .split('/')
            .any(|part| part.is_empty() || part.starts_with('.') || part.ends_with(".lock"))
    {
        return Err(AppError::cli_usage(
            "GitHub shorthand comparisons require two valid literal Git refs separated by ...",
            2,
        ));
    }

    // Sources already store URL-encoded refs for the existing API loader. Encode
    // literal percent/fragment characters and protect transport-looking suffixes.
    let suffix_dot = value
        .strip_suffix(".diff")
        .or_else(|| value.strip_suffix(".patch"))
        .map(str::len);
    Ok(value
        .bytes()
        .enumerate()
        .map(|(index, byte)| {
            if byte.is_ascii_alphanumeric()
                || (matches!(byte, b'-' | b'_' | b'.' | b'/') && Some(index) != suffix_dot)
            {
                char::from(byte).to_string()
            } else {
                format!("%{byte:02X}")
            }
        })
        .collect())
}

pub(super) fn short_sha(sha: &str) -> &str {
    sha.get(..sha.len().min(12)).unwrap_or(sha)
}

fn github_url_shape_error() -> AppError {
    AppError::cli_usage(
        "Expected GitHub diff URL shape: https://github.com/<owner>/<repo>/pull/<number>, /pull/<number>/files, /commit/<sha>, or /compare/<base>...<head>",
        2,
    )
}

fn parse_pull_request_number(value: &str) -> AppResult<u64> {
    if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
        return Err(AppError::cli_usage(
            "GitHub pull request number must contain positive decimal digits only",
            2,
        ));
    }
    let number = value.parse::<u64>().map_err(|_| {
        AppError::cli_usage("GitHub pull request number must be a positive integer", 2)
    })?;
    if number == 0 {
        return Err(AppError::cli_usage(
            "GitHub pull request number must be greater than zero",
            2,
        ));
    }

    Ok(number)
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
    pub source: GitHubDiffSource,
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

pub(crate) trait GitHubPrApi {
    fn fetch_metadata(&self, target: &GitHubPrTarget) -> AppResult<GitHubDiffMetadata>;

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
    fn fetch_metadata(&self, target: &GitHubPrTarget) -> AppResult<GitHubDiffMetadata> {
        match &target.source {
            GitHubDiffSource::PullRequest { .. } => {
                let response = self.fetch_json::<GitHubPullResponse>(
                    target.api_url(),
                    &format!("{} metadata", target.api_context()),
                )?;
                Ok(metadata_from_pull_response(response))
            }
            GitHubDiffSource::Commit { .. } => {
                let response = self.fetch_json::<GitHubCommitResponse>(
                    target.api_url(),
                    &format!("{} metadata", target.api_context()),
                )?;
                Ok(metadata_from_commit_response(&target.source, response))
            }
            GitHubDiffSource::Compare { .. } => {
                let response = self.fetch_json::<GitHubCompareResponse>(
                    target.api_url(),
                    &format!("{} metadata", target.api_context()),
                )?;
                Ok(metadata_from_compare_response(&target.source, response))
            }
            GitHubDiffSource::GitWorktree { .. }
            | GitHubDiffSource::GitCommit { .. }
            | GitHubDiffSource::GitRange { .. } => Err(AppError::State(
                "local Git sources are not loaded through the GitHub API".to_string(),
            )),
        }
    }

    fn fetch_files_page(
        &self,
        target: &GitHubPrTarget,
        page: u16,
    ) -> AppResult<Vec<GitHubPullFileResponse>> {
        match &target.source {
            GitHubDiffSource::PullRequest { .. } => self.fetch_pull_files_page(target, page),
            GitHubDiffSource::Commit { .. } => {
                if page > 1 {
                    return Ok(Vec::new());
                }
                let response = self.fetch_json::<GitHubCommitResponse>(
                    target.api_url(),
                    &format!("{} files", target.api_context()),
                )?;
                Ok(response.files)
            }
            GitHubDiffSource::Compare { .. } => {
                if page > 1 {
                    return Ok(Vec::new());
                }
                let response = self.fetch_json::<GitHubCompareResponse>(
                    target.api_url(),
                    &format!("{} files", target.api_context()),
                )?;
                Ok(response.files)
            }
            GitHubDiffSource::GitWorktree { .. }
            | GitHubDiffSource::GitCommit { .. }
            | GitHubDiffSource::GitRange { .. } => Err(AppError::State(
                "local Git sources are not loaded through the GitHub API".to_string(),
            )),
        }
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

impl ReqwestGitHubPrApi {
    fn fetch_json<T: for<'de> Deserialize<'de>>(&self, url: String, context: &str) -> AppResult<T> {
        let request = self
            .client
            .get(url)
            .header(ACCEPT, "application/vnd.github+json");
        let request = apply_github_token(request);
        let response = request
            .send()
            .map_err(|source| github_network_error(context, source))?;

        if !response.status().is_success() {
            return Err(github_http_error(context, response.status()));
        }

        response.json::<T>().map_err(|source| {
            AppError::State(format!("failed to parse GitHub {context}: {source}"))
        })
    }

    fn fetch_pull_files_page(
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
            .map_err(|source| github_network_error("pull request files", source))?;

        if !response.status().is_success() {
            return Err(github_http_error("pull request files", response.status()));
        }

        response
            .json::<Vec<GitHubPullFileResponse>>()
            .map_err(|source| {
                AppError::State(format!("failed to parse pull request files: {source}"))
            })
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
                source: target.source.clone(),
                url: target.url.clone(),
                title: metadata
                    .title
                    .unwrap_or_else(|| target.source.fallback_title()),
                state: metadata.state,
                merged: metadata.merged.unwrap_or(false),
                merged_at: metadata.merged_at,
                updated_at: metadata.updated_at,
                base_branch: metadata.base_branch,
                head_branch: metadata.head_branch,
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
                        "Failed to update GitHub diff cache; continuing with fresh data: {source}"
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

        normalize_pull_files(all_files).map(|mut files| {
            files.sort_by(|left, right| left.path.cmp(&right.path));
            (files, warnings)
        })
    }

    pub fn load_file_text(&self, raw_url: &str) -> AppResult<PrDiffFileText> {
        validate_github_raw_url(raw_url)?;
        let (full_text, full_text_truncated) =
            self.api.fetch_full_text(raw_url).map_err(|message| {
                AppError::State(format!("failed to load GitHub file content: {message}"))
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
            "GitHub could not find this diff source, or the repository is private and credentials are missing."
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

#[cfg(test)]
mod tests;
