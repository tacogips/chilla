//! Syntax highlighting for file previews and Markdown fenced blocks (syntect).

use std::path::Path;
use std::sync::OnceLock;

use syntect::highlighting::{Theme, ThemeSet};
use syntect::html::highlighted_html_for_string;
use syntect::parsing::{SyntaxDefinition, SyntaxReference, SyntaxSet};

/// UI theme for syntect (paired with app light/dark).
#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
pub enum SyntaxUiTheme {
    #[default]
    Dark,
    Light,
}

impl SyntaxUiTheme {
    pub fn parse(raw: &str) -> Self {
        match raw.to_ascii_lowercase().as_str() {
            "light" => Self::Light,
            _ => Self::Dark,
        }
    }
}

static SYNTAX_SET: OnceLock<SyntaxSet> = OnceLock::new();
static THEME_SET: OnceLock<ThemeSet> = OnceLock::new();

fn syntax_set() -> &'static SyntaxSet {
    SYNTAX_SET.get_or_init(|| {
        let mut builder = SyntaxSet::load_defaults_newlines().into_builder();
        let toml_src = include_str!("../../syntaxes/TOML.sublime-syntax");
        let toml_def = SyntaxDefinition::load_from_str(toml_src, true, Some("TOML.sublime-syntax"))
            .expect("embedded TOML.sublime-syntax must be valid");
        builder.add(toml_def);
        builder.build()
    })
}

fn theme_set() -> &'static ThemeSet {
    THEME_SET.get_or_init(ThemeSet::load_defaults)
}

/// Pairs with app chrome: dark UI uses a dark base16 theme (light-on-dark tokens);
/// light UI uses InspiredGitHub first (high-contrast on white / near-white), then base16 light.
fn syntect_theme(ui: SyntaxUiTheme) -> &'static Theme {
    let themes = theme_set();
    match ui {
        SyntaxUiTheme::Dark => themes
            .themes
            .get("base16-ocean.dark")
            .or_else(|| themes.themes.get("Solarized (dark)"))
            .or_else(|| themes.themes.values().next())
            .expect("syntect theme set must be non-empty"),
        SyntaxUiTheme::Light => themes
            .themes
            .get("InspiredGitHub")
            .or_else(|| themes.themes.get("base16-ocean.light"))
            .or_else(|| themes.themes.get("Solarized (light)"))
            .or_else(|| themes.themes.values().next())
            .expect("syntect theme set must be non-empty"),
    }
}

fn resolve_syntax<'a>(
    ss: &'a SyntaxSet,
    lang_token: Option<&str>,
    path: Option<&Path>,
) -> &'a SyntaxReference {
    if let Some(path) = path {
        if let Ok(Some(syntax)) = ss.find_syntax_for_file(path) {
            return syntax;
        }
    }

    let Some(raw) = lang_token.map(str::trim).filter(|s| !s.is_empty()) else {
        return ss.find_syntax_plain_text();
    };

    let lower = raw.to_ascii_lowercase();
    ss.find_syntax_by_extension(&lower)
        .or_else(|| ss.find_syntax_by_token(&lower))
        .unwrap_or_else(|| ss.find_syntax_plain_text())
}

fn escaped_fallback(source: &str) -> String {
    let mut body = String::with_capacity(source.len());
    for ch in source.chars() {
        match ch {
            '&' => body.push_str("&amp;"),
            '<' => body.push_str("&lt;"),
            '>' => body.push_str("&gt;"),
            _ => body.push(ch),
        }
    }
    format!(r#"<pre class="chilla-fallback"><code>{body}</code></pre>"#)
}

/// Full-file preview in the file viewer: grammar is inferred from the file path.
pub fn highlight_file_source(source: &str, path: &Path, ui: SyntaxUiTheme) -> String {
    let ss = syntax_set();
    let syntax = resolve_syntax(ss, None, Some(path));
    highlighted_html_for_string(source, ss, syntax, syntect_theme(ui))
        .unwrap_or_else(|_| escaped_fallback(source))
}

/// Markdown fenced block: `lang_token` is the first word of the info string (e.g. `rust`).
pub fn highlight_markdown_fence(source: &str, lang_token: Option<&str>, ui: SyntaxUiTheme) -> String {
    let ss = syntax_set();
    let syntax = resolve_syntax(ss, lang_token, None);
    highlighted_html_for_string(source, ss, syntax, syntect_theme(ui))
        .unwrap_or_else(|_| escaped_fallback(source))
}

#[cfg(test)]
mod tests {
    use super::syntax_set;

    #[test]
    fn default_syntax_set_includes_toml_and_json() {
        let ss = syntax_set();
        assert!(
            ss.find_syntax_by_extension("toml").is_some(),
            "expected TOML grammar for .toml previews",
        );
        assert!(
            ss.find_syntax_by_extension("json").is_some(),
            "expected JSON grammar",
        );
    }
}
