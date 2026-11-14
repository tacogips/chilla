//! Lenient, token-based JavaScript/TypeScript beautifier.
//!
//! Never fails. Two modes, chosen by [`looks_already_formatted`] (JSX/TSX
//! always use the first):
//!
//! - **Re-indent only**: line breaks are kept exactly as in the source;
//!   only each line's leading whitespace is recomputed from bracket depth.
//!   Used when the source already looks hand-formatted, and always for
//!   JSX/TSX (this formatter does not understand JSX, so it never tries to
//!   re-break it).
//! - **Re-break**: used for minified-looking input. Lines are rebuilt from
//!   scratch, breaking after `{`, before `}`, and after `;` (except inside
//!   a `for (...)` header).
//!
//! Both modes share one lexer that correctly skips string literals,
//! template literals (including nested `${ }` substitutions, via an
//! explicit stack rather than recursion), line/block comments, and regex
//! literals (previous-significant-token heuristic) — their contents are
//! always copied verbatim and never touched or re-indented internally.
//! Neither mode ever normalizes spacing *within* a line: only structural
//! line breaks and leading indentation are the formatter's concern.

const INDENT_UNIT: &str = "  ";

/// A keyword after which `/` starts a regex literal rather than division.
const REGEX_ALLOWED_KEYWORDS: &[&str] = &[
    "return",
    "typeof",
    "case",
    "do",
    "else",
    "in",
    "of",
    "new",
    "delete",
    "void",
    "throw",
    "instanceof",
    "yield",
    "await",
];

