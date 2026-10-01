//! Syntax highlighting for file previews and Markdown fenced blocks (syntect).

mod json;
mod render;

#[doc(hidden)]
pub mod diagnostics;

#[cfg(test)]
mod regression_tests;

use std::path::Path;
use std::sync::OnceLock;

use syntect::highlighting::{Highlighter, Theme, ThemeSet};
use syntect::parsing::{SyntaxReference, SyntaxSet};

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
static DARK_HIGHLIGHTER: OnceLock<Highlighter<'static>> = OnceLock::new();
static LIGHT_HIGHLIGHTER: OnceLock<Highlighter<'static>> = OnceLock::new();

fn theme_highlighter(ui: SyntaxUiTheme) -> &'static Highlighter<'static> {
    match ui {
        SyntaxUiTheme::Dark => &DARK_HIGHLIGHTER,
        SyntaxUiTheme::Light => &LIGHT_HIGHLIGHTER,
    }
    .get_or_init(|| Highlighter::new(syntect_theme(ui)))
}

fn syntax_set() -> &'static SyntaxSet {
    SYNTAX_SET.get_or_init(|| {
        syntect::dumps::from_uncompressed_data(include_bytes!(concat!(
            env!("OUT_DIR"),
            "/chilla-syntaxes.packdump"
        )))
        .expect("build-generated syntax packdump must be valid")
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
    source: Option<&str>,
) -> &'a SyntaxReference {
    let explicit_lang = lang_token.map(str::trim).filter(|s| !s.is_empty());

    // Exact, case-sensitive file-name resolution (e.g. `Makefile`, `Cargo.lock`,
    // `Dockerfile`) before any lowercased extension lookup. `find_syntax_by_extension`
    // itself compares case-insensitively, so this only needs the raw, undecorated
    // file name; explicit language tokens (markdown fences) always take priority.
    if explicit_lang.is_none() {
        if let Some(syntax) = path
            .and_then(Path::file_name)
            .and_then(|file_name| file_name.to_str())
            .and_then(|file_name| ss.find_syntax_by_extension(file_name))
        {
            return syntax;
        }
    }

    let raw = explicit_lang
        .map(str::to_string)
        .or_else(|| path.and_then(path_syntax_token))
        .or_else(|| {
            path.and_then(|path| {
                path.extension()
                    .and_then(|extension| extension.to_str())
                    .map(str::to_string)
            })
        });

    if let Some(raw) = raw.as_deref() {
        let lower = canonical_lang_token(raw);
        if let Some(syntax) = ss
            .find_syntax_by_extension(&lower)
            .or_else(|| ss.find_syntax_by_token(&lower))
        {
            return syntax;
        }
    }

    if let Some(first_line) = source.and_then(|source| source.lines().next()) {
        if let Some(syntax) = ss.find_syntax_by_first_line(first_line) {
            return syntax;
        }
    }

    ss.find_syntax_plain_text()
}

fn canonical_lang_token(raw: &str) -> String {
    match raw.trim().to_ascii_lowercase().as_str() {
        // syntect's default bundle lacks dedicated TypeScript grammars, so use JavaScript.
        "ts" | "typescript" | "tsx" | "jsx" | "mjs" | "cjs" | "mts" | "cts" => "js".to_string(),
        "shell" | "shellscript" | "console" => "sh".to_string(),
        "md" => "markdown".to_string(),
        // No dedicated Sass/Less or Vue/Svelte grammars; fall back to the closest relative.
        "scss" | "less" => "css".to_string(),
        "vue" | "svelte" => "html".to_string(),
        // POSIX-ish shell dialects and env files share the Bash grammar.
        "env" | "ksh" => "sh".to_string(),
        // JSON-family fences route through the bundled JSON grammar; the dedicated JSON
        // lexer (`json.rs`) is only used for file-path previews via `is_json_path`.
        "jsonl" | "ndjson" | "jsonc" | "geojson" | "json5" => "json".to_string(),
        "dockerfile" | "containerfile" => "dockerfile".to_string(),
        "terraform" | "tf" => "hcl".to_string(),
        "kotlin" => "kt".to_string(),
        "protobuf" => "proto".to_string(),
        // Extension-only variants of the XML family that the bundled XML grammar itself
        // does not declare.
        "xsl" | "atom" | "plist" | "wsdl" | "kml" | "gpx" | "csproj" | "fsproj" | "vbproj"
        | "props" | "targets" | "resx" | "xaml" | "nuspec" => "xml".to_string(),
        other => other.to_string(),
    }
}

