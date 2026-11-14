//! Metadata-only diagnostics for verifying the bundled grammar and dispatch inventory.
use std::path::Path;

use serde::Serialize;
use syntect::parsing::SyntaxReference;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SyntaxIdentity {
    pub name: String,
    pub scope: String,
    pub extensions: Vec<String>,
    pub hidden: bool,
}

impl From<&SyntaxReference> for SyntaxIdentity {
    fn from(syntax: &SyntaxReference) -> Self {
        Self {
            name: syntax.name.clone(),
            scope: syntax.scope.to_string(),
            extensions: syntax.file_extensions.clone(),
            hidden: syntax.hidden,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SyntaxResolution {
    pub syntax: SyntaxIdentity,
    pub json_lexer: bool,
    pub file_label: Option<String>,
}

/// Return exact generated grammar identities, including embedded and hidden grammars.
pub fn inventory() -> Vec<SyntaxIdentity> {
    super::syntax_set()
        .syntaxes()
        .iter()
        .map(SyntaxIdentity::from)
        .collect()
}

/// Inspect the same resolver used by file previews and Markdown fences without rendering source.
pub fn resolve(path: Option<&Path>, language: Option<&str>, source: &str) -> SyntaxResolution {
    SyntaxResolution {
        syntax: super::resolve_syntax(super::syntax_set(), language, path, Some(source)).into(),
        json_lexer: language.is_none() && path.is_some_and(super::is_json_path),
        file_label: path.map(super::describe_file_syntax),
    }
}