#[derive(Clone, Copy)]
enum Span<'a> {
    Code(&'a str),
    StringLit(&'a str),
    TemplateLit(&'a str),
    LineComment(&'a str),
    BlockComment(&'a str),
    Regex(&'a str),
}

impl<'a> Span<'a> {
    fn text(self) -> &'a str {
        match self {
            Span::Code(s)
            | Span::StringLit(s)
            | Span::TemplateLit(s)
            | Span::LineComment(s)
            | Span::BlockComment(s)
            | Span::Regex(s) => s,
        }
    }

    fn is_code(self) -> bool {
        matches!(self, Span::Code(_))
    }
}

pub(super) fn format_javascript(source: &str, is_jsx: bool) -> String {
    let spans = lex(source);
    let body = if is_jsx || looks_already_formatted(source) {
        render_reindent_only(&spans)
    } else {
        render_rebreak(&spans)
    };
    apply_switch_case_extra_indent(&body)
}

fn looks_already_formatted(source: &str) -> bool {
    if !source.contains('\n') {
        return false;
    }
    let lines: Vec<&str> = source.lines().collect();
    if lines.is_empty() {
        return false;
    }
    let total_len: usize = lines.iter().map(|line| line.chars().count()).sum();
    let avg_len = total_len / lines.len();
    let has_indentation = lines
        .iter()
        .any(|line| line.starts_with(' ') || line.starts_with('\t'));
    avg_len < 200 && has_indentation
}

fn char_len_at(source: &str, i: usize) -> usize {
    source[i..].chars().next().map_or(1, char::len_utf8)
}

// ---------------------------------------------------------------------
// Lexer
// ---------------------------------------------------------------------

fn lex(source: &str) -> Vec<Span<'_>> {
    let bytes = source.as_bytes();
    let len = bytes.len();
    let mut spans = Vec::new();
    let mut i = 0usize;
    let mut code_start = 0usize;
    let mut prev = Prev::Start;

    while i < len {
        let byte = bytes[i];
        match byte {
            b'\'' | b'"' => {
                if code_start < i {
                    spans.push(Span::Code(&source[code_start..i]));
                }
                let end = skip_string_literal(source, i);
                spans.push(Span::StringLit(&source[i..end]));
                prev = Prev::Value;
                i = end;
                code_start = i;
            }
            b'`' => {
                if code_start < i {
                    spans.push(Span::Code(&source[code_start..i]));
                }
                let end = scan_template_literal(source, i);
                spans.push(Span::TemplateLit(&source[i..end]));
                prev = Prev::Value;
                i = end;
                code_start = i;
            }
            b'/' if bytes.get(i + 1) == Some(&b'/') => {
                if code_start < i {
                    spans.push(Span::Code(&source[code_start..i]));
                }
                let end = source[i..].find('\n').map_or(len, |offset| i + offset);
                spans.push(Span::LineComment(&source[i..end]));
                i = end;
                code_start = i;
            }
            b'/' if bytes.get(i + 1) == Some(&b'*') => {
                if code_start < i {
                    spans.push(Span::Code(&source[code_start..i]));
                }
                let end = source[i..].find("*/").map_or(len, |offset| i + offset + 2);
                spans.push(Span::BlockComment(&source[i..end]));
                i = end;
                code_start = i;
            }
            b'/' if prev.allows_regex() => {
                if code_start < i {
                    spans.push(Span::Code(&source[code_start..i]));
                }
                match scan_regex_literal(source, i) {
                    Some(end) => {
                        spans.push(Span::Regex(&source[i..end]));
                        prev = Prev::Value;
                        i = end;
                    }
                    None => {
                        prev = Prev::OperatorOrPunct;
                        i += 1;
                    }
                }
                code_start = i;
            }
            _ => {
                if !byte.is_ascii_whitespace() {
                    prev = classify_byte(source, i, prev);
                }
                i += char_len_at(source, i);
            }
        }
    }
    if code_start < len {
        spans.push(Span::Code(&source[code_start..]));
    }
    spans
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Prev {
    Start,
    OperatorOrPunct,
    Keyword,
    Value,
}

impl Prev {
    fn allows_regex(self) -> bool {
        !matches!(self, Prev::Value)
    }
}

/// Updates the "previous significant token" classification used for the
/// regex/division heuristic, given the byte at `i` (already known to be
/// non-whitespace and not the start of a string/template/comment/regex).
fn classify_byte(source: &str, i: usize, prev: Prev) -> Prev {
    let ch = source[i..].chars().next().unwrap_or(' ');
    if ch.is_alphanumeric() || ch == '_' || ch == '$' {
        // Only classify at the START of a word/number to avoid re-scanning
        // every character of a multi-char identifier.
        let prev_ch = source[..i].chars().next_back();
        let is_word_start = !prev_ch.is_some_and(|p| p.is_alphanumeric() || p == '_' || p == '$');
        if !is_word_start {
            return prev;
        }
        let word_end = source[i..]
            .char_indices()
            .find(|(_, c)| !(c.is_alphanumeric() || *c == '_' || *c == '$'))
            .map_or(source.len(), |(offset, _)| i + offset);
        let word = &source[i..word_end];
        if REGEX_ALLOWED_KEYWORDS.contains(&word) {
            Prev::Keyword
        } else {
            Prev::Value
        }
    } else if ch == ')' || ch == ']' {
        Prev::Value
    } else {
        Prev::OperatorOrPunct
    }
}

fn skip_string_literal(source: &str, start: usize) -> usize {
    let bytes = source.as_bytes();
    let len = bytes.len();
    let quote = bytes[start];
    let mut i = start + 1;
    while i < len {
        let byte = bytes[i];
        if byte == b'\\' {
            i += 1;
            if i < len {
                i += char_len_at(source, i);
            }
            continue;
        }
        if byte == quote {
            return i + 1;
        }
        if byte == b'\n' {
            return i;
        }
        i += char_len_at(source, i);
    }
    len
}

fn scan_regex_literal(source: &str, start: usize) -> Option<usize> {
    let bytes = source.as_bytes();
    let len = bytes.len();
    let mut i = start + 1;
    let mut in_class = false;
    while i < len {
        let byte = bytes[i];
        if byte == b'\n' {
            return None;
        }
        if byte == b'\\' {
            i += 1;
            if i < len {
                i += char_len_at(source, i);
            }
            continue;
        }
        match byte {
            b'[' => {
                in_class = true;
                i += 1;
            }
            b']' => {
                in_class = false;
                i += 1;
            }
            b'/' if !in_class => {
                i += 1;
                while i < len && bytes[i].is_ascii_alphabetic() {
                    i += 1;
                }
                return Some(i);
            }
            _ => i += char_len_at(source, i),
        }
    }
    None
}

/// Scans a template literal (starting at the opening backtick), correctly
/// skipping nested `${ ... }` substitutions — which may themselves contain
/// strings, comments, and further nested template literals — via an
/// explicit stack rather than recursive descent.
fn scan_template_literal(source: &str, start: usize) -> usize {
    enum Frame {
        TemplateBody,
        Substitution { brace_depth: i32 },
    }
    let bytes = source.as_bytes();
    let len = bytes.len();
    let mut stack = vec![Frame::TemplateBody];
    let mut i = start + 1;
    while i < len {
        let Some(top) = stack.last_mut() else {
            break;
        };
        let byte = bytes[i];
        match top {
            Frame::TemplateBody => match byte {
                b'\\' => {
                    i += 1;
                    if i < len {
                        i += char_len_at(source, i);
                    }
                }
                b'`' => {
                    i += 1;
                    stack.pop();
                }
                b'$' if bytes.get(i + 1) == Some(&b'{') => {
                    i += 2;
                    stack.push(Frame::Substitution { brace_depth: 0 });
                }
                _ => i += char_len_at(source, i),
            },
            Frame::Substitution { brace_depth } => match byte {
                b'{' => {
                    *brace_depth += 1;
                    i += 1;
                }
                b'}' => {
                    if *brace_depth == 0 {
                        i += 1;
                        stack.pop();
                    } else {
                        *brace_depth -= 1;
                        i += 1;
                    }
                }
                b'`' => {
                    i += 1;
                    stack.push(Frame::TemplateBody);
                }
                b'\'' | b'"' => {
                    i = skip_string_literal(source, i);
                }
                b'/' if bytes.get(i + 1) == Some(&b'/') => {
                    i = source[i..].find('\n').map_or(len, |offset| i + offset);
                }
                b'/' if bytes.get(i + 1) == Some(&b'*') => {
                    i = source[i..].find("*/").map_or(len, |offset| i + offset + 2);
                }
                _ => i += char_len_at(source, i),
            },
        }
    }
    i
}

fn push_indent(output: &mut String, depth: i32) {
    output.push_str(&INDENT_UNIT.repeat(depth.max(0) as usize));
}

// ---------------------------------------------------------------------
// Re-indent-only mode
// ---------------------------------------------------------------------

/// Keeps every original line break; only recomputes each line's leading
/// indentation from bracket depth (lines starting with a closing bracket
/// are dedented one level). Everything else — intra-line spacing, and the
/// full verbatim content of strings/templates/comments/regex — is left
/// completely untouched.
fn render_reindent_only(spans: &[Span<'_>]) -> String {
    let mut output = String::new();
    let mut depth: i32 = 0;
    let mut at_line_start = true;

    for span in spans {
        if !span.is_code() {
            if at_line_start {
                let close_first = span.text().trim_start().starts_with(['}', ')', ']']);
                push_indent(&mut output, if close_first { depth - 1 } else { depth });
            }
            let text = span.text();
            output.push_str(text);
            at_line_start = text.ends_with('\n');
            continue;
        }

        let text = span.text();
        let bytes = text.as_bytes();
        let mut i = 0usize;
        while i < bytes.len() {
            let byte = bytes[i];
            if at_line_start {
                if byte == b'\n' {
                    output.push('\n');
                    i += 1;
                    continue;
                }
                if byte == b' ' || byte == b'\t' {
                    i += 1;
                    continue;
                }
                let close_first = matches!(byte, b'}' | b')' | b']');
                push_indent(&mut output, if close_first { depth - 1 } else { depth });
                at_line_start = false;
                continue;
            }
            match byte {
                b'{' | b'(' | b'[' => depth += 1,
                b'}' | b')' | b']' => depth -= 1,
                b'\n' => {
                    output.push('\n');
                    at_line_start = true;
                    i += 1;
                    continue;
                }
                _ => {}
            }
            let char_len = char_len_at(text, i);
            output.push_str(&text[i..i + char_len]);
            i += char_len;
        }
    }

    output
}

// ---------------------------------------------------------------------
// Re-break mode
// ---------------------------------------------------------------------

enum Terminator {
    OpenBrace,
    CloseBrace,
    Semicolon,
    Eof,
}

struct Item {
    chunk: String,
    terminator: Terminator,
}

/// Rebuilds line breaks from scratch: splits on top-level `{`, `}`, `;`
/// (skipping semicolons inside a `for (...)` header), tracking depth with a
/// plain counter (no named-tag matching is needed, unlike HTML/XML).
fn render_rebreak(spans: &[Span<'_>]) -> String {
    let items = tokenize_structural(spans);
    let mut output = String::new();
    let mut depth: i32 = 0;
    let mut index = 0usize;

    while index < items.len() {
        let item = &items[index];
        let trimmed = item.chunk.trim();

        match item.terminator {
            Terminator::OpenBrace => {
                let is_empty_block = trimmed.is_empty()
                    && matches!(
                        items.get(index + 1).map(|next| &next.terminator),
                        Some(Terminator::CloseBrace)
                    )
                    && items
                        .get(index + 1)
                        .is_some_and(|next| next.chunk.trim().is_empty());
                if output.ends_with('\n') || output.is_empty() {
                    push_indent(&mut output, depth);
                }
                if !trimmed.is_empty() {
                    output.push_str(trimmed);
                    output.push(' ');
                }
                output.push('{');
                if is_empty_block {
                    output.push('}');
                    output.push('\n');
                    index += 2;
                    continue;
                }
                output.push('\n');
                depth += 1;
            }
            Terminator::Semicolon => {
                if output.ends_with('\n') || output.is_empty() {
                    push_indent(&mut output, depth);
                }
                if !trimmed.is_empty() {
                    output.push_str(trimmed);
                }
                output.push_str(";\n");
            }
            Terminator::CloseBrace => {
                if !trimmed.is_empty() {
                    // Trailing content before `}` with no `;` of its own —
                    // could be a statement missing its (ASI-optional)
                    // semicolon, or the last property of an object
                    // literal, so no semicolon is invented either way.
                    if output.ends_with('\n') || output.is_empty() {
                        push_indent(&mut output, depth);
                    }
                    output.push_str(trimmed);
                    output.push('\n');
                }
                depth = (depth - 1).max(0);
                push_indent(&mut output, depth);
                output.push('}');

                let glued = glued_after_brace(&items, index + 1);
                match glued {
                    Some(GlueKind::Space) => {
                        output.push(' ');
                    }
                    Some(GlueKind::None) => {}
                    None => output.push('\n'),
                }
            }
            Terminator::Eof => {
                if !trimmed.is_empty() {
                    if output.ends_with('\n') || output.is_empty() {
                        push_indent(&mut output, depth);
                    }
                    output.push_str(trimmed);
                    output.push('\n');
                }
            }
        }
        index += 1;
    }

    output
}

enum GlueKind {
    Space,
    None,
}

/// After a `}`, decides whether the next item stays glued on the same
/// line: `,`/`;` (immediately, e.g. `};` or `},`) with no space, or
/// `else`/`catch`/`finally`/`while` with one space.
fn glued_after_brace(items: &[Item], next_index: usize) -> Option<GlueKind> {
    let next = items.get(next_index)?;
    let trimmed_start = next.chunk.trim_start();
    if trimmed_start.starts_with(',') {
        return Some(GlueKind::None);
    }
    if matches!(next.terminator, Terminator::Semicolon) && next.chunk.trim().is_empty() {
        return Some(GlueKind::None);
    }
    for keyword in ["else", "catch", "finally", "while"] {
        if let Some(rest) = trimmed_start.strip_prefix(keyword) {
            if rest
                .chars()
                .next()
                .is_none_or(|ch| !(ch.is_alphanumeric() || ch == '_' || ch == '$'))
            {
                return Some(GlueKind::Space);
            }
        }
    }
    None
}

/// Flattens the lexer spans into structural items, splitting only on
/// top-level `{`, `}`, `;` found within `Code` spans — verbatim spans
/// (strings/templates/comments/regex) are appended into the current chunk
/// unconditionally, exactly as encountered. A `;` inside a `for (...)`
/// header (tracked via paren depth recorded when `for` opens its parens)
/// does not terminate a chunk.
fn tokenize_structural(spans: &[Span<'_>]) -> Vec<Item> {
    let mut items = Vec::new();
    let mut chunk = String::new();
    let mut paren_depth: i32 = 0;
    let mut for_header_depths: Vec<i32> = Vec::new();

    for span in spans {
        if !span.is_code() {
            chunk.push_str(span.text());
            continue;
        }
        let text = span.text();
        let bytes = text.as_bytes();
        let mut i = 0usize;
        while i < bytes.len() {
            let byte = bytes[i];
            match byte {
                b'(' => {
                    let before_word = last_word(&chunk);
                    if before_word == "for" {
                        for_header_depths.push(paren_depth);
                    }
                    paren_depth += 1;
                    chunk.push('(');
                    i += 1;
                }
                b')' => {
                    paren_depth -= 1;
                    if for_header_depths.last() == Some(&paren_depth) {
                        for_header_depths.pop();
                    }
                    chunk.push(')');
                    i += 1;
                }
                b'{' => {
                    items.push(Item {
                        chunk: std::mem::take(&mut chunk),
                        terminator: Terminator::OpenBrace,
                    });
                    i += 1;
                }
                b'}' => {
                    items.push(Item {
                        chunk: std::mem::take(&mut chunk),
                        terminator: Terminator::CloseBrace,
                    });
                    i += 1;
                }
                b';' if for_header_depths.is_empty() => {
                    items.push(Item {
                        chunk: std::mem::take(&mut chunk),
                        terminator: Terminator::Semicolon,
                    });
                    i += 1;
                }
                _ => {
                    let char_len = char_len_at(text, i);
                    chunk.push_str(&text[i..i + char_len]);
                    i += char_len;
                }
            }
        }
    }

    if !chunk.trim().is_empty() {
        items.push(Item {
            chunk,
            terminator: Terminator::Eof,
        });
    }

    items
}

/// The trailing identifier-like word of `text` (used to detect `for (`).
fn last_word(text: &str) -> &str {
    let trimmed = text.trim_end();
    let start = trimmed
        .char_indices()
        .rev()
        .take_while(|(_, c)| c.is_alphanumeric() || *c == '_' || *c == '$')
        .last()
        .map_or(trimmed.len(), |(offset, _)| offset);
    &trimmed[start..]
}

// ---------------------------------------------------------------------
// switch/case extra indent (applied after either render mode)
// ---------------------------------------------------------------------

/// Adds one extra indent level to the body of each `case`/`default` label
/// inside a `switch` block. Operates on already-indented output as a
/// separate line-oriented pass, decoupled from the two render modes above.
fn apply_switch_case_extra_indent(text: &str) -> String {
    // A single raw byte-index pass (no `str::split`/`trim_*`/iterator
    // adaptors): those go through per-char Unicode classification and
    // closure-based iterator machinery that isn't optimized away in a
    // debug/test build, which dominates runtime once a deeply nested
    // document produces lines tens of thousands of columns wide. Builds
    // directly into one growing buffer (one `repeat` + one `push_str` per
    // line) rather than a `Vec<String>` joined at the end, for the same
    // reason the XML/JSON formatters avoid per-level copies.
    let bytes = text.as_bytes();
    let len = bytes.len();
    let mut switch_stack: Vec<(usize, bool)> = Vec::new();
    let mut result = String::with_capacity(text.len());
    let mut first_line = true;
    let mut pos = 0usize;

    while pos <= len {
        let mut line_end = pos;
        while line_end < len && bytes[line_end] != b'\n' {
            line_end += 1;
        }

        let mut content_start = pos;
        while content_start < line_end && matches!(bytes[content_start], b' ' | b'\t') {
            content_start += 1;
        }
        let leading = content_start - pos;
        let mut content_end = line_end;
        while content_end > content_start && matches!(bytes[content_end - 1], b' ' | b'\t' | b'\r')
        {
            content_end -= 1;
        }
        let trimmed = &text[content_start..content_end];

        if !first_line {
            result.push('\n');
        }
        first_line = false;

        if let Some(&(body_indent, _)) = switch_stack.last() {
            if trimmed == "}" && leading + 2 == body_indent {
                switch_stack.pop();
            }
        }

        let is_case_label = trimmed.starts_with("case ")
            || trimmed.starts_with("case(")
            || trimmed == "default:"
            || trimmed.starts_with("default:");

        let mut extra = 0usize;
        if let Some(top) = switch_stack.last_mut() {
            if leading >= top.0 {
                if is_case_label && leading == top.0 {
                    top.1 = true;
                } else if top.1 {
                    extra = 1;
                }
            }
        }

        if !trimmed.is_empty() {
            let new_leading = leading + extra * 2;
            if new_leading > 0 {
                result.push_str(&" ".repeat(new_leading));
            }
            result.push_str(trimmed);
        }

        if trimmed.starts_with("switch") && trimmed.ends_with('{') {
            switch_stack.push((leading + 2, false));
        }

        if line_end >= len {
            break;
        }
        pos = line_end + 1;
    }

    result
}

#[cfg(test)]
mod tests {
    use super::format_javascript;

    fn strip_ws(s: &str) -> String {
        s.chars().filter(|c| !c.is_whitespace()).collect()
    }

    fn assert_no_text_loss(source: &str, formatted: &str) {
        assert_eq!(
            strip_ws(source),
            strip_ws(formatted),
            "formatting lost or added non-whitespace content\nsource: {source}\nformatted: {formatted}"
        );
    }

    #[test]
    fn minified_function_and_object_are_rebroken() {
        let source = "function f(a,b){var o={x:1,y:2};if(a){return o;}else{return b;}}";
        let formatted = format_javascript(source, false);
        assert!(formatted.contains("function f(a,b) {"));
        assert!(formatted.contains("if(a) {"));
        assert!(formatted.contains("} else {"));
        assert_no_text_loss(source, &formatted);
    }

    #[test]
    fn minified_for_header_semicolons_do_not_break() {
        let source = "for(let i=0;i<10;i++){doStuff(i);}";
        let formatted = format_javascript(source, false);
        assert!(
            formatted.contains("for(let i=0;i<10;i++) {")
                || formatted.contains("for(let i=0;i<10;i++){")
        );
        assert!(!formatted.contains("i=0;\n"));
        assert_no_text_loss(source, &formatted);
    }

    #[test]
    fn minified_switch_case_gets_extra_indent() {
        // The `case 1:` colon isn't itself a break point, so the label and
        // its first statement land on one merged line; the *following*
        // statement is a genuinely separate line and must be indented one
        // level deeper than that merged label line.
        let source = "switch(x){case 1:doA();break;case 2:doB();break;default:doC();}";
        let formatted = format_javascript(source, false);
        let lines: Vec<&str> = formatted.lines().collect();
        let case_line = lines
            .iter()
            .position(|l| l.trim_start().starts_with("case 1"))
            .expect("case line");
        let body_line = lines
            .iter()
            .position(|l| l.trim_start().starts_with("break"))
            .expect("case body line");
        let case_indent = lines[case_line].len() - lines[case_line].trim_start().len();
        let body_indent = lines[body_line].len() - lines[body_line].trim_start().len();
        assert!(
            body_indent > case_indent,
            "expected case body to be indented deeper than the label, got case={case_indent} body={body_indent} in {formatted}"
        );
        assert_no_text_loss(source, &formatted);
    }

    #[test]
    fn try_catch_finally_stay_glued_to_the_brace() {
        let source = "try{doA();}catch(e){handle(e);}finally{cleanup();}";
        let formatted = format_javascript(source, false);
        assert!(formatted.contains("} catch(e) {") || formatted.contains("} catch (e) {"));
        assert!(formatted.contains("} finally {"));
        assert_no_text_loss(source, &formatted);
    }

    #[test]
    fn template_literal_with_nested_substitution_is_preserved_verbatim() {
        let source = "const s = `a${ {a:1, b: `x${1+1}y`} }b`;";
        let formatted = format_javascript(source, false);
        assert!(formatted.contains("`a${ {a:1, b: `x${1+1}y`} }b`"));
        assert_no_text_loss(source, &formatted);
    }

    #[test]
    fn regex_literal_with_special_chars_is_not_split() {
        let source = "const r = /a{1,3};b\\//g; const isDiv = x / y / 2;";
        let formatted = format_javascript(source, false);
        assert!(formatted.contains("/a{1,3};b\\//g"));
        assert_no_text_loss(source, &formatted);
    }

    #[test]
    fn division_after_identifier_is_not_treated_as_regex() {
        let source = "const q = a / b / c;";
        let formatted = format_javascript(source, false);
        assert_no_text_loss(source, &formatted);
        assert!(formatted.contains("a / b / c"));
    }

    #[test]
    fn comments_with_braces_do_not_affect_structure() {
        let source = "function f() { /* { not a block } */ return 1; }";
        let formatted = format_javascript(source, false);
        assert!(formatted.contains("/* { not a block } */"));
        assert_no_text_loss(source, &formatted);
    }

    #[test]
    fn already_formatted_javascript_is_only_reindented() {
        let source = "function f() {\n        if (a) {\n            return 1;\n        }\n}\n";
        let formatted = format_javascript(source, false);
        assert_eq!(
            formatted,
            "function f() {\n  if (a) {\n    return 1;\n  }\n}\n"
        );
    }

    #[test]
    fn typescript_generics_and_type_annotations_survive() {
        let source = "function f<T>(a: T, b: Map<string, number[]>): T { return a; }";
        let formatted = format_javascript(source, false);
        assert_no_text_loss(source, &formatted);
        assert!(strip_ws(&formatted).contains(&strip_ws("f<T>(a:T,b:Map<string,number[]>):T")));
    }

    #[test]
    fn jsx_always_uses_reindent_only_mode() {
        let source = "function App(){return(<div><span>{a<b}</span></div>);}";
        let formatted = format_javascript(source, true);
        // Re-indent-only mode never inserts a break after `{`, so a
        // minified JSX one-liner stays a single (re-indented) line.
        assert_eq!(formatted.lines().count(), 1);
        assert_no_text_loss(source, &formatted);
    }

    #[test]
    fn output_escaping_preserves_angle_brackets_and_ampersands() {
        let source = "const s = '<a>&amp;</a>';";
        let formatted = format_javascript(source, false);
        assert!(formatted.contains("'<a>&amp;</a>'"));
    }

    #[test]
    fn never_fails_on_malformed_javascript() {
        for source in [
            "function f(",
            "{{{",
            "const s = `unterminated",
            "/* unterminated",
            "",
        ] {
            let _ = format_javascript(source, false);
            let _ = format_javascript(source, true);
        }
    }

    #[test]
    fn deeply_nested_blocks_do_not_overflow_the_stack() {
        let depth = 10_000;
        let mut source = String::from("function f()");
        source.push_str(&"{".repeat(depth));
        source.push('1');
        source.push_str(&"}".repeat(depth));
        let formatted = format_javascript(&source, false);
        assert!(formatted.starts_with("function f() {\n"));
        assert!(formatted.trim_end().ends_with('}'));
    }
}
