use serde::Deserialize;

use super::{short_sha, GitHubDiffSource};

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct GitHubDiffMetadata {
    pub(crate) title: Option<String>,
    pub(crate) state: Option<String>,
    pub(crate) merged: Option<bool>,
    pub(crate) merged_at: Option<String>,
    pub(crate) updated_at: Option<String>,
    pub(crate) base_branch: Option<String>,
    pub(crate) head_branch: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct GitHubPullResponse {
    pub(crate) title: Option<String>,
    pub(crate) state: Option<String>,
    pub(crate) merged: Option<bool>,
    pub(crate) merged_at: Option<String>,
    pub(crate) updated_at: Option<String>,
    pub(crate) base: Option<GitHubBranchRef>,
    pub(crate) head: Option<GitHubBranchRef>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct GitHubCommitResponse {
    sha: Option<String>,
    commit: Option<GitHubCommitDetails>,
    #[serde(default)]
    pub(crate) files: Vec<GitHubPullFileResponse>,
}

#[derive(Debug, Clone, Deserialize)]
struct GitHubCommitDetails {
    message: Option<String>,
    author: Option<GitHubCommitPerson>,
    committer: Option<GitHubCommitPerson>,
}

#[derive(Debug, Clone, Deserialize)]
struct GitHubCommitPerson {
    date: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct GitHubCompareResponse {
    status: Option<String>,
    #[serde(default)]
    ahead_by: Option<u32>,
    #[serde(default)]
    behind_by: Option<u32>,
    base_commit: Option<GitHubCommitResponse>,
    #[serde(default)]
    commits: Vec<GitHubCommitResponse>,
    #[serde(default)]
    pub(crate) files: Vec<GitHubPullFileResponse>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct GitHubPullFileResponse {
    pub(crate) filename: String,
    pub(crate) previous_filename: Option<String>,
    pub(crate) status: String,
    pub(crate) additions: u32,
    pub(crate) deletions: u32,
    pub(crate) patch: Option<String>,
    pub(crate) raw_url: Option<String>,
    #[serde(default, skip_deserializing)]
    pub(crate) full_text: Option<String>,
    #[serde(default, skip_deserializing)]
    pub(crate) full_text_truncated: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct GitHubBranchRef {
    #[serde(rename = "ref")]
    pub(crate) branch_ref: Option<String>,
}

pub(crate) fn metadata_from_pull_response(response: GitHubPullResponse) -> GitHubDiffMetadata {
    GitHubDiffMetadata {
        title: response.title,
        state: response.state,
        merged: response.merged,
        merged_at: response.merged_at,
        updated_at: response.updated_at,
        base_branch: response
            .base
            .as_ref()
            .and_then(|value| value.branch_ref.clone()),
        head_branch: response
            .head
            .as_ref()
            .and_then(|value| value.branch_ref.clone()),
    }
}

pub(crate) fn metadata_from_commit_response(
    source: &GitHubDiffSource,
    response: GitHubCommitResponse,
) -> GitHubDiffMetadata {
    let title = response
        .commit
        .as_ref()
        .and_then(|commit| commit.message.as_deref())
        .and_then(|message| message.lines().next())
        .filter(|line| !line.trim().is_empty())
        .map(str::to_string)
        .or_else(|| {
            response
                .sha
                .as_deref()
                .map(short_sha)
                .map(|sha| format!("Commit {sha}"))
        })
        .or_else(|| Some(source.fallback_title()));
    let updated_at = response.commit.and_then(|commit| {
        commit
            .committer
            .and_then(|person| person.date)
            .or_else(|| commit.author.and_then(|person| person.date))
    });

    GitHubDiffMetadata {
        title,
        state: None,
        merged: None,
        merged_at: None,
        updated_at,
        base_branch: None,
        head_branch: None,
    }
}

pub(crate) fn metadata_from_compare_response(
    source: &GitHubDiffSource,
    response: GitHubCompareResponse,
) -> GitHubDiffMetadata {
    let updated_at = response
        .commits
        .last()
        .and_then(|commit| {
            commit.commit.as_ref().and_then(|details| {
                details
                    .committer
                    .as_ref()
                    .and_then(|person| person.date.clone())
                    .or_else(|| {
                        details
                            .author
                            .as_ref()
                            .and_then(|person| person.date.clone())
                    })
            })
        })
        .or_else(|| {
            response.base_commit.and_then(|commit| {
                commit.commit.and_then(|details| {
                    details
                        .committer
                        .and_then(|person| person.date)
                        .or_else(|| details.author.and_then(|person| person.date))
                })
            })
        });
    let status = response.status;
    let counts = match (response.ahead_by, response.behind_by) {
        (Some(ahead), Some(behind)) => Some(format!("{ahead} ahead, {behind} behind")),
        (Some(ahead), None) => Some(format!("{ahead} ahead")),
        (None, Some(behind)) => Some(format!("{behind} behind")),
        (None, None) => None,
    };
    let title = counts.map_or_else(
        || source.fallback_title(),
        |counts| format!("{} ({counts})", source.fallback_title()),
    );

    GitHubDiffMetadata {
        title: Some(title),
        state: status,
        merged: None,
        merged_at: None,
        updated_at,
        base_branch: match source {
            GitHubDiffSource::Compare { base, .. } => Some(base.clone()),
            GitHubDiffSource::PullRequest { .. }
            | GitHubDiffSource::Commit { .. }
            | GitHubDiffSource::GitWorktree { .. }
            | GitHubDiffSource::GitCommit { .. }
            | GitHubDiffSource::GitRange { .. } => None,
        },
        head_branch: match source {
            GitHubDiffSource::Compare { head, .. } => Some(head.clone()),
            GitHubDiffSource::PullRequest { .. }
            | GitHubDiffSource::Commit { .. }
            | GitHubDiffSource::GitWorktree { .. }
            | GitHubDiffSource::GitCommit { .. }
            | GitHubDiffSource::GitRange { .. } => None,
        },
    }
}
