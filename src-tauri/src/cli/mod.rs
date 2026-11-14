use std::{
    collections::HashSet,
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
    time::Instant,
};

use crate::{
    error::{AppError, AppResult},
    git_diff::GitDiffTarget,
    github_pr_diff::GitHubPrTarget,
    verbose_log::{self, VerboseIoOutcome},
    viewer::service::resolve_startup_target,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StartupTarget {
    CurrentDirectory(PathBuf),
    Directory(PathBuf),
    File(PathBuf),
    FileSet(Vec<PathBuf>),
    GitHubPr(GitHubPrTarget),
    GitDiff(GitDiffTarget),
}

#[derive(Debug)]
pub enum CliParseOutcome {
    Run(StartupTarget),
    Help(String),
    Version(String),
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct CliOptions {
    pub verbose: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct NormalizedCli {
    pub options: CliOptions,
    pub arguments: Vec<OsString>,
}

pub enum CliNormalizationOutcome {
    Information(CliParseOutcome),
    Parse(NormalizedCli),
}

pub fn normalize_cli<I, T>(args: I) -> CliNormalizationOutcome
where
    I: IntoIterator<Item = T>,
    T: Into<OsString>,
{
    let args = args.into_iter().map(Into::into).collect::<Vec<_>>();

    let binary_name = args
        .first()
        .and_then(|argument| argument.clone().into_string().ok())
        .unwrap_or_else(|| "chilla".to_string());

    let mut verbose = false;
    let mut normalized = Vec::with_capacity(args.len());
    for (index, argument) in args.into_iter().enumerate() {
        if index > 0 && argument == "--verbose" {
            verbose = true;
        } else {
            normalized.push(argument);
        }
    }

    let user_arguments = normalized.get(1..).unwrap_or_default();
    if let [argument] = user_arguments {
        if argument == "--help" || argument == "-h" {
            return CliNormalizationOutcome::Information(CliParseOutcome::Help(help_text(
                &binary_name,
            )));
        }
        if argument == "--version" || argument == "-V" {
            return CliNormalizationOutcome::Information(CliParseOutcome::Version(version_text()));
        }
    }

    CliNormalizationOutcome::Parse(NormalizedCli {
        options: CliOptions { verbose },
        arguments: normalized,
    })
}

pub fn parse_cli<I, T>(args: I) -> AppResult<CliParseOutcome>
where
    I: IntoIterator<Item = T>,
    T: Into<OsString>,
{
    match normalize_cli(args) {
        CliNormalizationOutcome::Information(outcome) => Ok(outcome),
        CliNormalizationOutcome::Parse(input) => parse_normalized_cli(input),
    }
}

pub fn parse_normalized_cli(input: NormalizedCli) -> AppResult<CliParseOutcome> {
    let mut args = input.arguments;
    let binary_name = args
        .first()
        .and_then(|argument| argument.clone().into_string().ok())
        .unwrap_or_else(|| "chilla".to_string());

    if args.is_empty() {
        let current_directory = std::env::current_dir()
            .map_err(|source| AppError::io("resolve current directory", Path::new("."), source))?;
        return Ok(CliParseOutcome::Run(StartupTarget::CurrentDirectory(
            current_directory,
        )));
    }

    args.remove(0); // discard binary path

    if args.is_empty() {
        let current_directory = std::env::current_dir()
            .map_err(|source| AppError::io("resolve current directory", Path::new("."), source))?;
        return Ok(CliParseOutcome::Run(StartupTarget::CurrentDirectory(
            current_directory,
        )));
    }

    if args.len() == 1 {
        let argument = args.into_iter().next().expect("validated length");

        let argument = argument
            .into_string()
            .map_err(|_| AppError::cli_usage("document path must be valid UTF-8".to_string(), 2))?;

        return match argument.as_str() {
            "--help" | "-h" => Ok(CliParseOutcome::Help(help_text(&binary_name))),
            "--version" | "-V" => Ok(CliParseOutcome::Version(version_text())),
            flag if is_no_github_diff_cache_flag(flag) => Err(AppError::cli_usage(
                format!(
                    "{flag} requires a GitHub diff URL.\n\n{}",
                    help_text(&binary_name)
                ),
                2,
            )),
            flag if flag.starts_with('-') => Err(AppError::cli_usage(
                format!("unsupported flag `{flag}`\n\n{}", help_text(&binary_name)),
                2,
            )),
            target if target.starts_with("https://") => Ok(CliParseOutcome::Run(
                StartupTarget::GitHubPr(GitHubPrTarget::parse(target)?),
            )),
            file_name => Ok(CliParseOutcome::Run(validate_cli_path(Path::new(
                file_name,
            ))?)),
        };
    }

    if args.len() == 2 {
        let mut values = args
            .iter()
            .cloned()
            .map(|argument| {
                argument.into_string().map_err(|_| {
                    AppError::cli_usage("path arguments must be valid UTF-8".to_string(), 2)
                })
            })
            .collect::<AppResult<Vec<_>>>()?;

        if values
            .iter()
            .any(|value| is_no_github_diff_cache_flag(value))
        {
            values.retain(|value| !is_no_github_diff_cache_flag(value));
            let Some(target) = values.into_iter().next() else {
                return Err(AppError::cli_usage(
                    "--no-github-diff-cache requires a GitHub diff URL".to_string(),
                    2,
                ));
            };

            if !target.starts_with("https://") {
                return Err(AppError::cli_usage(
                    "--no-github-diff-cache can only be used with a GitHub diff URL".to_string(),
                    2,
                ));
            }

            let mut target = GitHubPrTarget::parse(&target)?;
            target.use_cache = false;
            return Ok(CliParseOutcome::Run(StartupTarget::GitHubPr(target)));
        }

        if let Some(target) = parse_git_diff_startup_pair(&values)? {
            return Ok(CliParseOutcome::Run(StartupTarget::GitDiff(target)));
        }
    }

    let mut paths = Vec::<PathBuf>::new();

    for argument in args {
        let raw = argument.into_string().map_err(|_| {
            AppError::cli_usage("path arguments must be valid UTF-8".to_string(), 2)
        })?;

        if raw.starts_with('-') {
            return Err(AppError::cli_usage(
                format!(
                    "multi-path startup does not support flags (`{raw}`).\n\n{}",
                    help_text(&binary_name),
                ),
                2,
            ));
        }

        if raw.starts_with("https://") {
            return Err(AppError::cli_usage(
                "GitHub diff URLs cannot be combined with other startup paths".to_string(),
                2,
            ));
        }

        paths.push(PathBuf::from(raw));
    }

    Ok(CliParseOutcome::Run(resolve_explicit_file_startup(&paths)?))
}

fn validate_cli_path(path: &Path) -> AppResult<StartupTarget> {
    resolve_startup_target(path)
}

fn parse_git_diff_startup_pair(values: &[String]) -> AppResult<Option<GitDiffTarget>> {
    let [repo_path, spec] = values else {
        return Ok(None);
    };

    if spec.starts_with('-') || spec.starts_with("https://") {
        return Ok(None);
    }

    let repo_candidate = Path::new(repo_path);
    if !repo_candidate.exists() {
        return Ok(None);
    }

    let spec_candidate = Path::new(spec);
    if spec_candidate.exists() {
        return Ok(None);
    }

    match GitDiffTarget::from_repo_and_spec(repo_candidate, spec) {
        Ok(target) => Ok(Some(target)),
        Err(AppError::State(_)) | Err(AppError::NotADirectory(_)) | Err(AppError::Io { .. }) => {
            Ok(None)
        }
        Err(error) => Err(error),
    }
}

fn resolve_explicit_file_startup(paths: &[PathBuf]) -> AppResult<StartupTarget> {
    let mut seen_canonical_paths = HashSet::<String>::new();
    let mut ordered_unique_paths = Vec::new();

    for path in paths {
        let canonical_diagnostic =
            verbose_log::is_enabled().then(|| (absolute_diagnostic_path(path), Instant::now()));
        let canonical_result = fs::canonicalize(path);
        if let Some((diagnostic_path, started_at)) = canonical_diagnostic {
            match &canonical_result {
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
        }
        let canonical_path =
            canonical_result.map_err(|source| AppError::io("canonicalize", path, source))?;

        let metadata_started_at = verbose_log::is_enabled().then(Instant::now);
        let metadata_result = fs::metadata(&canonical_path);
        if let Some(started_at) = metadata_started_at {
            match &metadata_result {
                Ok(metadata) => verbose_log::record_io(
                    "metadata",
                    &canonical_path,
                    started_at,
                    VerboseIoOutcome::Success {
                        size_bytes: Some(metadata.len()),
                    },
                ),
                Err(error) => verbose_log::record_io(
                    "metadata",
                    &canonical_path,
                    started_at,
                    VerboseIoOutcome::Failure { error },
                ),
            }
        }
        let metadata = metadata_result
            .map_err(|source| AppError::io("read metadata for", &canonical_path, source))?;

        if metadata.is_dir() {
            return Err(AppError::cli_usage(
                "multi-path startup only accepts regular files.\nDirectories must be opened with exactly one positional path argument.".to_string(),
                2,
            ));
        }

        if !metadata.is_file() {
            return Err(AppError::NotAFile(canonical_path.display().to_string()));
        }

        let canonical_key = canonical_path.display().to_string();

        if seen_canonical_paths.insert(canonical_key) {
            ordered_unique_paths.push(canonical_path);
        }
    }

    match ordered_unique_paths.len().cmp(&1) {
        std::cmp::Ordering::Less => Err(AppError::cli_usage(
            "multi-path startup requires at least one readable file.".to_string(),
            2,
        )),
        std::cmp::Ordering::Equal => {
            Ok(StartupTarget::File(ordered_unique_paths.pop().ok_or_else(
                || AppError::State("explicit startup path missing".to_string()),
            )?))
        }
        std::cmp::Ordering::Greater => Ok(StartupTarget::FileSet(ordered_unique_paths)),
    }
}

fn absolute_diagnostic_path(path: &Path) -> PathBuf {
    if path.is_absolute() {
        return path.to_path_buf();
    }

    std::env::current_dir()
        .map(|current_directory| current_directory.join(path))
        .unwrap_or_else(|_| path.to_path_buf())
}

fn is_no_github_diff_cache_flag(value: &str) -> bool {
    value == "--no-github-diff-cache" || value == "--no-pr-diff-cache"
}

fn help_text(binary_name: &str) -> String {
    format!(
        "Usage:\n  {binary_name} [--verbose] [path ...]\n  {binary_name} [--verbose] <github-diff-url>\n  {binary_name} [--verbose] --no-github-diff-cache <github-diff-url>\n  {binary_name} [--verbose] --no-pr-diff-cache <github-diff-url>\n  {binary_name} [--verbose] <git-dir> <commit-or-range>\n  {binary_name} --help\n  {binary_name} --version\n\nIf no paths are provided, chilla opens the current working directory in file view mode.\nIf a GitHub pull request, commit, or compare URL is provided, chilla opens that GitHub diff in read-only mode.\nIf a Git directory plus commit or range is provided, chilla opens that local Git diff in read-only mode.\nGitHub diffs are cached under the system temp directory and refreshed when GitHub reports a newer updated marker.\n--no-pr-diff-cache remains supported as a compatibility alias for --no-github-diff-cache.\nIf two or more file paths are provided, chilla opens file view mode with the left pane limited to those files.\n\nOptions:\n  --verbose  Write startup and file-I/O diagnostics to {} and mirror them to an attached terminal.\n  --help     Show this help text.\n  --version  Show the application version.",
        verbose_log::VERBOSE_LOG_PATH_PATTERN,
    )
}

fn version_text() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use std::{
        ffi::OsString,
        fs,
        path::{Path, PathBuf},
        sync::atomic::{AtomicU64, Ordering},
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{
        normalize_cli, parse_cli, parse_normalized_cli, CliNormalizationOutcome, CliParseOutcome,
        StartupTarget,
    };
    use crate::{
        git_diff::GitDiffSource as LocalGitDiffSource, github_pr_diff::GitHubDiffSource,
        verbose_log,
    };

    struct TestDir {
        path: PathBuf,
    }

    static TEST_DIR_COUNTER: AtomicU64 = AtomicU64::new(0);

    impl TestDir {
        fn new() -> Self {
            let (unique, counter) = unique_test_directory_parts();
            let path = std::env::temp_dir().join(format!(
                "chilla-cli-tests-{}-{unique}-{counter}",
                std::process::id()
            ));
            fs::create_dir_all(&path).expect("create temp test directory");
            Self { path }
        }

        fn new_relative() -> (Self, PathBuf) {
            let (unique, counter) = unique_test_directory_parts();
            let relative_path = PathBuf::from(format!(
                ".chilla-cli-tests-{}-{unique}-{counter}",
                std::process::id()
            ));
            let path = std::env::current_dir()
                .expect("current directory")
                .join(&relative_path);
            fs::create_dir_all(&path).expect("create relative test directory");
            (Self { path }, relative_path)
        }

        fn path(&self) -> &Path {
            &self.path
        }
    }

    fn unique_test_directory_parts() -> (u128, u64) {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let counter = TEST_DIR_COUNTER.fetch_add(1, Ordering::Relaxed);
        (unique, counter)
    }

    impl Drop for TestDir {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.path);
        }
    }

    #[test]
    fn parses_bare_startup_as_current_directory() {
        let current_directory = std::env::current_dir().expect("current directory");

        let outcome = parse_cli(["chilla"]).expect("parse bare startup");

        match outcome {
            CliParseOutcome::Run(StartupTarget::CurrentDirectory(path)) => {
                assert_eq!(path, current_directory);
            }
            _ => panic!("unexpected parse outcome"),
        }
    }

    #[test]
    fn verbose_normalization_is_idempotent_and_precedes_path_counting() {
        let outcome = normalize_cli(["chilla", "--verbose", "first.md", "--verbose", "second.md"]);

        let CliNormalizationOutcome::Parse(input) = outcome else {
            panic!("expected parse input");
        };
        assert!(input.options.verbose);
        assert_eq!(
            input.arguments,
            ["chilla", "first.md", "second.md"].map(OsString::from)
        );
    }

    #[test]
    fn verbose_help_is_information_only_and_documents_log_path() {
        let outcome = normalize_cli(["chilla", "--verbose", "--help"]);

        let CliNormalizationOutcome::Information(CliParseOutcome::Help(help)) = outcome else {
            panic!("expected help");
        };
        assert!(help.contains("--verbose"));
        assert!(help.contains("~/Library/Logs/chilla/chilla-verbose-<pid>[-<collision>].log"));
    }

    #[test]
    fn verbose_parse_failure_retains_enabled_option_and_exit_code() {
        let outcome = normalize_cli(["chilla", "--verbose", "--unknown"]);
        let CliNormalizationOutcome::Parse(input) = outcome else {
            panic!("expected parse input");
        };

        assert!(input.options.verbose);
        let error = parse_normalized_cli(input).expect_err("unsupported flag");
        assert_eq!(error.exit_code(), 2);
        assert!(error.to_string().contains("unsupported flag `--unknown`"));
    }

    #[test]
    fn verbose_composes_with_bare_startup() {
        let current_directory = std::env::current_dir().expect("current directory");
        let outcome = parse_cli(["chilla", "--verbose"]).expect("parse verbose bare startup");

        match outcome {
            CliParseOutcome::Run(StartupTarget::CurrentDirectory(path)) => {
                assert_eq!(path, current_directory);
            }
            _ => panic!("unexpected parse outcome"),
        }
    }

    #[test]
    fn parses_directory_startup_targets() {
        let test_dir = TestDir::new();

        let outcome = parse_cli(["chilla", test_dir.path().to_str().expect("utf-8 path")])
            .expect("parse directory");

        match outcome {
            CliParseOutcome::Run(StartupTarget::Directory(path)) => {
                assert_eq!(
                    path,
                    test_dir.path().canonicalize().expect("canonical path")
                );
            }
            _ => panic!("unexpected parse outcome"),
        }
    }

    #[test]
    fn verbose_composes_with_directory_startup() {
        let test_dir = TestDir::new();
        let outcome = parse_cli([
            "chilla",
            "--verbose",
            test_dir.path().to_str().expect("utf-8 path"),
        ])
        .expect("parse verbose directory");

        assert!(matches!(
            outcome,
            CliParseOutcome::Run(StartupTarget::Directory(_))
        ));
    }

    #[test]
    fn parses_file_startup_targets() {
        let test_dir = TestDir::new();
        let file_path = test_dir.path().join("notes.txt");
        fs::write(&file_path, "hello").expect("write file");

        let outcome =
            parse_cli(["chilla", file_path.to_str().expect("utf-8 path")]).expect("parse file");

        match outcome {
            CliParseOutcome::Run(StartupTarget::File(path)) => {
                assert_eq!(path, file_path.canonicalize().expect("canonical path"));
            }
            _ => panic!("unexpected parse outcome"),
        }
    }

    #[test]
    fn verbose_composes_with_file_startup() {
        let test_dir = TestDir::new();
        let file_path = test_dir.path().join("notes.txt");
        fs::write(&file_path, "hello").expect("write file");

        let outcome = parse_cli([
            "chilla",
            file_path.to_str().expect("utf-8 path"),
            "--verbose",
        ])
        .expect("parse verbose file");

        assert!(matches!(
            outcome,
            CliParseOutcome::Run(StartupTarget::File(_))
        ));
    }

    #[test]
    fn parses_github_pr_files_tab_startup_target() {
        let outcome = parse_cli([
            "chilla",
            "https://github.com/tacogips/rielflow/pull/44/files",
        ])
        .expect("parse GitHub PR files tab URL");

        match outcome {
            CliParseOutcome::Run(StartupTarget::GitHubPr(target)) => {
                assert_eq!(target.owner, "tacogips");
                assert_eq!(target.repo, "rielflow");
                assert_eq!(target.source, GitHubDiffSource::PullRequest { number: 44 });
                assert_eq!(target.url, "https://github.com/tacogips/rielflow/pull/44");
                assert!(target.use_cache);
            }
            _ => panic!("unexpected parse outcome"),
        }
    }

    #[test]
    fn parses_github_pr_trailing_slash_startup_target() {
        let outcome = parse_cli(["chilla", "https://github.com/tacogips/rielflow/pull/44/"])
            .expect("parse GitHub PR URL with trailing slash");

        match outcome {
            CliParseOutcome::Run(StartupTarget::GitHubPr(target)) => {
                assert_eq!(target.owner, "tacogips");
                assert_eq!(target.repo, "rielflow");
                assert_eq!(target.source, GitHubDiffSource::PullRequest { number: 44 });
                assert_eq!(target.url, "https://github.com/tacogips/rielflow/pull/44");
                assert!(target.use_cache);
            }
            _ => panic!("unexpected parse outcome"),
        }
    }

    #[test]
    fn parses_no_pr_diff_cache_startup_option() {
        let outcome = parse_cli([
            "chilla",
            "--no-pr-diff-cache",
            "https://github.com/tacogips/rielflow/pull/44/files",
        ])
        .expect("parse GitHub PR no-cache startup");

        match outcome {
            CliParseOutcome::Run(StartupTarget::GitHubPr(target)) => {
                assert_eq!(target.owner, "tacogips");
                assert_eq!(target.repo, "rielflow");
                assert_eq!(target.source, GitHubDiffSource::PullRequest { number: 44 });
                assert_eq!(target.url, "https://github.com/tacogips/rielflow/pull/44");
                assert!(!target.use_cache);
            }
            _ => panic!("unexpected parse outcome"),
        }
    }

    #[test]
    fn verbose_composes_with_github_cache_bypass() {
        let outcome = parse_cli([
            "chilla",
            "--no-github-diff-cache",
            "--verbose",
            "https://github.com/tacogips/rielflow/pull/44",
        ])
        .expect("parse verbose GitHub no-cache startup");

        match outcome {
            CliParseOutcome::Run(StartupTarget::GitHubPr(target)) => {
                assert!(!target.use_cache);
            }
            _ => panic!("unexpected parse outcome"),
        }
    }

    #[test]
    fn parses_github_commit_startup_target() {
        let outcome = parse_cli([
            "chilla",
            "https://github.com/tacogips/chilla/commit/abcdef1234567890",
        ])
        .expect("parse GitHub commit URL");

        match outcome {
            CliParseOutcome::Run(StartupTarget::GitHubPr(target)) => {
                assert_eq!(target.owner, "tacogips");
                assert_eq!(target.repo, "chilla");
                assert_eq!(
                    target.source,
                    GitHubDiffSource::Commit {
                        sha: "abcdef1234567890".to_string()
                    }
                );
                assert_eq!(
                    target.url,
                    "https://github.com/tacogips/chilla/commit/abcdef1234567890"
                );
                assert!(target.use_cache);
            }
            _ => panic!("unexpected parse outcome"),
        }
    }

    #[test]
    fn parses_github_compare_startup_target_with_slash_refs() {
        let outcome = parse_cli([
            "chilla",
            "--no-github-diff-cache",
            "https://github.com/tacogips/chilla/compare/release/v1...feature/pr-diff",
        ])
        .expect("parse GitHub compare URL");

        match outcome {
            CliParseOutcome::Run(StartupTarget::GitHubPr(target)) => {
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
                assert!(!target.use_cache);
            }
            _ => panic!("unexpected parse outcome"),
        }
    }

    #[test]
    fn parses_git_commit_startup_pair() {
        let test_dir = TestDir::new();
        run_git(test_dir.path(), &["init"]);
        run_git(
            test_dir.path(),
            &["config", "user.email", "test@example.invalid"],
        );
        run_git(test_dir.path(), &["config", "user.name", "Test User"]);
        fs::write(test_dir.path().join("README.md"), "hello\n").expect("write file");
        run_git(test_dir.path(), &["add", "."]);
        run_git(test_dir.path(), &["commit", "-m", "initial"]);
        let commit = git_output(test_dir.path(), &["rev-parse", "HEAD"])
            .trim()
            .to_string();

        let outcome = parse_cli([
            "chilla",
            "--verbose",
            test_dir.path().to_str().expect("path"),
            &commit,
        ])
        .expect("parse verbose Git commit startup");

        match outcome {
            CliParseOutcome::Run(StartupTarget::GitDiff(target)) => {
                assert_eq!(target.source, LocalGitDiffSource::Commit { commit });
            }
            _ => panic!("unexpected parse outcome"),
        }
    }

    #[test]
    fn parses_git_range_startup_pair() {
        let test_dir = TestDir::new();
        run_git(test_dir.path(), &["init"]);
        run_git(
            test_dir.path(),
            &["config", "user.email", "test@example.invalid"],
        );
        run_git(test_dir.path(), &["config", "user.name", "Test User"]);
        fs::write(test_dir.path().join("README.md"), "hello\n").expect("write file");
        run_git(test_dir.path(), &["add", "."]);
        run_git(test_dir.path(), &["commit", "-m", "initial"]);

        let outcome = parse_cli([
            "chilla",
            test_dir.path().to_str().expect("path"),
            "HEAD~1..HEAD",
        ])
        .expect("parse Git range startup");

        match outcome {
            CliParseOutcome::Run(StartupTarget::GitDiff(target)) => {
                assert_eq!(
                    target.source,
                    LocalGitDiffSource::Range {
                        base: "HEAD~1".to_string(),
                        head: "HEAD".to_string(),
                        merge_base: false,
                    }
                );
            }
            _ => panic!("unexpected parse outcome"),
        }
    }

    #[test]
    fn parses_multi_file_startup_targets() {
        let test_dir = TestDir::new();
        let first = test_dir.path().join("a.txt");
        let second = test_dir.path().join("b.txt");
        fs::write(&first, "a").expect("write file");
        fs::write(&second, "b").expect("write file");
        let first_canon = first.canonicalize().expect("canonical");
        let second_canon = second.canonicalize().expect("canonical");

        let outcome = parse_cli([
            "chilla",
            first.to_str().expect("utf-8"),
            second.to_str().expect("utf-8"),
        ])
        .expect("parse multi file startup");

        match outcome {
            CliParseOutcome::Run(StartupTarget::FileSet(paths)) => {
                assert_eq!(paths, vec![first_canon, second_canon]);
            }
            _ => panic!("unexpected parse outcome"),
        }
    }

    #[test]
    fn verbose_composes_with_multi_file_startup_when_interspersed() {
        let test_dir = TestDir::new();
        let first = test_dir.path().join("a.txt");
        let second = test_dir.path().join("b.txt");
        fs::write(&first, "a").expect("write file");
        fs::write(&second, "b").expect("write file");

        let outcome = parse_cli([
            "chilla",
            first.to_str().expect("utf-8"),
            "--verbose",
            second.to_str().expect("utf-8"),
        ])
        .expect("parse verbose multi-file startup");

        assert!(matches!(
            outcome,
            CliParseOutcome::Run(StartupTarget::FileSet(_))
        ));
    }

    #[test]
    fn verbose_multi_file_canonicalization_success_logs_canonical_paths() {
        let (test_dir, relative_directory) = TestDir::new_relative();
        let first_relative = relative_directory.join("a.txt");
        let second_relative = relative_directory.join("b.txt");
        fs::write(test_dir.path().join("a.txt"), "a").expect("write first file");
        fs::write(test_dir.path().join("b.txt"), "b").expect("write second file");
        let first_canonical = test_dir
            .path()
            .join("a.txt")
            .canonicalize()
            .expect("canonical first path");
        let second_canonical = test_dir
            .path()
            .join("b.txt")
            .canonicalize()
            .expect("canonical second path");

        let (outcome, lines) = verbose_log::with_test_sink(|| {
            parse_cli([
                OsString::from("chilla"),
                first_relative.into_os_string(),
                second_relative.into_os_string(),
            ])
        });

        assert!(matches!(
            outcome.expect("parse relative multi-file startup"),
            CliParseOutcome::Run(StartupTarget::FileSet(_))
        ));
        let canonicalization_lines = lines
            .iter()
            .filter(|line| line.contains("operation=\"canonicalize\""))
            .collect::<Vec<_>>();
        assert_eq!(canonicalization_lines.len(), 2);
        assert!(canonicalization_lines
            .iter()
            .any(|line| line.contains(&format!("path=\"{}\"", first_canonical.display()))));
        assert!(canonicalization_lines
            .iter()
            .any(|line| line.contains(&format!("path=\"{}\"", second_canonical.display()))));
    }

    #[test]
    fn verbose_multi_file_canonicalization_failure_logs_absolute_path() {
        let (test_dir, relative_directory) = TestDir::new_relative();
        let missing_relative = relative_directory.join("missing.txt");
        let existing_relative = relative_directory.join("existing.txt");
        fs::write(test_dir.path().join("existing.txt"), "existing").expect("write existing file");
        let expected_diagnostic_path = std::env::current_dir()
            .expect("current directory")
            .join(&missing_relative);

        let (outcome, lines) = verbose_log::with_test_sink(|| {
            parse_cli([
                OsString::from("chilla"),
                missing_relative.into_os_string(),
                existing_relative.into_os_string(),
            ])
        });

        assert!(outcome.is_err());
        let canonicalization_lines = lines
            .iter()
            .filter(|line| line.contains("operation=\"canonicalize\""))
            .collect::<Vec<_>>();
        assert_eq!(canonicalization_lines.len(), 1);
        assert!(canonicalization_lines[0].contains("outcome=\"failure\""));
        assert!(canonicalization_lines[0]
            .contains(&format!("path=\"{}\"", expected_diagnostic_path.display())));
    }

    #[test]
    fn multi_file_startup_duplicate_paths_fall_back_to_single_file() {
        let test_dir = TestDir::new();
        let single = test_dir.path().join("note.txt");
        fs::write(&single, "x").expect("write file");

        let outcome = parse_cli([
            "chilla",
            single.to_str().expect("utf-8"),
            single.to_str().expect("utf-8"),
        ])
        .expect("duplicate paths");

        match outcome {
            CliParseOutcome::Run(StartupTarget::File(path)) => {
                assert_eq!(path, single.canonicalize().expect("canonical"));
            }
            _ => panic!("unexpected parse outcome"),
        }
    }

    #[test]
    fn multi_file_startup_rejects_directory_arguments() {
        let test_dir = TestDir::new();
        let file_path = test_dir.path().join("x.txt");
        fs::write(&file_path, "x").expect("write file");

        assert!(parse_cli([
            "chilla",
            test_dir.path().to_str().expect("utf-8"),
            file_path.to_str().unwrap(),
        ])
        .is_err());
    }

    fn run_git(repo: &Path, args: &[&str]) {
        let status = std::process::Command::new("git")
            .arg("-C")
            .arg(repo)
            .args(args)
            .status()
            .expect("run git");
        assert!(status.success(), "git command failed: {args:?}");
    }

    fn git_output(repo: &Path, args: &[&str]) -> String {
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
