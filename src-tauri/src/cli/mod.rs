use std::{
    collections::HashSet,
    ffi::OsString,
    fs,
    path::{Path, PathBuf},
};

use crate::{
    error::{AppError, AppResult},
    viewer::service::resolve_startup_target,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StartupTarget {
    CurrentDirectory(PathBuf),
    Directory(PathBuf),
    File(PathBuf),
    FileSet(Vec<PathBuf>),
}

pub enum CliParseOutcome {
    Run(StartupTarget),
    Help(String),
    Version(String),
}

pub fn parse_cli<I, T>(args: I) -> AppResult<CliParseOutcome>
where
    I: IntoIterator<Item = T>,
    T: Into<OsString>,
{
    let mut args = args.into_iter().map(Into::into).collect::<Vec<_>>();

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
            flag if flag.starts_with('-') => Err(AppError::cli_usage(
                format!("unsupported flag `{flag}`\n\n{}", help_text(&binary_name)),
                2,
            )),
            file_name => Ok(CliParseOutcome::Run(validate_cli_path(Path::new(
                file_name,
            ))?)),
        };
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

        paths.push(PathBuf::from(raw));
    }

    Ok(CliParseOutcome::Run(resolve_explicit_file_startup(&paths)?))
}

fn validate_cli_path(path: &Path) -> AppResult<StartupTarget> {
    resolve_startup_target(path)
}

fn resolve_explicit_file_startup(paths: &[PathBuf]) -> AppResult<StartupTarget> {
    let mut seen_canonical_paths = HashSet::<String>::new();
    let mut ordered_unique_paths = Vec::new();

    for path in paths {
        let canonical_path =
            fs::canonicalize(path).map_err(|source| AppError::io("canonicalize", path, source))?;

        let metadata = fs::metadata(&canonical_path)
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

fn help_text(binary_name: &str) -> String {
    format!(
        "Usage:\n  {binary_name} [path ...]\n  {binary_name} --help\n  {binary_name} --version\n\nIf no paths are provided, chilla opens the current working directory in file view mode.\nIf two or more file paths are provided, chilla opens file view mode with the left pane limited to those files.",
    )
}

fn version_text() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        path::{Path, PathBuf},
        time::{SystemTime, UNIX_EPOCH},
    };

    use super::{parse_cli, CliParseOutcome, StartupTarget};

    struct TestDir {
        path: PathBuf,
    }

    impl TestDir {
        fn new() -> Self {
            let unique = SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos();
            let path = std::env::temp_dir().join(format!("chilla-cli-tests-{unique}"));
            fs::create_dir_all(&path).expect("create temp test directory");
            Self { path }
        }

        fn path(&self) -> &Path {
            &self.path
        }
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
}