fn path_syntax_token(path: &Path) -> Option<String> {
    let file_name = path.file_name()?.to_str()?.to_ascii_lowercase();

    if matches!(
        file_name.as_str(),
        ".bashrc"
            | ".bash_profile"
            | ".bash_login"
            | ".bash_logout"
            | ".bash_aliases"
            | ".profile"
            | ".zshenv"
            | ".zprofile"
            | ".zshrc"
            | ".zlogin"
            | ".zlogout"
            | "bash"
            | "sh"
            | "zsh"
    ) {
        return Some("sh".to_string());
    }

    // Bare `.env` has no `Path::extension()` (a leading-dot name with no other
    // `.` has none), so it needs the same literal-file-name handling as the
    // bash dotfiles above rather than the extension-based branch below.
    if file_name == ".env" {
        return Some("sh".to_string());
    }

    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.to_ascii_lowercase())
        .and_then(|extension| match extension.as_str() {
            "bash" | "env" | "ksh" | "nix" | "sh" | "swift" | "zsh" => Some(extension),
            _ => None,
        })
}

fn display_syntax_name(name: &str) -> String {
    let lower = name.to_ascii_lowercase();

    if lower.contains("shell") || lower.contains("bash") || lower.contains("zsh") {
        return "Shell".to_string();
    }

    name.to_string()
}

fn path_syntax_display_name(path: &Path) -> Option<String> {
    match path_syntax_token(path)?.as_str() {
        "bash" | "env" | "ksh" | "sh" | "zsh" => Some("Shell".to_string()),
        "nix" => Some("Nix".to_string()),
        "swift" => Some("Swift".to_string()),
        other => Some(display_syntax_name(other)),
    }
}

pub fn describe_file_syntax(path: &Path) -> String {
    if is_json_path(path) {
        return if is_json_lines_path(path) {
            "JSON Lines".to_string()
        } else {
            "JSON".to_string()
        };
    }
    let ss = syntax_set();
    let syntax = resolve_syntax(ss, None, Some(path), None);

    if syntax.name != ss.find_syntax_plain_text().name {
        return display_syntax_name(&syntax.name);
    }

    path_syntax_display_name(path).unwrap_or_else(|| "Plain Text".to_string())
}

pub fn should_treat_path_as_text(path: &Path) -> bool {
    let syntax_name = describe_file_syntax(path);
    syntax_name != "Plain Text"
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
    if is_json_path(path) {
        return json::highlight(source, syntect_theme(ui), theme_highlighter(ui));
    }
    let ss = syntax_set();
    let syntax = resolve_syntax(ss, None, Some(path), Some(source));
    render::highlight(source, ss, syntax, syntect_theme(ui), theme_highlighter(ui))
        .unwrap_or_else(|_| escaped_fallback(source))
}

/// JSON-family paths (including JSON Lines) that route through the dedicated
/// JSON lexer in `json.rs` rather than a syntect grammar. Deliberately
/// excludes `jsonc`, whose comments the strict JSON formatter/highlighter
/// cannot represent.
fn is_json_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "json"
                    | "jsonl"
                    | "ndjson"
                    | "jsonlines"
                    | "geojson"
                    | "jsonld"
                    | "webmanifest"
                    | "har"
            )
        })
}

/// Subset of [`is_json_path`] that is specifically JSON Lines (one JSON
/// record per line), used to pick the "JSON" vs "JSON Lines" display label.
fn is_json_lines_path(path: &Path) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .is_some_and(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "jsonl" | "ndjson" | "jsonlines"
            )
        })
}

