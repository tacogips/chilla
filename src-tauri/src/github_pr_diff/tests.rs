use std::cell::RefCell;

#[test]
fn normalizes_diff_and_patch_urls_without_losing_slash_refs() {
    for target_path in [
        "pull/42",
        "commit/abc123",
        "compare/release/v1...feature/topic",
    ] {
        let canonical = format!("https://github.com/octocat/Hello-World/{target_path}");
        let expected = GitHubPrTarget::parse(&canonical).expect("canonical target");
        for suffix in ["diff", "patch"] {
            let raw = format!("{canonical}.{suffix}?ignored=true#diff");
            let target = GitHubPrTarget::parse(&raw).expect("transport target");
            assert_eq!(target, expected);
            assert_eq!(target.diff_url(), format!("{canonical}.diff"));
        }
    }
    let encoded =
        GitHubPrTarget::parse("https://github.com/octocat/Hello-World/compare/main...topic%2Ediff")
            .expect("encoded literal ref suffix");
    assert_eq!(
        encoded.source,
        GitHubDiffSource::Compare {
            base: "main".into(),
            head: "topic%2Ediff".into()
        }
    );
}

#[test]
fn shorthand_rejects_url_delimiters_and_invalid_repository_names() {
    for repository in [
        "github:",
        "github:owner",
        "github:/repo",
        "github:owner/",
        "github:owner/repo/extra",
        "github:owner/repo?query",
        "github:owner/repo#fragment",
        "github:owner/repo%2Fextra",
        "github:owner/repo\\extra",
        "github:owner/repo name",
        "github:owner/..",
        "github:owner/.",
        "github:-owner/repo",
        "github:owner-/repo",
        "github:ow--ner/repo",
        "github:ow_ner/repo",
        "github:owner@host/repo",
        "github:https://github.com/owner/repo",
        "github:owner/repo;command",
    ] {
        assert!(
            GitHubPrTarget::parse_shorthand(repository, "42").is_err(),
            "accepted {repository}"
        );
    }
    for number in [
        "",
        "0",
        "-1",
        "+1",
        " 1",
        "1 ",
        "1.0",
        "1e2",
        "１",
        "18446744073709551616",
    ] {
        assert!(
            GitHubPrTarget::parse_shorthand("github:octocat/Hello-World", number).is_err(),
            "accepted {number}"
        );
    }
    assert!(
        GitHubPrTarget::parse_shorthand(&format!("github:{}/repo", "a".repeat(40)), "1").is_err()
    );
    assert!(
        GitHubPrTarget::parse_shorthand(&format!("github:owner/{}", "a".repeat(101)), "1").is_err()
    );
    assert!(GitHubPrTarget::parse_shorthand("github:octo-cat/repo.name_1", "42").is_ok());
}

use super::{
    cache_file_path, normalize_pull_files, parse_unified_diff, read_cached_snapshot,
    write_cached_snapshot, GitHubBranchRef, GitHubDiffMetadata, GitHubDiffSource, GitHubPrApi,
    GitHubPrDiffService, GitHubPrTarget, GitHubPullFileResponse, GitHubPullResponse,
    PrDiffChangeType, PrDiffIdentity, PrDiffSnapshot, PrFileStatus, FILES_PAGE_SIZE,
};

#[test]
fn parses_github_pr_url_with_files_tab_query_and_fragment() {
    let target =
        GitHubPrTarget::parse("https://github.com/tacogips/rielflow/pull/44/files?foo=bar#diff")
            .expect("valid PR URL");

    assert_eq!(target.owner, "tacogips");
    assert_eq!(target.repo, "rielflow");
    assert_eq!(target.source, GitHubDiffSource::PullRequest { number: 44 });
    assert_eq!(target.url, "https://github.com/tacogips/rielflow/pull/44");
    assert!(target.use_cache);
}

#[test]
fn parses_github_pr_url_with_trailing_slash() {
    let target = GitHubPrTarget::parse("https://github.com/tacogips/rielflow/pull/44/")
        .expect("valid PR URL");

    assert_eq!(target.owner, "tacogips");
    assert_eq!(target.repo, "rielflow");
    assert_eq!(target.source, GitHubDiffSource::PullRequest { number: 44 });
    assert_eq!(target.url, "https://github.com/tacogips/rielflow/pull/44");
    assert!(target.use_cache);
}

