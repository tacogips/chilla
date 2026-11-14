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

    if args.iter().any(|argument| {
        argument
            .to_str()
            .is_some_and(|value| value.starts_with("github:"))
    }) {
        return parse_github_shorthand(&args)
            .map(|target| CliParseOutcome::Run(StartupTarget::GitHubPr(target)));
    }

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

fn parse_github_shorthand(args: &[OsString]) -> AppResult<GitHubPrTarget> {
    let values = args
        .iter()
        .map(|argument| {
            argument.to_str().ok_or_else(|| {
                AppError::cli_usage("GitHub shorthand arguments must be valid UTF-8", 2)
            })
        })
        .collect::<AppResult<Vec<_>>>()?;
    let use_cache = !values
        .iter()
        .any(|value| is_no_github_diff_cache_flag(value));
    let positional = values
        .into_iter()
        .filter(|value| !is_no_github_diff_cache_flag(value))
        .collect::<Vec<_>>();
    let [repository, selector] = positional.as_slice() else {
        return Err(AppError::cli_usage(
            "GitHub shorthand requires exactly: github:<owner>/<repo> <pr-id|sha|commit:sha|base...head>",
            2,
        ));
    };
    let mut target = GitHubPrTarget::parse_shorthand(repository, selector)?;
    target.use_cache = use_cache;
    Ok(target)
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
        "Usage:\n  {binary_name} [--verbose] [path ...]\n  {binary_name} [--verbose] <github-diff-url>\n  {binary_name} [--verbose] --no-github-diff-cache <github-diff-url>\n  {binary_name} [--verbose] --no-pr-diff-cache <github-diff-url>\n  {binary_name} [--verbose] [--no-github-diff-cache] github:<owner>/<repo> <pr-id|sha|commit:sha|base...head>\n  {binary_name} [--verbose] <git-dir> <commit-or-range>\n  {binary_name} --help\n  {binary_name} --version\n\nIf no paths are provided, chilla opens the current working directory in file view mode.\nIf a GitHub pull request, commit, or compare URL is provided, chilla opens that GitHub diff in read-only mode.\nGitHub .diff and .patch URL forms are also supported.\nThe github: shorthand accepts a positive decimal PR number, a 4-40 character hexadecimal SHA, commit:<sha>, or <base>...<head> (slash refs supported). Use commit:<sha> for all-numeric SHAs.\nIf a Git directory plus commit or range is provided, chilla opens that local Git diff in read-only mode.\nGitHub diffs are cached under the system temp directory and refreshed when GitHub reports a newer updated marker.\n--no-pr-diff-cache remains supported as a compatibility alias for --no-github-diff-cache.\nIf two or more file paths are provided, chilla opens file view mode with the left pane limited to those files.\n\nOptions:\n  --verbose  Write startup and file-I/O diagnostics to {} and mirror them to an attached terminal.\n  --help     Show this help text.\n  --version  Show the application version.",
        verbose_log::VERBOSE_LOG_PATH_PATTERN,
    )
}

fn version_text() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests;
