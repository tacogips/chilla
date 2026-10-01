//! Lenient, token-based CSS/SCSS/LESS re-indenter.
//!
//! Never fails: this is a best-effort beautifier, not a validator. Strings,
//! comments, and the contents of `url(...)`/other function calls are copied
//! verbatim; only block/declaration layout (indentation, one declaration
//! per line, selector-list line breaks) is rewritten. Nesting is tracked
//! with a plain depth counter (no stack of per-level state is needed, since
//! CSS blocks are anonymous `{ ... }`, unlike XML/HTML's named tags), so
//! this is linear time with no recursion.

enum Terminator {
    OpenBrace,
    CloseBrace,
    Semicolon,
    Eof,
}

struct Item<'a> {
    /// Raw text since the previous terminator (comments embedded verbatim).
    chunk: &'a str,
    terminator: Terminator,
}

/// Re-indents a CSS/SCSS/LESS source. Always succeeds.
pub(super) fn format_css(source: &str) -> String {
    let items = tokenize(source);
    let mut output = String::with_capacity(source.len());
    let mut depth: usize = 0;

    for item in items {
        let (rest, comments) = split_comments(item.chunk);
        for comment in &comments {
            push_indent(&mut output, depth);
            output.push_str(comment);
            output.push('\n');
        }
        let trimmed = rest.trim();

        match item.terminator {
            Terminator::OpenBrace => {
                if trimmed.is_empty() {
                    push_indent(&mut output, depth);
                } else {
                    render_selector_lines(&mut output, depth, trimmed);
                }
                output.push_str(" {\n");
                depth += 1;
            }
            Terminator::Semicolon => {
                if !trimmed.is_empty() {
                    render_declaration_line(&mut output, depth, trimmed);
                }
            }
            Terminator::CloseBrace => {
                if !trimmed.is_empty() {
                    render_declaration_line(&mut output, depth, trimmed);
                }
                depth = depth.saturating_sub(1);
                push_indent(&mut output, depth);
                output.push_str("}\n");
                if depth == 0 {
                    output.push('\n');
                }
            }
            Terminator::Eof => {
                if !trimmed.is_empty() {
                    render_declaration_line(&mut output, depth, trimmed);
                }
            }
        }
    }

    let trimmed_output = output.trim_end();
    if trimmed_output.is_empty() {
        String::new()
    } else {
        format!("{trimmed_output}\n")
    }
}

fn push_indent(output: &mut String, depth: usize) {
    output.push_str(&"  ".repeat(depth));
}

fn render_selector_lines(output: &mut String, depth: usize, selector_text: &str) {
    let parts = split_top_level(selector_text, b',');
    for (index, part) in parts.iter().enumerate() {
        if index > 0 {
            output.push_str(",\n");
        }
        push_indent(output, depth);
        output.push_str(part.trim());
    }
}

/// Normalizes `prop:value` to `prop: value`, only when a top-level colon is
/// found (declarations); selectors are never passed here, and at-rules
/// without a colon (`@import "x";`) are emitted verbatim.
fn render_declaration_line(output: &mut String, depth: usize, text: &str) {
    push_indent(output, depth);
    match find_top_level_colon(text) {
        Some(colon_pos) => {
            let prop = text[..colon_pos].trim();
            let value = text[colon_pos + 1..].trim();
            output.push_str(prop);
            output.push_str(": ");
            output.push_str(value);
        }
        None => output.push_str(text.trim()),
    }
    output.push_str(";\n");
}

/// Extracts `/* ... */` comments from `chunk`, returning the remaining text
/// (comments removed) and the comments in source order.
fn split_comments(chunk: &str) -> (String, Vec<&str>) {
    let mut rest = String::with_capacity(chunk.len());
    let mut comments = Vec::new();
    let mut pos = 0usize;
    loop {
        match chunk[pos..].find("/*") {
            Some(offset) => {
                let start = pos + offset;
                rest.push_str(&chunk[pos..start]);
                let end = chunk[start..]
                    .find("*/")
                    .map_or(chunk.len(), |o| start + o + 2);
                comments.push(&chunk[start..end]);
                pos = end;
            }
            None => {
                rest.push_str(&chunk[pos..]);
                break;
            }
        }
    }
    (rest, comments)
}

/// Splits `text` at top-level occurrences of `separator` (not inside a
/// string or `(...)`/`[...]`).
fn split_top_level(text: &str, separator: u8) -> Vec<&str> {
    let bytes = text.as_bytes();
    let mut parts = Vec::new();
    let mut depth = 0i32;
    let mut in_string: Option<u8> = None;
    let mut start = 0usize;
    let mut i = 0usize;
    while i < bytes.len() {
        let byte = bytes[i];
        match in_string {
            Some(quote) => {
                i = advance_past_string_byte(text, i, byte, quote, &mut in_string);
            }
            None => match byte {
                b'\'' | b'"' => {
                    in_string = Some(byte);
                    i += 1;
                }
                b'(' | b'[' => {
                    depth += 1;
                    i += 1;
                }
                b')' | b']' => {
                    depth -= 1;
                    i += 1;
                }
                _ if byte == separator && depth <= 0 => {
                    parts.push(&text[start..i]);
                    i += 1;
                    start = i;
                }
                _ => i += 1,
            },
        }
    }
    parts.push(&text[start..]);
    parts
}

fn find_top_level_colon(text: &str) -> Option<usize> {
    let bytes = text.as_bytes();
    let mut depth = 0i32;
    let mut in_string: Option<u8> = None;
    let mut i = 0usize;
    while i < bytes.len() {
        let byte = bytes[i];
        match in_string {
            Some(quote) => {
                i = advance_past_string_byte(text, i, byte, quote, &mut in_string);
            }
            None => match byte {
                b'\'' | b'"' => {
                    in_string = Some(byte);
                    i += 1;
                }
                b'(' => {
                    depth += 1;
                    i += 1;
                }
                b')' => {
                    depth -= 1;
                    i += 1;
                }
                b':' if depth <= 0 => return Some(i),
                _ => i += 1,
            },
        }
    }
    None
}

