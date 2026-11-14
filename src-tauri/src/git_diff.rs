use std::{
    fs,
    path::{Component, Path, PathBuf},
    process::{Command, ExitStatus},
};

use serde::{Deserialize, Serialize};

use crate::{
    error::{AppError, AppResult},
    github_pr_diff::{
        parse_unified_diff, GitHubDiffSource, PrDiffFile, PrDiffFileText, PrDiffIdentity,
        PrDiffSnapshot, PrFileStatus,
    },
};

const MAX_LOCAL_FULL_FILE_BYTES: usize = 512 * 1024;
const MAX_UNTRACKED_DIFF_FILES: usize = 300;

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
pub struct GitDiffTarget {
    pub repo_path: String,
    pub source: GitDiffSource,
}

#[derive(Debug, Clone, PartialEq, Eq, Deserialize, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum GitDiffSource {
    Worktree,
    Commit {
        commit: String,
    },
    Range {
        base: String,
        head: String,
        #[serde(default)]
        merge_base: bool,
    },
}

#[derive(Clone, Default)]
pub struct GitDiffService;

impl GitDiffTarget {
    pub fn worktree_from_path(path: &Path) -> AppResult<Self> {
        let repo_path = resolve_git_repository_root(path)?;

        Ok(Self {
            repo_path: display_path(&repo_path),
            source: GitDiffSource::Worktree,
        })
    }

    pub fn from_repo_and_spec(path: &Path, spec: &str) -> AppResult<Self> {
        let repo_path = resolve_git_repository_root(path)?;
        let trimmed = spec.trim();
        if trimmed.is_empty() {
            return Err(AppError::cli_usage("Git diff commit spec is empty", 2));
        }

        let source = parse_git_diff_source(trimmed)?;
        Ok(Self {
            repo_path: display_path(&repo_path),
            source,
        })
    }
}

impl GitDiffService {
    pub fn new() -> Self {
        Self
    }

    pub fn detect_repository(&self, path: &Path) -> AppResult<Option<GitDiffTarget>> {
        match GitDiffTarget::worktree_from_path(path) {
            Ok(target) => Ok(Some(target)),
            Err(AppError::State(_)) => Ok(None),
            Err(AppError::Io { .. }) | Err(AppError::NotADirectory(_)) => Ok(None),
            Err(error) => Err(error),
        }
    }

    pub fn load(&self, target: &GitDiffTarget) -> AppResult<PrDiffSnapshot> {
        let repo_path = resolve_git_repository_root(Path::new(&target.repo_path))?;
        let (diff_text, warnings) = match &target.source {
            GitDiffSource::Worktree => self.worktree_diff(&repo_path)?,
            GitDiffSource::Commit { commit } => {
                validate_git_revision(commit)?;
                let diff_text = run_git_text(
                    &repo_path,
                    &[
                        "show",
                        "--format=",
                        "--find-renames",
                        "--binary",
                        "--no-ext-diff",
                        commit,
                    ],
                    true,
                )?;
                (diff_text, Vec::new())
            }
            GitDiffSource::Range {
                base,
                head,
                merge_base,
            } => {
                validate_git_revision(base)?;
                validate_git_revision(head)?;
                let range = if *merge_base {
                    format!("{base}...{head}")
                } else {
                    format!("{base}..{head}")
                };
                let diff_text = run_git_text(
                    &repo_path,
                    &[
                        "diff",
                        "--find-renames",
                        "--binary",
                        "--no-ext-diff",
                        &range,
                    ],
                    true,
                )?;
                (diff_text, Vec::new())
            }
        };

        let mut files = parse_unified_diff(&diff_text);
        hydrate_full_file_texts(&repo_path, &target.source, &mut files);
        files.sort_by(|left, right| left.path.cmp(&right.path));

        let additions = files.iter().map(|file| file.additions).sum();
        let deletions = files.iter().map(|file| file.deletions).sum();
        let repo_name = repo_path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("repository")
            .to_string();

        Ok(PrDiffSnapshot {
            identity: PrDiffIdentity {
                owner: "local".to_string(),
                repo: repo_name,
                source: snapshot_source(&repo_path, &target.source),
                url: display_path(&repo_path),
                title: title_for_source(&repo_path, &target.source),
                state: Some(state_for_source(&target.source).to_string()),
                merged: false,
                merged_at: None,
                updated_at: None,
                base_branch: base_ref_for_source(&target.source),
                head_branch: head_ref_for_source(&target.source),
            },
            files,
            additions,
            deletions,
            warnings,
        })
    }

