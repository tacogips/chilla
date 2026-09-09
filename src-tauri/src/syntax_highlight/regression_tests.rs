use std::path::Path;

use syntect::{
    html::highlighted_html_for_string,
    parsing::{SyntaxDefinition, SyntaxSet},
};

use super::{
    highlight_file_source, highlight_markdown_fence, resolve_syntax, syntax_set, syntect_theme,
    SyntaxUiTheme,
};

#[test]
fn exhaustive_inventory_and_all_grammar_outputs_remain_exact() {
    let baseline: serde_json::Value = serde_json::from_str(include_str!(
        "../../examples/support/exhaustive_baseline.json"
    ))
    .unwrap();
    let inventory: serde_json::Value = serde_json::from_str(include_str!(
        "../../examples/support/exhaustive_inventory.json"
    ))
    .unwrap();
    let fixtures: std::collections::BTreeMap<String, String> = serde_json::from_str(include_str!(
        "../../examples/support/exhaustive_fixtures.json"
    ))
    .unwrap();
    assert_eq!(
        serde_json::to_value(super::diagnostics::inventory()).unwrap(),
        inventory
    );
    let scopes: std::collections::BTreeSet<_> = syntax_set()
        .syntaxes()
        .iter()
        .map(|syntax| syntax.scope.to_string())
        .collect();
    assert_eq!(scopes, fixtures.keys().cloned().collect());
    assert_eq!(baseline["entries"].as_array().unwrap().len(), scopes.len());
    let baseline_scopes: std::collections::BTreeSet<_> = baseline["entries"]
        .as_array()
        .unwrap()
        .iter()
        .map(|entry| entry["scope"].as_str().unwrap().to_string())
        .collect();
    assert_eq!(baseline_scopes, scopes);
    for entry in baseline["entries"].as_array().unwrap() {
        let themes: std::collections::BTreeSet<_> = entry["measurements"]
            .as_array()
            .unwrap()
            .iter()
            .map(|measurement| measurement["theme"].as_str().unwrap())
            .collect();
        assert_eq!(themes, ["dark", "light"].into_iter().collect());
        let scope: syntect::parsing::Scope = entry["scope"].as_str().unwrap().parse().unwrap();
        let syntax = syntax_set().find_syntax_by_scope(scope).unwrap();
        assert_eq!(syntax.name, entry["name"].as_str().unwrap());
        let seed = &fixtures[entry["scope"].as_str().unwrap()];
        let source = seed.repeat(8192_usize.div_ceil(seed.len()));
        assert_eq!(
            blake3::hash(source.as_bytes()).to_string(),
            entry["source_hash"].as_str().unwrap()
        );
        for measurement in entry["measurements"].as_array().unwrap() {
            let theme = SyntaxUiTheme::parse(measurement["theme"].as_str().unwrap());
            let html = super::render::highlight(
                &source,
                syntax_set(),
                syntax,
                syntect_theme(theme),
                super::theme_highlighter(theme),
            )
            .unwrap();
            assert_eq!(
                blake3::hash(html.as_bytes()).to_string(),
                measurement["html_hash"].as_str().unwrap(),
                "{} {:?}",
                syntax.name,
                theme
            );
            assert_eq!(text_content(&html), source);
        }
    }
}

#[path = "../../examples/support/syntax_fixtures.rs"]
mod syntax_fixtures;

#[test]
fn shared_language_matrix_preserves_original_html_in_both_themes() {
    let baseline: serde_json::Value = serde_json::from_str(include_str!(
        "../../examples/support/syntax_fingerprints.json"
    ))
    .unwrap();
    for language in syntax_fixtures::LANGUAGES {
        let (extension, source) = syntax_fixtures::fixture(language).unwrap();
        let expected = &baseline[language];
        assert_eq!(
            source.len(),
            expected["source_bytes"].as_u64().unwrap() as usize
        );
        assert_eq!(
            blake3::hash(source.as_bytes()).to_hex().as_str(),
            expected["source_hash"].as_str().unwrap()
        );
        for (theme, name) in [
            (SyntaxUiTheme::Dark, "dark"),
            (SyntaxUiTheme::Light, "light"),
        ] {
            let html =
                highlight_file_source(&source, Path::new(&format!("fixture.{extension}")), theme);
            assert_eq!(
                blake3::hash(html.as_bytes()).to_hex().as_str(),
                expected[name]["html_hash"].as_str().unwrap(),
                "language={language} theme={name}"
            );
        }
    }
}