/// Markdown fenced block: `lang_token` is the first word of the info string (e.g. `rust`).
pub fn highlight_markdown_fence(
    source: &str,
    lang_token: Option<&str>,
    ui: SyntaxUiTheme,
) -> String {
    let ss = syntax_set();
    let syntax = resolve_syntax(ss, lang_token, None, Some(source));
    render::highlight(source, ss, syntax, syntect_theme(ui), theme_highlighter(ui))
        .unwrap_or_else(|_| escaped_fallback(source))
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use crate::syntax_highlight::SyntaxUiTheme;

    use super::{
        describe_file_syntax, highlight_file_source, highlight_markdown_fence, syntax_set,
    };

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

    #[test]
    fn highlights_markdown_files_with_markdown_syntax() {
        let html = highlight_file_source(
            "# Title\n\n- item\n",
            Path::new("README.md"),
            SyntaxUiTheme::Dark,
        );

        assert!(html.contains("<pre"));
        assert!(
            html.contains("style=") && html.contains("<span"),
            "expected syntect-highlighted markdown HTML, got: {html}"
        );
    }

    #[test]
    fn highlights_typescript_fences_via_javascript_alias() {
        let html = highlight_markdown_fence(
            "const message: string = \"hello\";\nconsole.log(message);\n",
            Some("typescript"),
            SyntaxUiTheme::Dark,
        );

        assert!(
            html.contains("style=") && html.contains("<span"),
            "expected syntax-highlighted HTML for typescript fence, got: {html}"
        );
    }

    #[test]
    fn highlights_swift_files_and_fences() {
        let file_html = highlight_file_source(
            "struct App { let title = \"chilla\" }\n",
            Path::new("App.swift"),
            SyntaxUiTheme::Dark,
        );
        let fence_html = highlight_markdown_fence(
            "struct App { let title = \"chilla\" }\n",
            Some("swift"),
            SyntaxUiTheme::Dark,
        );

        for html in [file_html, fence_html] {
            assert!(
                html.contains("style=") && html.contains("<span"),
                "expected syntax-highlighted Swift HTML, got: {html}"
            );
        }
    }

    #[test]
    fn describes_shell_and_nix_paths_with_user_facing_labels() {
        assert_eq!(describe_file_syntax(Path::new("install.sh")), "Shell");
        assert_eq!(describe_file_syntax(Path::new("zsh")), "Shell");
        assert_eq!(describe_file_syntax(Path::new("flake.nix")), "Nix");
        assert_eq!(describe_file_syntax(Path::new("App.swift")), "Swift");
        // `env`/`ksh` alias to the Bash grammar, so they now resolve to a real
        // grammar (previously fell back to Plain Text).
        assert_eq!(describe_file_syntax(Path::new("sample.env")), "Shell");
        assert_eq!(describe_file_syntax(Path::new("sample.ksh")), "Shell");
        // Bare `.env` has no `Path::extension()`, so it needs the dedicated
        // literal-file-name branch in `path_syntax_token`.
        assert_eq!(describe_file_syntax(Path::new(".env")), "Shell");
    }

    #[test]
    fn highlights_new_project_grammars_with_real_spans() {
        let cases: &[(&str, &str, &str)] = &[
            ("flake.nix", "nix", "let x = 1; in x\n"),
            ("Dockerfile", "dockerfile", "FROM alpine\nRUN echo hi\n"),
            ("main.zig", "zig", "const std = @import(\"std\");\n"),
            (
                "schema.proto",
                "proto",
                "syntax = \"proto3\";\nmessage M { string a = 1; }\n",
            ),
            ("Main.kt", "kotlin", "fun main() { val x = 1 }\n"),
            ("app.ini", "ini", "[section]\nkey = value\n"),
            (
                "main.tf",
                "hcl",
                "resource \"a\" \"b\" {\n  enabled = true\n}\n",
            ),
            ("schema.graphql", "graphql", "query Q { field }\n"),
        ];

        for (path, lang_token, source) in cases {
            let file_html = highlight_file_source(source, Path::new(path), SyntaxUiTheme::Dark);
            assert!(
                file_html.contains("style=") && file_html.contains("<span"),
                "expected syntax-highlighted HTML for {path}, got: {file_html}"
            );

            let fence_html =
                highlight_markdown_fence(source, Some(lang_token), SyntaxUiTheme::Dark);
            assert!(
                fence_html.contains("style=") && fence_html.contains("<span"),
                "expected syntax-highlighted HTML for {lang_token} fence, got: {fence_html}"
            );
        }
    }

    #[test]
    fn resolves_alias_extensions_to_expected_grammar_labels() {
        let cases: &[(&str, &str)] = &[
            ("app.mjs", "JavaScript"),
            ("app.cjs", "JavaScript"),
            ("app.mts", "JavaScript"),
            ("app.cts", "JavaScript"),
            ("styles.scss", "CSS"),
            ("styles.less", "CSS"),
            ("App.vue", "HTML"),
            ("App.svelte", "HTML"),
            ("main.tf", "HCL"),
            ("vars.tfvars", "HCL"),
            ("feed.atom", "XML"),
            ("Info.plist", "XML"),
            ("project.csproj", "XML"),
        ];

        for (path, expected) in cases {
            assert_eq!(
                describe_file_syntax(Path::new(path)),
                *expected,
                "path={path}"
            );
        }
    }

    #[test]
    fn resolves_kotlin_and_protobuf_fence_aliases() {
        let kotlin_html =
            highlight_markdown_fence("fun main() {}\n", Some("kotlin"), SyntaxUiTheme::Dark);
        let proto_html = highlight_markdown_fence(
            "syntax = \"proto3\";\n",
            Some("protobuf"),
            SyntaxUiTheme::Dark,
        );
        for html in [kotlin_html, proto_html] {
            assert!(
                html.contains("style=") && html.contains("<span"),
                "expected syntax-highlighted HTML for aliased fence, got: {html}"
            );
        }
    }

    #[test]
    fn resolves_exact_filenames_before_lowercased_extension_lookup() {
        // These file names carry no useful `Path::extension()` (either no dot, or a
        // dot that yields a meaningless suffix like `lock`), so they only resolve
        // once the exact, case-sensitive file name is tried directly.
        let cases: &[(&str, &str)] = &[
            ("Makefile", "Makefile"),
            ("Gemfile", "Ruby"),
            ("Rakefile", "Ruby"),
            ("Vagrantfile", "Ruby"),
            ("Cargo.lock", "TOML"),
            ("Pipfile", "TOML"),
            ("Dockerfile", "Dockerfile"),
            ("Containerfile", "Dockerfile"),
        ];

        for (path, expected) in cases {
            assert_eq!(
                describe_file_syntax(Path::new(path)),
                *expected,
                "path={path}"
            );
        }
    }
}
