//! Linear JSON token highlighting without initializing or running a regex grammar.
//! This is a source viewer, not a validator: incomplete and invalid input stays visible.

use syntect::{
    highlighting::{Highlighter, Theme},
    parsing::Scope,
};

pub(super) fn highlight(source: &str, theme: &Theme, highlighter: &Highlighter<'_>) -> String {
    let plain = highlighter.style_for_stack(&[]);
    let style_for = |name| {
        Scope::new(name)
            .map(|scope| highlighter.style_for_stack(&[scope]))
            .unwrap_or(plain)
    };
    let string = style_for("string.quoted.double.json");
    let key = style_for("support.type.property-name.json");
    let number = style_for("constant.numeric.json");
    let constant = style_for("constant.language.json");
    let bytes = source.as_bytes();
    let mut writer = super::render::HtmlWriter::new(theme, source.len());
    let mut cursor = 0;
    while cursor < bytes.len() {
        let start = cursor;
        let style = if bytes[cursor] == b'"' {
            cursor += 1;
            while cursor < bytes.len() {
                match bytes[cursor] {
                    b'\\' => cursor = (cursor + 2).min(bytes.len()),
                    b'"' => {
                        cursor += 1;
                        break;
                    }
                    _ => cursor += 1,
                }
            }
            let mut next = cursor;
            while next < bytes.len() && bytes[next].is_ascii_whitespace() {
                next += 1;
            }
            if bytes.get(next) == Some(&b':') {
                key
            } else {
                string
            }
        } else if is_separator(bytes[cursor]) {
            cursor += 1;
            while cursor < bytes.len() && is_separator(bytes[cursor]) {
                cursor += 1;
            }
            plain
        } else {
            cursor += 1;
            while cursor < bytes.len() && !is_separator(bytes[cursor]) && bytes[cursor] != b'"' {
                cursor += 1;
            }
            match &source[start..cursor] {
                "true" | "false" | "null" => constant,
                _ if bytes[start].is_ascii_digit() || bytes[start] == b'-' => number,
                _ => plain,
            }
        };
        // All boundaries are ASCII delimiters or EOF, including for malformed Unicode text.
        if writer.append(style, &source[start..cursor]).is_err() {
            return super::escaped_fallback(source);
        }
    }

    writer.finish()
}

fn is_separator(byte: u8) -> bool {
    byte.is_ascii_whitespace() || matches!(byte, b'{' | b'}' | b'[' | b']' | b',' | b':')
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::super::{describe_file_syntax, highlight_file_source, SyntaxUiTheme};

    fn text_content(html: &str) -> String {
        let mut in_tag = false;
        let mut text = String::new();
        for ch in html.chars() {
            match ch {
                '<' => in_tag = true,
                '>' => in_tag = false,
                _ if !in_tag => text.push(ch),
                _ => {}
            }
        }
        text.strip_prefix('\n')
            .unwrap_or(&text)
            .strip_suffix('\n')
            .unwrap_or(&text)
            .replace("&quot;", "\"")
            .replace("&#39;", "'")
            .replace("&lt;", "<")
            .replace("&gt;", ">")
            .replace("&amp;", "&")
    }

    #[test]
    fn preserves_source_and_escapes_html_for_both_themes() {
        let sources = [
            "",
            "\r\n  {\"key\" : [true, false, null, -12.34e+56]}\r\n",
            r#"{"escaped":"a\"b\\c\u0041","unicode":"日本語","tag":"<script>&quot;&</script>"}"#,
            "{\"unterminated",
        ];
        for source in sources {
            for theme in [SyntaxUiTheme::Dark, SyntaxUiTheme::Light] {
                let html = highlight_file_source(source, Path::new("sample.JSON"), theme);
                assert_eq!(text_content(&html), source);
                assert!(!html.contains("<script>"));
            }
        }
        assert_eq!(describe_file_syntax(Path::new("sample.JSON")), "JSON");
    }

    #[test]
    fn long_strings_and_malformed_unicode_do_not_fragment_or_drop_text() {
        let source = format!("{{\"value\":\"{}\"}}", "x\\\"日本語<&".repeat(20_000));
        let html = highlight_file_source(&source, Path::new("sample.json"), SyntaxUiTheme::Dark);
        assert_eq!(text_content(&html), source);
        assert!(html.matches("<span").count() < 10);
        for source in [
            "\"\\日",
            "\"\\",
            "日{\"broken\n<>\\é\"",
            "[tru, -oops, nullish]",
        ] {
            let html = highlight_file_source(source, Path::new("sample.json"), SyntaxUiTheme::Dark);
            assert_eq!(text_content(&html), source);
        }
    }

    #[test]
    fn themes_produce_distinct_token_styles() {
        let source = r#"{"key":"value","number":1,"flag":true}"#;
        let dark = highlight_file_source(source, Path::new("sample.json"), SyntaxUiTheme::Dark);
        let light = highlight_file_source(source, Path::new("sample.json"), SyntaxUiTheme::Light);
        assert_ne!(dark, light);
        assert!(dark.matches("<span").count() >= 5);
        assert!(light.matches("<span").count() >= 5);
    }
}