    fn worktree_diff(&self, repo_path: &Path) -> AppResult<(String, Vec<String>)> {
        let mut diff = run_git_text(
            repo_path,
            &[
                "diff",
                "--find-renames",
                "--binary",
                "--no-ext-diff",
                "HEAD",
            ],
            true,
        )?;
        let mut warnings = Vec::new();
        let untracked_paths = untracked_paths(repo_path)?;
        let untracked_count = untracked_paths.len();

        if untracked_count > MAX_UNTRACKED_DIFF_FILES {
            warnings.push(format!(
                "Only the first {MAX_UNTRACKED_DIFF_FILES} untracked files are shown."
            ));
        }

        for path in untracked_paths.into_iter().take(MAX_UNTRACKED_DIFF_FILES) {
            let untracked_diff = run_git_text(
                repo_path,
                &["diff", "--no-index", "--binary", "--", "/dev/null", &path],
                true,
            )?;
            if !diff.is_empty() && !untracked_diff.is_empty() {
                diff.push('\n');
            }
            diff.push_str(&untracked_diff);
        }

        Ok((diff, warnings))
    }
}

fn parse_git_diff_source(spec: &str) -> AppResult<GitDiffSource> {
    if let Some((base, head)) = spec.split_once("...") {
        if base.is_empty() || head.is_empty() || head.contains("...") {
            return Err(AppError::cli_usage(
                "Git diff range must use <base>...<head>",
                2,
            ));
        }

        validate_git_revision(base)?;
        validate_git_revision(head)?;
        return Ok(GitDiffSource::Range {
            base: base.to_string(),
            head: head.to_string(),
            merge_base: true,
        });
    }

    if let Some((base, head)) = spec.split_once("..") {
        if base.is_empty() || head.is_empty() || head.contains("..") {
            return Err(AppError::cli_usage(
                "Git diff range must use <base>..<head>",
                2,
            ));
        }

        validate_git_revision(base)?;
        validate_git_revision(head)?;
        return Ok(GitDiffSource::Range {
            base: base.to_string(),
            head: head.to_string(),
            merge_base: false,
        });
    }

    validate_git_revision(spec)?;
    Ok(GitDiffSource::Commit {
        commit: spec.to_string(),
    })
}

fn validate_git_revision(value: &str) -> AppResult<()> {
    if value.trim().is_empty() || value.starts_with('-') || value.contains('\0') {
        return Err(AppError::cli_usage("invalid Git revision", 2));
    }

    Ok(())
}

fn resolve_git_repository_root(path: &Path) -> AppResult<PathBuf> {
    let canonical_path =
        fs::canonicalize(path).map_err(|source| AppError::io("canonicalize", path, source))?;
    let metadata = fs::metadata(&canonical_path)
        .map_err(|source| AppError::io("read metadata for", &canonical_path, source))?;
    if !metadata.is_dir() {
        return Err(AppError::NotADirectory(display_path(&canonical_path)));
    }

    let root = run_git_text(&canonical_path, &["rev-parse", "--show-toplevel"], false)?
        .trim()
        .to_string();
    if root.is_empty() {
        return Err(AppError::State("not inside a Git repository".to_string()));
    }

    fs::canonicalize(root)
        .map_err(|source| AppError::io("canonicalize Git repository", path, source))
}

