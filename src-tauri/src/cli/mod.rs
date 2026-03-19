use std::{
    ffi::OsString,
    path::{Path, PathBuf},
};

use crate::{
    document::service::canonicalize_document_path,
    error::{AppError, AppResult},
};

pub enum CliParseOutcome {
    Run(PathBuf),
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
        return Err(AppError::cli_usage(
            format!("missing Markdown file path\n\n{}", help_text(&binary_name),),
            2,
        ));
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
        file_name => Ok(CliParseOutcome::Run(validate_cli_path(Path::new(
            file_name,
        ))?)),
    }
}

fn validate_cli_path(path: &Path) -> AppResult<PathBuf> {
    canonicalize_document_path(path)
}

fn help_text(binary_name: &str) -> String {
    format!(
        "Usage:\n  {binary_name} <file_name>\n  {binary_name} --help\n  {binary_name} --version\n\nSupported extensions: .md, .markdown, .mdown"
    )
}

fn version_text() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}