#[test]
fn packed_syntaxes_preserve_multiline_and_embedded_contexts() {
    let mut builder = SyntaxSet::load_defaults_newlines().into_builder();
    builder.add(
        SyntaxDefinition::load_from_str(
            include_str!("../../syntaxes/TOML.sublime-syntax"),
            true,
            Some("TOML.sublime-syntax"),
        )
        .unwrap(),
    );
    let original = builder.build();
    assert_eq!(syntax_set().syntaxes().len(), original.syntaxes().len());
    let cases = [
        ("rs", "/* unfinished 日本語\n<>&"),
        ("js", "const text = `unfinished 日本語\n${1 +"),
        ("toml", "text = \"\"\"unfinished 日本語\n<>&"),
        ("rs", "/* multiline\ncomment */\nlet s = r#\"日本語\n<>&\"#;"),
        ("py", "text = \"\"\"日本語\n<>&\n\"\"\"\nprint(text)\n"),
        ("sh", "cat <<'END'\n日本語 <>&\nEND\nprintf '%s' done\n"),
        ("toml", "text = \"\"\"日本語\n<>&\"\"\"\nenabled = true\n"),
        ("js", "const text = `日本語\n${1 + 2} <>&`;\nconsole.log(text);"),
        ("yaml", "text: |\n  日本語 <>&\n  second line\nenabled: true\n"),
        ("html", "<style>\n.item { color: red; }\n</style>\n<script>\nconst s = `日本語 ${1}`;\n</script>\n"),
        ("xml", "<root>\n<![CDATA[日本語 <>&]]>\n</root>\n"),
        ("md", "# Heading\n\n```toml\nenabled = true\n```\n\n日本語 <>&"),
    ];
    for (extension, source) in cases {
        for theme in [SyntaxUiTheme::Dark, SyntaxUiTheme::Light] {
            for source in [source.to_string(), source.replace('\n', "\r\n")] {
                let path = format!("fixture.{extension}");
                let syntax = resolve_syntax(&original, None, Some(Path::new(&path)), Some(&source));
                let expected =
                    highlighted_html_for_string(&source, &original, syntax, syntect_theme(theme))
                        .unwrap();
                let actual = highlight_file_source(&source, Path::new(&path), theme);
                assert_eq!(actual, expected, "extension={extension} theme={theme:?}");
                assert_eq!(text_content(&actual), source);
            }
        }
    }
}

#[test]
fn fences_aliases_and_first_line_detection_keep_shared_grammar_behavior() {
    for theme in [SyntaxUiTheme::Dark, SyntaxUiTheme::Light] {
        for (extension, language, source) in [
            ("rs", "rust", "fn main() { println!(\"日本語 <>&\"); }\n"),
            ("toml", "toml", "enabled = true\n"),
            ("ts", "typescript", "const value: number = 1;\n"),
        ] {
            assert_eq!(
                highlight_markdown_fence(source, Some(language), theme),
                highlight_file_source(source, Path::new(&format!("fixture.{extension}")), theme)
            );
        }
        let python = "#!/usr/bin/env python3\nprint('日本語 <>&')\n";
        assert_eq!(
            highlight_file_source(python, Path::new("script.unknown"), theme),
            highlight_file_source(python, Path::new("script.py"), theme)
        );
        let plain = "日本語 <>&\r\nplain text without final newline";
        assert_eq!(
            text_content(&highlight_file_source(
                plain,
                Path::new("fixture.unknown"),
                theme
            )),
            plain
        );
    }
}

fn text_content(html: &str) -> String {
    let mut in_tag = false;
    let mut text = String::new();
    for character in html.chars() {
        match character {
            '<' => in_tag = true,
            '>' => in_tag = false,
            _ if !in_tag => text.push(character),
            _ => {}
        }
    }
    text.strip_prefix('\n')
        .unwrap()
        .strip_suffix('\n')
        .unwrap()
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&amp;", "&")
}
