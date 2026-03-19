use std::{io, path::Path};

#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("{message}")]
    CliUsage { message: String, exit_code: i32 },
    #[error("unsupported Markdown file extension: {0}")]
    UnsupportedExtension(String),
    #[error("path does not point to a regular file: {0}")]
    NotAFile(String),
    #[error("failed to {action} `{path}`: {source}")]
    Io {
        action: &'static str,
        path: String,
        #[source]
        source: io::Error,
    },
    #[error("watcher error: {0}")]
    Watcher(#[from] notify::Error),
    #[error("internal state error: {0}")]
    State(String),
}

pub type AppResult<T> = Result<T, AppError>;

impl AppError {
    pub fn cli_usage(message: impl Into<String>, exit_code: i32) -> Self {
        Self::CliUsage {
            message: message.into(),
            exit_code,
        }
    }

    pub fn exit_code(&self) -> i32 {
        match self {
            Self::CliUsage { exit_code, .. } => *exit_code,
            Self::UnsupportedExtension(_) | Self::NotAFile(_) | Self::Io { .. } => 3,
            Self::Watcher(_) | Self::State(_) => 1,
        }
    }

    pub fn io(action: &'static str, path: &Path, source: io::Error) -> Self {
        Self::Io {
            action,
            path: path.display().to_string(),
            source,
        }
    }
}