#[test]
fn parses_github_commit_url_with_query_and_fragment() {
    let target = GitHubPrTarget::parse(
        "https://github.com/tacogips/chilla/commit/abcdef123456?diff=split#file",
    )
    .expect("valid commit URL");

    assert_eq!(target.owner, "tacogips");
    assert_eq!(target.repo, "chilla");
    assert_eq!(
        target.source,
        GitHubDiffSource::Commit {
            sha: "abcdef123456".to_string()
        }
    );
    assert_eq!(
        target.url,
        "https://github.com/tacogips/chilla/commit/abcdef123456"
    );
    assert!(target.use_cache);
}

#[test]
fn parses_github_compare_url_with_slash_refs() {
    let target = GitHubPrTarget::parse(
        "https://github.com/tacogips/chilla/compare/release/v1...feature/pr-diff",
    )
    .expect("valid compare URL");

    assert_eq!(target.owner, "tacogips");
    assert_eq!(target.repo, "chilla");
    assert_eq!(
        target.source,
        GitHubDiffSource::Compare {
            base: "release/v1".to_string(),
            head: "feature/pr-diff".to_string()
        }
    );
    assert_eq!(
        target.url,
        "https://github.com/tacogips/chilla/compare/release/v1...feature/pr-diff"
    );
    assert!(target.use_cache);
}

