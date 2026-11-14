//! Token-based JSON and JSON Lines formatters.
//!
//! `format_json` never deserializes into a generic map: key order, duplicate
//! keys, string escapes, and numeric spelling are preserved exactly as they
//! appear in the source. Formatting is a single linear pass driven by an
//! explicit stack of open containers, so it is not limited by recursion
//! depth (unlike a naive recursive-descent pretty printer).

use super::{error_at, FormatOutcome};

const INDENT_UNIT: &str = "  ";

struct Frame {
    is_array: bool,
    emitted: usize,
}

enum State {
    Value,
    Key,
    Colon,
    CommaOrClose,
}

/// Pretty-prints a single JSON value with 2-space indentation.
///
/// Returns the formatted text, or an error message naming the 1-based line
/// and column of the first problem (RFC 8259 strict: a single top-level
/// value, no trailing content, no trailing commas).
pub(super) fn format_json(source: &str) -> Result<String, String> {
    let source = source.strip_prefix('\u{feff}').unwrap_or(source);
    let bytes = source.as_bytes();
    let len = bytes.len();

    let mut output = String::with_capacity(source.len());
    let mut stack: Vec<Frame> = Vec::new();
    let mut state = State::Value;
    let mut done = false;
    let mut pos = 0usize;

    loop {
        pos = skip_ws(bytes, pos);

        if done {
            return if pos >= len {
                Ok(output)
            } else {
                Err(error_at(source, pos, "unexpected trailing content"))
            };
        }

        match state {
            State::Value => {
                if matches!(stack.last(), Some(frame) if frame.is_array) {
                    let depth = stack.len();
                    let emitted_before = stack.last().map_or(0, |frame| frame.emitted);
                    if emitted_before > 0 {
                        output.push(',');
                    }
                    output.push('\n');
                    push_indent(&mut output, depth);
                    if let Some(frame) = stack.last_mut() {
                        frame.emitted += 1;
                    }
                }

                let Some(byte) = bytes.get(pos).copied() else {
                    return Err(error_at(source, pos, "unexpected end of input"));
                };
                match byte {
                    b'{' => {
                        pos += 1;
                        let after = skip_ws(bytes, pos);
                        if bytes.get(after) == Some(&b'}') {
                            output.push_str("{}");
                            pos = after + 1;
                            state = close_value(&stack, &mut done);
                        } else {
                            output.push('{');
                            stack.push(Frame {
                                is_array: false,
                                emitted: 0,
                            });
                            state = State::Key;
                        }
                    }
                    b'[' => {
                        pos += 1;
                        let after = skip_ws(bytes, pos);
                        if bytes.get(after) == Some(&b']') {
                            output.push_str("[]");
                            pos = after + 1;
                            state = close_value(&stack, &mut done);
                        } else {
                            output.push('[');
                            stack.push(Frame {
                                is_array: true,
                                emitted: 0,
                            });
                            state = State::Value;
                        }
                    }
                    b'"' => {
                        let (text, next) = parse_string(source, bytes, pos)?;
                        output.push_str(text);
                        pos = next;
                        state = close_value(&stack, &mut done);
                    }
                    b't' => {
                        pos = expect_literal(source, bytes, pos, "true")?;
                        output.push_str("true");
                        state = close_value(&stack, &mut done);
                    }
                    b'f' => {
                        pos = expect_literal(source, bytes, pos, "false")?;
                        output.push_str("false");
                        state = close_value(&stack, &mut done);
                    }
                    b'n' => {
                        pos = expect_literal(source, bytes, pos, "null")?;
                        output.push_str("null");
                        state = close_value(&stack, &mut done);
                    }
                    b'-' | b'0'..=b'9' => {
                        let (text, next) = parse_number(source, bytes, pos)?;
                        output.push_str(text);
                        pos = next;
                        state = close_value(&stack, &mut done);
                    }
                    _ => return Err(error_at(source, pos, "expected a value")),
                }
            }
            State::Key => {
                if bytes.get(pos) != Some(&b'"') {
                    return Err(error_at(source, pos, "expected a string key"));
                }
                let depth = stack.len();
                let emitted_before = stack.last().map_or(0, |frame| frame.emitted);
                if emitted_before > 0 {
                    output.push(',');
                }
                output.push('\n');
                push_indent(&mut output, depth);
                let (text, next) = parse_string(source, bytes, pos)?;
                output.push_str(text);
                pos = next;
                if let Some(frame) = stack.last_mut() {
                    frame.emitted += 1;
                }
                state = State::Colon;
            }
            State::Colon => {
                if bytes.get(pos) != Some(&b':') {
                    return Err(error_at(source, pos, "expected ':' after object key"));
                }
                pos += 1;
                output.push_str(": ");
                state = State::Value;
            }
            State::CommaOrClose => {
                let is_object = matches!(stack.last(), Some(frame) if !frame.is_array);
                let is_array = matches!(stack.last(), Some(frame) if frame.is_array);
                match bytes.get(pos).copied() {
                    Some(b',') => {
                        pos += 1;
                        state = if is_object { State::Key } else { State::Value };
                    }
                    Some(b'}') if is_object => {
                        pos += 1;
                        stack.pop();
                        let depth = stack.len();
                        output.push('\n');
                        push_indent(&mut output, depth);
                        output.push('}');
                        state = close_value(&stack, &mut done);
                    }
                    Some(b']') if is_array => {
                        pos += 1;
                        stack.pop();
                        let depth = stack.len();
                        output.push('\n');
                        push_indent(&mut output, depth);
                        output.push(']');
                        state = close_value(&stack, &mut done);
                    }
                    Some(b'}') | Some(b']') => {
                        return Err(error_at(source, pos, "mismatched closing bracket"));
                    }
                    _ => {
                        return Err(error_at(source, pos, "expected ',' or a closing bracket"));
                    }
                }
            }
        }
    }
}

