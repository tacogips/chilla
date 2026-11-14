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
    git_diff::GitDiffSource as LocalGitDiffSource, github_pr_diff::GitHubDiffSource, verbose_log,
};

#[test]
fn parses_github_shorthand_with_interspersed_options() {
    for arguments in [
        vec!["chilla", "github:octocat/Hello-World", "00042"],
        vec![
            "chilla",
            "--verbose",
            "github:octocat/Hello-World",
            "42",
            "--verbose",
        ],
    ] {
        let CliParseOutcome::Run(StartupTarget::GitHubPr(target)) =
            parse_cli(arguments).expect("shorthand")
        else {
            panic!("expected GitHub target");
        };
        assert_eq!(target.url, "https://github.com/octocat/Hello-World/pull/42");
        assert_eq!(target.source, GitHubDiffSource::PullRequest { number: 42 });
        assert!(target.use_cache);
    }
    for flag in ["--no-github-diff-cache", "--no-pr-diff-cache"] {
        for arguments in [
            vec!["chilla", flag, "github:octocat/Hello-World", "42"],
            vec![
                "chilla",
                "github:octocat/Hello-World",
                flag,
                "42",
                "--verbose",
            ],
            vec!["chilla", "github:octocat/Hello-World", "42", flag],
        ] {
            let CliParseOutcome::Run(StartupTarget::GitHubPr(target)) =
                parse_cli(arguments).expect("cache flag")
            else {
                panic!("expected GitHub target");
            };
            assert!(!target.use_cache);
        }
    }
}

#[test]
fn rejects_missing_malformed_and_extra_shorthand_arguments() {
    for arguments in [
        vec!["chilla", "github:octocat/Hello-World"],
        vec![
            "chilla",
            "github:octocat/Hello-World",
            "--no-github-diff-cache",
        ],
        vec!["chilla", "github:octocat/Hello-World", "42", "extra"],
        vec!["chilla", "42", "github:octocat/Hello-World"],
        vec!["chilla", "github:octocat/Hello-World", "--unknown"],
        vec!["chilla", "github:octocat/Hello-World", "0"],
        vec!["chilla", "github:octocat/Hello-World", "+42"],
        vec![
            "chilla",
            "github:octocat/Hello-World",
            "main...topic",
            "extra",
        ],
        vec![
            "chilla",
            "github:octocat/Hello-World",
            "abcd1234",
            "--unknown",
        ],
        vec!["chilla", "github:octocat/Hello-World", "main..."],
    ] {
        assert!(
            parse_cli(arguments.clone()).is_err(),
            "accepted {arguments:?}"
        );
    }
}

#[test]
fn parses_transport_urls_with_cache_flag() {
    for suffix in ["diff", "patch"] {
        let url = format!("https://github.com/octocat/Hello-World/pull/42.{suffix}");
        let CliParseOutcome::Run(StartupTarget::GitHubPr(target)) =
            parse_cli(["chilla", "--verbose", "--no-github-diff-cache", &url])
                .expect("transport URL")
        else {
            panic!("expected GitHub target");
        };
        assert_eq!(target.url, "https://github.com/octocat/Hello-World/pull/42");
        assert!(!target.use_cache);
    }
}

#[test]
fn help_documents_github_shorthand_and_transport_urls() {
    let CliParseOutcome::Help(help) = parse_cli(["chilla", "--help"]).expect("help") else {
        panic!("expected help");
    };
    assert!(help.contains("github:<owner>/<repo> <pr-id|sha|commit:sha|base...head>"));
    assert!(help.contains("Use commit:<sha> for all-numeric SHAs"));
    assert!(help.contains(".diff and .patch"));
}

#[test]
fn parses_commit_and_branch_shorthand_with_global_options() {
    for (selector, path) in [
        ("abcd1234", "commit/abcd1234"),
        ("commit:1234", "commit/1234"),
        ("main...feature/topic", "compare/main...feature/topic"),
    ] {
        for flag in ["--no-github-diff-cache", "--no-pr-diff-cache"] {
            for arguments in [
                vec!["chilla", flag, "github:octocat/Hello-World", selector],
                vec![
                    "chilla",
                    "github:octocat/Hello-World",
                    flag,
                    "--verbose",
                    selector,
                ],
                vec![
                    "chilla",
                    "--verbose",
                    "github:octocat/Hello-World",
                    selector,
                    flag,
                ],
            ] {
                let CliParseOutcome::Run(StartupTarget::GitHubPr(target)) =
                    parse_cli(arguments).expect("diff shorthand")
                else {
                    panic!("expected GitHub target");
                };
                assert_eq!(
                    target.url,
                    format!("https://github.com/octocat/Hello-World/{path}")
                );
                assert!(!target.use_cache);
            }
        }
    }
}

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
