use std::{
    ffi::OsString,
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
    let mut args = args.into_iter().map(Into::into);
    let binary_name = args
        .next()
        .and_then(|argument| argument.into_string().ok())
        .unwrap_or_else(|| "marky".to_string());

    let Some(argument) = args.next() else {
        let current_directory =
            std::env::current_dir().map_err(|source| AppError::io("resolve current directory", Path::new("."), source))?;
        return Ok(CliParseOutcome::Run(StartupTarget::CurrentDirectory(
            current_directory,
        )));
    };

    if args.next().is_some() {
        return Err(AppError::cli_usage(
            format!(
                "expected exactly one Markdown file path\n\n{}",
                help_text(&binary_name),
            ),
            2,
        ));
    }

    let argument = argument
        .into_string()
        .map_err(|_| AppError::cli_usage("document path must be valid UTF-8".to_string(), 2))?;

    match argument.as_str() {
        "--help" | "-h" => Ok(CliParseOutcome::Help(help_text(&binary_name))),
        "--version" | "-V" => Ok(CliParseOutcome::Version(version_text())),
        flag if flag.starts_with('-') => Err(AppError::cli_usage(
            format!("unsupported flag `{flag}`\n\n{}", help_text(&binary_name)),
            2,
        )),
        file_name => Ok(CliParseOutcome::Run(validate_cli_path(Path::new(file_name))?)),
    }
}

fn validate_cli_path(path: &Path) -> AppResult<StartupTarget> {
    resolve_startup_target(path)
}

fn help_text(binary_name: &str) -> String {
    format!(
        "Usage:\n  {binary_name} [path]\n  {binary_name} --help\n  {binary_name} --version\n\nIf no path is provided, marky opens the current working directory in file view mode."
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
            let path = std::env::temp_dir().join(format!("marky-cli-tests-{unique}"));
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

        let outcome = parse_cli(["marky"]).expect("parse bare startup");

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

        let outcome = parse_cli(["marky", test_dir.path().to_str().expect("utf-8 path")])
            .expect("parse directory");

        match outcome {
            CliParseOutcome::Run(StartupTarget::Directory(path)) => {
                assert_eq!(path, test_dir.path().canonicalize().expect("canonical path"));
            }
            _ => panic!("unexpected parse outcome"),
        }
    }

    #[test]
    fn parses_file_startup_targets() {
        let test_dir = TestDir::new();
        let file_path = test_dir.path().join("notes.txt");
        fs::write(&file_path, "hello").expect("write file");

        let outcome = parse_cli(["marky", file_path.to_str().expect("utf-8 path")])
            .expect("parse file");

        match outcome {
            CliParseOutcome::Run(StartupTarget::File(path)) => {
                assert_eq!(path, file_path.canonicalize().expect("canonical path"));
            }
            _ => panic!("unexpected parse outcome"),
        }
    }
}