/// Formats each non-blank line as an independent JSON value, joined with
/// `\n`. Lines that fail to parse are kept verbatim; the returned notice
/// reports how many and the first failing line.
pub(super) fn format_json_lines(source: &str) -> FormatOutcome {
    let source = source.strip_prefix('\u{feff}').unwrap_or(source);
    let mut rendered_lines: Vec<String> = Vec::new();
    let mut failed_count = 0usize;
    let mut first_failure: Option<(usize, String)> = None;

    for (index, raw_line) in source.lines().enumerate() {
        if raw_line.trim().is_empty() {
            continue;
        }
        let source_line_number = index + 1;
        match format_json(raw_line) {
            Ok(formatted) => rendered_lines.push(formatted),
            Err(message) => {
                rendered_lines.push(raw_line.to_string());
                failed_count += 1;
                if first_failure.is_none() {
                    first_failure = Some((source_line_number, message));
                }
            }
        }
    }

    let notice = first_failure.map(|(line_number, message)| {
        let plural = if failed_count == 1 { "" } else { "s" };
        let verb = if failed_count == 1 { "is" } else { "are" };
        format!(
            "{failed_count} line{plural} could not be formatted and {verb} shown as-is (first: line {line_number}: {message})"
        )
    });

    FormatOutcome {
        formatted: Some(rendered_lines.join("\n")),
        notice,
    }
}

/// Decides the next state after a complete value (scalar, or a container
/// that was just opened-and-closed compact, or just fully closed).
fn close_value(stack: &[Frame], done: &mut bool) -> State {
    if stack.is_empty() {
        *done = true;
    }
    State::CommaOrClose
}

/// Appends `depth` indent units. Uses `str::repeat` (which grows by
/// doubling, i.e. `O(log depth)` copies) rather than one `push_str` per
/// unit, since deeply nested documents call this at every level.
fn push_indent(output: &mut String, depth: usize) {
    output.push_str(&INDENT_UNIT.repeat(depth));
}

fn skip_ws(bytes: &[u8], mut pos: usize) -> usize {
    while matches!(bytes.get(pos), Some(b' ' | b'\t' | b'\n' | b'\r')) {
        pos += 1;
    }
    pos
}