#[test]
fn rejects_unsupported_github_diff_url() {
    assert!(GitHubPrTarget::parse("https://github.com/tacogips/chilla").is_err());
    assert!(GitHubPrTarget::parse("https://github.com/tacogips/chilla/pull/0").is_err());
    assert!(GitHubPrTarget::parse("https://github.com/tacogips/chilla/pull/44/commits").is_err());
    assert!(GitHubPrTarget::parse("https://github.com/tacogips/chilla/commit/abc/extra").is_err());
    assert!(GitHubPrTarget::parse("https://github.com/tacogips/chilla/compare/main...").is_err());
    assert!(
        GitHubPrTarget::parse("https://github.com/tacogips/chilla/compare/main...a...b").is_err()
    );
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
        serde_json::from_str(include_str!("../../tests/fixtures/github-pr-files.json"))
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
        serde_json::from_str(include_str!("../../tests/fixtures/github-pr-metadata.json"))
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

    let cached =
        read_cached_snapshot(&target, Some("2026-06-02T00:00:00Z")).expect("cache should match");

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
        "GitHub could not find this diff source, or the repository is private and credentials are missing."
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
fn loads_commit_snapshot_from_mock_github_api() {
    let mut target =
        GitHubPrTarget::parse("https://github.com/tacogips/chilla/commit/abcdef1234567890")
            .expect("target");
    target.use_cache = false;
    let service = GitHubPrDiffService::with_api(MockGitHubPrApi::new(
        GitHubDiffMetadata {
            title: Some("Tighten diff rendering".to_string()),
            state: None,
            merged: None,
            merged_at: None,
            updated_at: Some("2026-06-02T04:00:00Z".to_string()),
            base_branch: None,
            head_branch: None,
        },
        vec![vec![mock_file(
            "src/app.rs",
            "modified",
            Some("@@ -1 +1 @@\n-old\n+new"),
            None,
        )]],
        Vec::new(),
    ));

    let snapshot = service.load(&target).expect("load snapshot");

    assert_eq!(
        snapshot.identity.source,
        GitHubDiffSource::Commit {
            sha: "abcdef1234567890".to_string()
        }
    );
    assert_eq!(snapshot.identity.title, "Tighten diff rendering");
    assert_eq!(
        snapshot.identity.updated_at.as_deref(),
        Some("2026-06-02T04:00:00Z")
    );
    assert_eq!(snapshot.files.len(), 1);
    assert_eq!(snapshot.files[0].path, "src/app.rs");
}

#[test]
fn loads_compare_snapshot_from_mock_github_api() {
    let mut target =
        GitHubPrTarget::parse("https://github.com/tacogips/chilla/compare/main...feature/pr-diff")
            .expect("target");
    target.use_cache = false;
    let service = GitHubPrDiffService::with_api(MockGitHubPrApi::new(
        GitHubDiffMetadata {
            title: Some("Compare main...feature/pr-diff".to_string()),
            state: Some("ahead".to_string()),
            merged: None,
            merged_at: None,
            updated_at: Some("2026-06-02T05:00:00Z".to_string()),
            base_branch: Some("main".to_string()),
            head_branch: Some("feature/pr-diff".to_string()),
        },
        vec![vec![mock_file(
            "README.md",
            "modified",
            Some("@@ -1 +1 @@\n-old\n+new"),
            None,
        )]],
        Vec::new(),
    ));

    let snapshot = service.load(&target).expect("load snapshot");

    assert_eq!(
        snapshot.identity.source,
        GitHubDiffSource::Compare {
            base: "main".to_string(),
            head: "feature/pr-diff".to_string()
        }
    );
    assert_eq!(snapshot.identity.state.as_deref(), Some("ahead"));
    assert_eq!(snapshot.identity.base_branch.as_deref(), Some("main"));
    assert_eq!(
        snapshot.identity.head_branch.as_deref(),
        Some("feature/pr-diff")
    );
    assert_eq!(snapshot.files[0].path, "README.md");
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
    write_cached_snapshot(&target, "2026-06-02T00:00:00Z", &cached_snapshot).expect("write cache");

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

#[test]
fn cache_paths_are_source_specific() {
    let pr =
        GitHubPrTarget::parse("https://github.com/tacogips/chilla/pull/12").expect("PR target");
    let commit =
        GitHubPrTarget::parse("https://github.com/tacogips/chilla/commit/12").expect("commit");
    let compare = GitHubPrTarget::parse("https://github.com/tacogips/chilla/compare/main...12")
        .expect("compare");

    assert_ne!(cache_file_path(&pr), cache_file_path(&commit));
    assert_ne!(cache_file_path(&pr), cache_file_path(&compare));
    assert_ne!(cache_file_path(&commit), cache_file_path(&compare));
}

#[test]
fn no_cache_bypasses_cache_reads_and_writes() {
    let mut target =
        GitHubPrTarget::parse("https://github.com/tacogips/rielflow/pull/47").expect("target");
    let cache_path = cache_file_path(&target);
    let _ = std::fs::remove_file(&cache_path);
    let cached_snapshot = test_snapshot(&target, "2026-06-02T00:00:00Z");
    write_cached_snapshot(&target, "2026-06-02T00:00:00Z", &cached_snapshot).expect("write cache");
    target.use_cache = false;

    let service = GitHubPrDiffService::with_api(MockGitHubPrApi::new(
        GitHubDiffMetadata {
            updated_at: Some("2026-06-02T00:00:00Z".to_string()),
            ..mock_metadata("2026-06-02T00:00:00Z")
        },
        vec![vec![mock_file(
            "src/fresh.rs",
            "modified",
            Some("@@ -1 +1 @@\n-old\n+new"),
            None,
        )]],
        Vec::new(),
    ));

    let snapshot = service.load(&target).expect("load fresh snapshot");

    assert_eq!(snapshot.files.len(), 1);
    assert_eq!(snapshot.files[0].path, "src/fresh.rs");
    assert_eq!(service.api.requested_pages.borrow().as_slice(), [1]);

    let cached = read_cached_snapshot(&target, Some("2026-06-02T00:00:00Z"))
        .expect("old cache remains present");
    assert!(cached.files.is_empty());

    let _ = std::fs::remove_file(cache_path);
}

fn test_snapshot(target: &GitHubPrTarget, updated_at: &str) -> PrDiffSnapshot {
    PrDiffSnapshot {
        identity: PrDiffIdentity {
            owner: target.owner.clone(),
            repo: target.repo.clone(),
            source: target.source.clone(),
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

fn mock_metadata(updated_at: &str) -> GitHubDiffMetadata {
    super::metadata_from_pull_response(GitHubPullResponse {
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
    })
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
    metadata: GitHubDiffMetadata,
    pages: Vec<Vec<GitHubPullFileResponse>>,
    full_text_responses: MockFullTextResponses,
    requested_pages: RefCell<Vec<u16>>,
    requested_raw_urls: RefCell<Vec<String>>,
}

impl MockGitHubPrApi {
    fn new(
        metadata: GitHubDiffMetadata,
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
    ) -> crate::error::AppResult<GitHubDiffMetadata> {
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