/// Advances past one byte while inside a string, handling `\`-escapes with
/// full UTF-8 char width (not a fixed byte count) and closing the string on
/// an unescaped matching quote.
fn advance_past_string_byte(
    text: &str,
    i: usize,
    byte: u8,
    quote: u8,
    in_string: &mut Option<u8>,
) -> usize {
    if byte == b'\\' {
        let mut next = i + 1;
        if next < text.len() {
            next += text[next..].chars().next().map_or(1, char::len_utf8);
        }
        return next;
    }
    if byte == quote {
        *in_string = None;
    }
    i + 1
}

fn tokenize(source: &str) -> Vec<Item<'_>> {
    let bytes = source.as_bytes();
    let len = bytes.len();
    let mut items = Vec::new();
    let mut i = 0usize;
    let mut chunk_start = 0usize;
    let mut paren_depth = 0i32;
    let mut in_string: Option<u8> = None;

    while i < len {
        let byte = bytes[i];
        match in_string {
            Some(quote) => {
                i = advance_past_string_byte(source, i, byte, quote, &mut in_string);
            }
            None => {
                if byte == b'/' && bytes.get(i + 1) == Some(&b'*') {
                    let end = source[i..].find("*/").map_or(len, |offset| i + offset + 2);
                    i = end;
                    continue;
                }
                match byte {
                    b'\'' | b'"' => {
                        in_string = Some(byte);
                        i += 1;
                    }
                    b'(' => {
                        paren_depth += 1;
                        i += 1;
                    }
                    b')' => {
                        paren_depth -= 1;
                        i += 1;
                    }
                    b'{' if paren_depth <= 0 => {
                        items.push(Item {
                            chunk: &source[chunk_start..i],
                            terminator: Terminator::OpenBrace,
                        });
                        i += 1;
                        chunk_start = i;
                    }
                    b'}' if paren_depth <= 0 => {
                        items.push(Item {
                            chunk: &source[chunk_start..i],
                            terminator: Terminator::CloseBrace,
                        });
                        i += 1;
                        chunk_start = i;
                    }
                    b';' if paren_depth <= 0 => {
                        items.push(Item {
                            chunk: &source[chunk_start..i],
                            terminator: Terminator::Semicolon,
                        });
                        i += 1;
                        chunk_start = i;
                    }
                    _ => i += 1,
                }
            }
        }
    }

    if chunk_start < len {
        items.push(Item {
            chunk: &source[chunk_start..],
            terminator: Terminator::Eof,
        });
    }

    items
}

#[cfg(test)]
mod tests {
    use super::format_css;

    fn strip_ws(s: &str) -> String {
        s.chars().filter(|c| !c.is_whitespace()).collect()
    }

    #[test]
    fn minified_css_gets_one_declaration_per_line() {
        let source = "a{color:red;background:blue}.b,.c{margin:0}";
        let formatted = format_css(source);
        assert_eq!(
            formatted,
            "a {\n  color: red;\n  background: blue;\n}\n\n.b,\n.c {\n  margin: 0;\n}\n"
        );
    }

    #[test]
    fn media_query_nesting_indents_the_inner_rule() {
        let source = "@media (min-width: 600px) { .a { color: red; } }";
        let formatted = format_css(source);
        assert!(formatted.contains("@media (min-width: 600px) {\n  .a {\n    color: red;\n  }\n}"));
    }

    #[test]
    fn scss_nested_selectors_indent_correctly() {
        let source = ".parent { color: red; .child:hover { color: blue; } }";
        let formatted = format_css(source);
        assert!(formatted
            .contains(".parent {\n  color: red;\n  .child:hover {\n    color: blue;\n  }\n}"));
    }

    #[test]
    fn strings_comments_and_url_are_preserved_verbatim() {
        let source = r#"a { content: "a { b; } c"; background: url(data:image/png;base64,ABC==); /* keep me */ }"#;
        let formatted = format_css(source);
        assert!(formatted.contains(r#"content: "a { b; } c";"#));
        assert!(formatted.contains("background: url(data:image/png;base64,ABC==);"));
        assert!(formatted.contains("/* keep me */"));
    }

    #[test]
    fn pseudo_selector_colons_are_not_mangled() {
        let formatted = format_css("a:hover, a:focus { color: red; }");
        assert!(formatted.starts_with("a:hover,\na:focus {"));
    }

    #[test]
    fn blank_line_separates_top_level_rules_but_not_nested_ones() {
        let formatted = format_css(".a { color: red; } .b { color: blue; }");
        assert!(formatted.contains("}\n\n.b"));
        let nested = format_css(".a { .b { color: red; } .c { color: blue; } }");
        assert!(!nested.contains("}\n\n  .c"));
    }

    #[test]
    fn no_text_is_lost_ignoring_whitespace() {
        let source = ".a, .b:hover { color: red; /* c */ background: url(x;y); }";
        let formatted = format_css(source);
        // All non-whitespace source content survives somewhere in the output.
        for token in [
            ".a",
            ".b:hover",
            "color",
            "red",
            "/*c*/",
            "background",
            "url(x;y)",
        ] {
            assert!(
                strip_ws(&formatted).contains(&strip_ws(token)),
                "missing {token:?} in {formatted}"
            );
        }
    }

    #[test]
    fn never_fails_on_malformed_css() {
        for source in ["a {", "a { color", "}}}", "", "/* unterminated"] {
            let _ = format_css(source);
        }
    }
}