/// Parses a JSON string literal starting at `bytes[start] == '"'`. Returns
/// the verbatim slice (including quotes) and the position just past it.
fn parse_string<'a>(
    source: &'a str,
    bytes: &[u8],
    start: usize,
) -> Result<(&'a str, usize), String> {
    let mut i = start + 1;
    loop {
        let Some(&byte) = bytes.get(i) else {
            return Err(error_at(source, start, "unterminated string"));
        };
        match byte {
            b'"' => {
                i += 1;
                break;
            }
            b'\\' => {
                let Some(&escape) = bytes.get(i + 1) else {
                    return Err(error_at(source, i, "unterminated escape sequence"));
                };
                match escape {
                    b'"' | b'\\' | b'/' | b'b' | b'f' | b'n' | b'r' | b't' => i += 2,
                    b'u' => match bytes.get(i + 2..i + 6) {
                        Some(hex) if hex.iter().all(u8::is_ascii_hexdigit) => i += 6,
                        _ => return Err(error_at(source, i, "invalid unicode escape")),
                    },
                    _ => return Err(error_at(source, i, "invalid escape sequence")),
                }
            }
            0x00..=0x1F => {
                return Err(error_at(
                    source,
                    i,
                    "control character must be escaped in a string",
                ))
            }
            _ => {
                let char_len = source[i..].chars().next().map_or(1, char::len_utf8);
                i += char_len;
            }
        }
    }
    Ok((&source[start..i], i))
}

/// Parses an RFC 8259 number literal, returning the verbatim slice so its
/// spelling (e.g. `-0`, `1.0e+10`) is preserved exactly.
fn parse_number<'a>(
    source: &'a str,
    bytes: &[u8],
    start: usize,
) -> Result<(&'a str, usize), String> {
    let mut i = start;
    if bytes.get(i) == Some(&b'-') {
        i += 1;
    }
    match bytes.get(i) {
        Some(b'0') => i += 1,
        Some(b'1'..=b'9') => {
            i += 1;
            while matches!(bytes.get(i), Some(b'0'..=b'9')) {
                i += 1;
            }
        }
        _ => return Err(error_at(source, start, "invalid number")),
    }

    if bytes.get(i) == Some(&b'.') {
        let frac_start = i;
        i += 1;
        let digits_start = i;
        while matches!(bytes.get(i), Some(b'0'..=b'9')) {
            i += 1;
        }
        if i == digits_start {
            return Err(error_at(
                source,
                frac_start,
                "invalid number: expected digits after '.'",
            ));
        }
    }

    if matches!(bytes.get(i), Some(b'e' | b'E')) {
        let exp_start = i;
        i += 1;
        if matches!(bytes.get(i), Some(b'+' | b'-')) {
            i += 1;
        }
        let digits_start = i;
        while matches!(bytes.get(i), Some(b'0'..=b'9')) {
            i += 1;
        }
        if i == digits_start {
            return Err(error_at(
                source,
                exp_start,
                "invalid number: expected digits after exponent",
            ));
        }
    }

    Ok((&source[start..i], i))
}

fn expect_literal(
    source: &str,
    bytes: &[u8],
    start: usize,
    literal: &str,
) -> Result<usize, String> {
    let end = start + literal.len();
    if bytes.get(start..end) == Some(literal.as_bytes()) {
        Ok(end)
    } else {
        Err(error_at(source, start, &format!("expected '{literal}'")))
    }
}

#[cfg(test)]
mod tests {
    use super::{format_json, format_json_lines};

    #[test]
    fn pretty_prints_nested_containers_with_two_space_indent() {
        let source = r#"{"a":[1,2,{"b":true}],"c":{}}"#;
        let formatted = format_json(source).expect("valid JSON");
        assert_eq!(
            formatted,
            "{\n  \"a\": [\n    1,\n    2,\n    {\n      \"b\": true\n    }\n  ],\n  \"c\": {}\n}"
        );
    }