fn run_git_text(repo_path: &Path, args: &[&str], allow_diff_exit: bool) -> AppResult<String> {
    let output = run_git(repo_path, args)?;
    if !git_status_is_success(output.status, allow_diff_exit) {
        return Err(AppError::State(format!(
            "git {} failed: {}",
            args.first().copied().unwrap_or("command"),
            String::from_utf8_lossy(&output.stderr).trim()
        )));
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

fn run_git_bytes(repo_path: &Path, args: &[&str], allow_diff_exit: bool) -> AppResult<Vec<u8>> {
    let output = run_git(repo_path, args)?;
    if !git_status_is_success(output.status, allow_diff_exit) {
        return Err(AppError::State(format!(
            "git {} failed: {}",
            args.first().copied().unwrap_or("command"),
            String::from_utf8_lossy(&output.stderr).trim()
        )));
    }

    Ok(output.stdout)
}

fn run_git(repo_path: &Path, args: &[&str]) -> AppResult<std::process::Output> {
    Command::new("git")
        .arg("-C")
        .arg(repo_path)
        .args(args)
        .output()
        .map_err(|source| AppError::io("run git", repo_path, source))
}

fn git_status_is_success(status: ExitStatus, allow_diff_exit: bool) -> bool {
    status.success() || (allow_diff_exit && status.code() == Some(1))
}

fn untracked_paths(repo_path: &Path) -> AppResult<Vec<String>> {
    let output = run_git_bytes(
        repo_path,
        &["ls-files", "--others", "--exclude-standard", "-z"],
        false,
    )?;

    Ok(output
        .split(|byte| *byte == 0)
        .filter(|value| !value.is_empty())
        .map(|value| String::from_utf8_lossy(value).to_string())
        .collect())
}

fn hydrate_full_file_texts(repo_path: &Path, source: &GitDiffSource, files: &mut [PrDiffFile]) {
    for file in files {
        if file.status == PrFileStatus::Deleted || file.is_binary {
            continue;
        }

        let loaded = match source {
            GitDiffSource::Worktree => load_worktree_file_text(repo_path, &file.path),
            GitDiffSource::Commit { commit } => load_git_blob_text(repo_path, commit, &file.path),
            GitDiffSource::Range { head, .. } => load_git_blob_text(repo_path, head, &file.path),
        };

        if let Ok(text) = loaded {
            file.full_text = Some(text.full_text);
            file.full_text_truncated = text.full_text_truncated;
        }
    }
}

fn load_worktree_file_text(repo_path: &Path, relative_path: &str) -> AppResult<PrDiffFileText> {
    let full_path = repo_relative_path(repo_path, relative_path)?;
    let bytes = fs::read(full_path)
        .map_err(|source| AppError::io("read Git worktree file", repo_path, source))?;
    Ok(bytes_to_file_text(&bytes))
}

fn load_git_blob_text(
    repo_path: &Path,
    revision: &str,
    relative_path: &str,
) -> AppResult<PrDiffFileText> {
    validate_git_revision(revision)?;
    validate_relative_git_path(relative_path)?;
    let spec = format!("{revision}:{relative_path}");
    let bytes = run_git_bytes(repo_path, &["show", &spec], false)?;
    Ok(bytes_to_file_text(&bytes))
}

fn bytes_to_file_text(bytes: &[u8]) -> PrDiffFileText {
    let truncated = bytes.len() > MAX_LOCAL_FULL_FILE_BYTES;
    let visible = if truncated {
        &bytes[..MAX_LOCAL_FULL_FILE_BYTES]
    } else {
        bytes
    };

    PrDiffFileText {
        full_text: String::from_utf8_lossy(visible).to_string(),
        full_text_truncated: truncated,
    }
}

fn repo_relative_path(repo_path: &Path, relative_path: &str) -> AppResult<PathBuf> {
    validate_relative_git_path(relative_path)?;
    Ok(repo_path.join(relative_path))
}

fn validate_relative_git_path(relative_path: &str) -> AppResult<()> {
    let path = Path::new(relative_path);
    if relative_path.is_empty()
        || relative_path.contains('\0')
        || path.is_absolute()
        || path
            .components()
            .any(|component| matches!(component, Component::ParentDir | Component::RootDir))
    {
        return Err(AppError::State(format!(
            "Git diff file path escapes repository: {relative_path}"
        )));
    }

    Ok(())
}

fn snapshot_source(repo_path: &Path, source: &GitDiffSource) -> GitHubDiffSource {
    let repo_path = display_path(repo_path);
    match source {
        GitDiffSource::Worktree => GitHubDiffSource::GitWorktree { repo_path },
        GitDiffSource::Commit { commit } => GitHubDiffSource::GitCommit {
            repo_path,
            commit: commit.clone(),
        },
        GitDiffSource::Range {
            base,
            head,
            merge_base,
        } => GitHubDiffSource::GitRange {
            repo_path,
            base: base.clone(),
            head: head.clone(),
            merge_base: *merge_base,
        },
    }
}

fn title_for_source(repo_path: &Path, source: &GitDiffSource) -> String {
    match source {
        GitDiffSource::Worktree => format!("Uncommitted changes in {}", display_path(repo_path)),
        GitDiffSource::Commit { commit } => {
            run_git_text(repo_path, &["log", "-1", "--format=%s", commit], false)
                .map(|title| title.trim().to_string())
                .ok()
                .filter(|title| !title.is_empty())
                .unwrap_or_else(|| format!("Commit {commit}"))
        }
        GitDiffSource::Range {
            base,
            head,
            merge_base,
        } => {
            let separator = if *merge_base { "..." } else { ".." };
            format!("Git diff {base}{separator}{head}")
        }
    }
}

fn state_for_source(source: &GitDiffSource) -> &'static str {
    match source {
        GitDiffSource::Worktree => "uncommitted",
        GitDiffSource::Commit { .. } => "commit",
        GitDiffSource::Range { .. } => "range",
    }
}

fn base_ref_for_source(source: &GitDiffSource) -> Option<String> {
    match source {
        GitDiffSource::Range { base, .. } => Some(base.clone()),
        GitDiffSource::Worktree | GitDiffSource::Commit { .. } => None,
    }
}

fn head_ref_for_source(source: &GitDiffSource) -> Option<String> {
    match source {
        GitDiffSource::Commit { commit } => Some(commit.clone()),
        GitDiffSource::Range { head, .. } => Some(head.clone()),
        GitDiffSource::Worktree => None,
    }
}

fn display_path(path: &Path) -> String {
    path.display().to_string()
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::{Path, PathBuf},
        sync::atomic::{AtomicU64, Ordering},
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{GitDiffService, GitDiffSource, GitDiffTarget};
    use crate::github_pr_diff::PrFileStatus;

    struct TestRepo {
        path: PathBuf,
    }

    static TEST_REPO_COUNTER: AtomicU64 = AtomicU64::new(0);

    impl TestRepo {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            let counter = TEST_REPO_COUNTER.fetch_add(1, Ordering::Relaxed);
            let path = std::env::temp_dir().join(format!(
                "chilla-git-diff-tests-{}-{unique}-{counter}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("create test repository");
            run(&path, &["init"]);
            run(&path, &["config", "user.email", "test@example.invalid"]);
            run(&path, &["config", "user.name", "Test User"]);
            Self { path }
        }

        fn path(&self) -> &Path {
            &self.path
        }

        fn write(&self, relative_path: &str, text: &str) {
            let path = self.path.join(relative_path);
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent).expect("create parent");
            }
            fs::write(path, text).expect("write file");
        }

        fn commit_all(&self, message: &str) -> String {
            run(&self.path, &["add", "."]);
            run(&self.path, &["commit", "-m", message]);
            output(&self.path, &["rev-parse", "HEAD"])
                .trim()
                .to_string()
        }
    }

    impl Drop for TestRepo {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn loads_worktree_diff_with_untracked_files() {
        let repo = TestRepo::new();
        repo.write("README.md", "old\n");
        repo.commit_all("initial");
        repo.write("README.md", "new\n");
        repo.write("src/new.rs", "fn main() {}\n");

        let target = GitDiffTarget::worktree_from_path(repo.path()).expect("target");
        let snapshot = GitDiffService::new().load(&target).expect("snapshot");

        assert_eq!(snapshot.identity.state.as_deref(), Some("uncommitted"));
        assert!(snapshot.files.iter().any(|file| file.path == "README.md"));
        assert!(snapshot.files.iter().any(|file| file.path == "src/new.rs"));
        assert!(snapshot.additions >= 2);
    }

    #[test]
    fn loads_single_commit_diff_against_parent() {
        let repo = TestRepo::new();
        repo.write("README.md", "old\n");
        repo.commit_all("initial");
        repo.write("README.md", "new\n");
        let commit = repo.commit_all("change readme");

        let target = GitDiffTarget::from_repo_and_spec(repo.path(), &commit).expect("target");
        let snapshot = GitDiffService::new().load(&target).expect("snapshot");

        assert_eq!(snapshot.identity.state.as_deref(), Some("commit"));
        assert_eq!(snapshot.identity.title, "change readme");
        assert_eq!(snapshot.files.len(), 1);
        assert_eq!(snapshot.files[0].path, "README.md");
        assert_eq!(snapshot.files[0].status, PrFileStatus::Modified);
        assert_eq!(snapshot.files[0].full_text.as_deref(), Some("new\n"));
    }

    #[test]
    fn parses_range_target() {
        let repo = TestRepo::new();
        let target =
            GitDiffTarget::from_repo_and_spec(repo.path(), "main..feature").expect("range target");

        assert_eq!(
            target.source,
            GitDiffSource::Range {
                base: "main".to_string(),
                head: "feature".to_string(),
                merge_base: false,
            }
        );
    }

    fn run(repo: &Path, args: &[&str]) {
        let status = std::process::Command::new("git")
            .arg("-C")
            .arg(repo)
            .args(args)
            .status()
            .expect("run git");
        assert!(status.success(), "git command failed: {args:?}");
    }

    fn output(repo: &Path, args: &[&str]) -> String {
        let output = std::process::Command::new("git")
            .arg("-C")
            .arg(repo)
            .args(args)
            .output()
            .expect("run git");
        assert!(output.status.success(), "git command failed: {args:?}");
        String::from_utf8_lossy(&output.stdout).to_string()
    }
}