    #[test]
    fn empty_containers_stay_compact() {
        assert_eq!(format_json("{}").unwrap(), "{}");
        assert_eq!(format_json("[]").unwrap(), "[]");
        assert_eq!(
            format_json(r#"{"a":[],"b":{}}"#).unwrap(),
            "{\n  \"a\": [],\n  \"b\": {}\n}"
        );
    }

    #[test]
    fn preserves_key_order_and_duplicate_keys() {
        let source = r#"{"b":1,"a":2,"a":3}"#;
        let formatted = format_json(source).unwrap();
        assert_eq!(formatted, "{\n  \"b\": 1,\n  \"a\": 2,\n  \"a\": 3\n}");
    }

    #[test]
    fn preserves_numeric_spelling_exactly() {
        for number in ["1.0e+10", "-0", "0.0", "-1.5E-3", "10", "0"] {
            let source = format!("[{number}]");
            let formatted = format_json(&source).unwrap();
            assert_eq!(formatted, format!("[\n  {number}\n]"), "for {number}");
        }
    }

    #[test]
    fn preserves_string_escapes_and_unicode_verbatim() {
        let source = r#"{"k":"a\"b\\cA","u":"日本語"}"#;
        let formatted = format_json(source).unwrap();
        assert!(formatted.contains(r#""a\"b\\cA""#));
        assert!(formatted.contains("日本語"));
    }

    #[test]
    fn strips_leading_bom() {
        let source = "\u{feff}{\"a\":1}";
        let formatted = format_json(source).unwrap();
        assert_eq!(formatted, "{\n  \"a\": 1\n}");
        assert!(!formatted.starts_with('\u{feff}'));
    }

    #[test]
    fn scalars_at_top_level_format_without_wrapping() {
        assert_eq!(format_json("42").unwrap(), "42");
        assert_eq!(format_json("\"hi\"").unwrap(), "\"hi\"");
        assert_eq!(format_json("true").unwrap(), "true");
        assert_eq!(format_json("null").unwrap(), "null");
    }

    #[test]
    fn deeply_nested_arrays_do_not_overflow_the_stack() {
        let depth = 10_000;
        let source = format!("{}{}{}", "[".repeat(depth), "1", "]".repeat(depth));
        let formatted = format_json(&source).expect("deeply nested JSON should still format");
        assert!(formatted.starts_with("[\n"));
        assert!(formatted.trim_end().ends_with(']'));
    }

    #[test]
    fn invalid_json_reports_line_and_column() {
        let cases: [(&str, usize, usize); 4] = [
            ("{", 1, 2),
            ("{\"a\":1,}", 1, 8),
            ("[1, 2", 1, 6),
            ("{\n  \"a\": tru}", 2, 8),
        ];
        for (source, expected_line, expected_column) in cases {
            let error = format_json(source).expect_err("expected a formatting error");
            assert!(
                error.contains(&format!("line {expected_line}, column {expected_column}")),
                "source={source:?} error={error}"
            );
        }
    }

    #[test]
    fn trailing_content_after_the_top_level_value_is_an_error() {
        let error = format_json("{}{}").expect_err("trailing content should error");
        assert!(error.contains("trailing content"));
    }

    #[test]
    fn json_lines_skips_blank_lines_and_formats_each_record() {
        let source = "{\"a\":1}\n\n  \n{\"b\":2}\n";
        let outcome = format_json_lines(source);
        assert_eq!(
            outcome.formatted.as_deref(),
            Some("{\n  \"a\": 1\n}\n{\n  \"b\": 2\n}")
        );
        assert!(outcome.notice.is_none());
    }

    #[test]
    fn json_lines_keeps_invalid_lines_verbatim_with_a_notice() {
        let source = "{\"a\":1}\nnot json\n{\"b\":2}\nalso not json\n";
        let outcome = format_json_lines(source);
        let formatted = outcome
            .formatted
            .expect("partial formatting still succeeds");
        assert!(formatted.contains("{\n  \"a\": 1\n}"));
        assert!(formatted.contains("not json"));
        assert!(formatted.contains("{\n  \"b\": 2\n}"));
        assert!(formatted.contains("also not json"));
        let notice = outcome
            .notice
            .expect("expected a partial-formatting notice");
        assert!(notice.starts_with("2 lines could not be formatted and are shown as-is"));
        assert!(notice.contains("line 2"));
    }
}
