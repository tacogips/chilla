//! Lenient, token-based HTML re-indenter.
//!
//! Unlike the strict JSON/XML formatters, this one never fails: malformed or
//! incomplete markup is still re-indented on a best-effort basis (dangling
//! open tags are auto-closed at the end, unmatched close tags are emitted
//! in place). Tag/attribute/entity text is copied verbatim; only structural
//! whitespace (indentation and line breaks) is rewritten.
//!
//! Like the XML formatter, rendering streams directly into one shared
//! buffer via an explicit stack rather than building per-element strings
//! and copying them into ever-larger parent strings, which stays linear
//! time even for deeply nested documents.

const INDENT_UNIT: &str = "  ";

const VOID_ELEMENTS: &[&str] = &[
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track",
    "wbr", "param", "keygen",
];

/// Content is copied verbatim up to the matching close tag; never
/// re-tokenized or re-indented internally.
const RAWTEXT_ELEMENTS: &[&str] = &["script", "style", "pre", "textarea"];

const BLOCK_ELEMENTS: &[&str] = &[
    "html",
    "head",
    "body",
    "address",
    "article",
    "aside",
    "blockquote",
    "details",
    "dialog",
    "div",
    "dl",
    "dt",
    "dd",
    "fieldset",
    "figcaption",
    "figure",
    "footer",
    "form",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "hr",
    "li",
    "main",
    "nav",
    "ol",
    "p",
    "pre",
    "section",
    "table",
    "ul",
    "tr",
    "td",
    "th",
    "thead",
    "tbody",
    "tfoot",
    "caption",
    "colgroup",
    "option",
    "optgroup",
    "select",
    "meta",
    "link",
    "base",
    "area",
    "script",
    "style",
    "title",
    "template",
    "svg",
    "noscript",
    "canvas",
    "video",
    "audio",
    "iframe",
    "textarea",
];

/// Tags whose *start* implicitly closes an open `<p>`.
const P_CLOSE_TRIGGERS: &[&str] = &[
    "address",
    "article",
    "aside",
    "blockquote",
    "div",
    "dl",
    "fieldset",
    "footer",
    "form",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "header",
    "hr",
    "main",
    "nav",
    "ol",
    "p",
    "pre",
    "section",
    "table",
    "ul",
];

fn matches_any(list: &[&str], name: &str) -> bool {
    list.iter()
        .any(|candidate| candidate.eq_ignore_ascii_case(name))
}

fn is_void(name: &str) -> bool {
    matches_any(VOID_ELEMENTS, name)
}

fn is_rawtext(name: &str) -> bool {
    matches_any(RAWTEXT_ELEMENTS, name)
}

fn is_block(name: &str) -> bool {
    matches_any(BLOCK_ELEMENTS, name)
}

fn is_p_close_trigger(name: &str) -> bool {
    matches_any(P_CLOSE_TRIGGERS, name)
}

/// Whether opening `incoming_name` should implicitly close the currently
/// open `open_name` element first (e.g. a new `<li>` closes a previous
/// open `<li>` in the same list).
fn should_implicitly_close(open_name: &str, incoming_name: &str) -> bool {
    if open_name.eq_ignore_ascii_case("li") {
        return incoming_name.eq_ignore_ascii_case("li");
    }
    if open_name.eq_ignore_ascii_case("dt") || open_name.eq_ignore_ascii_case("dd") {
        return incoming_name.eq_ignore_ascii_case("dt")
            || incoming_name.eq_ignore_ascii_case("dd");
    }
    if open_name.eq_ignore_ascii_case("tr") {
        return incoming_name.eq_ignore_ascii_case("tr");
    }
    if open_name.eq_ignore_ascii_case("td") || open_name.eq_ignore_ascii_case("th") {
        // A new row also closes a still-open cell from the previous row.
        return incoming_name.eq_ignore_ascii_case("td")
            || incoming_name.eq_ignore_ascii_case("th")
            || incoming_name.eq_ignore_ascii_case("tr");
    }
    if open_name.eq_ignore_ascii_case("option") {
        return incoming_name.eq_ignore_ascii_case("option");
    }
    if open_name.eq_ignore_ascii_case("p") {
        return is_p_close_trigger(incoming_name);
    }
    false
}

#[derive(Clone, Copy)]
enum Token<'a> {
    Doctype(&'a str),
    Comment(&'a str),
    StartTag {
        name: &'a str,
        attrs: &'a str,
        self_closing: bool,
    },
    EndTag {
        name: &'a str,
    },
    Text(&'a str),
    /// Verbatim content of a raw-text element (script/style/pre/textarea);
    /// never trimmed, collapsed, or re-indented.
    RawText(&'a str),
}

struct Frame<'a> {
    name: &'a str,
    attrs: &'a str,
    is_block: bool,
    /// Meaningful only for block frames: the depth at which this element's
    /// own open/close tags are indented.
    own_depth: usize,
    /// Meaningful only for block frames: whether this element's opening
    /// tag has been written to `output` (permanently multi-line), as
    /// opposed to still being buffered in `pending` in case it collapses
    /// to a single line.
    committed: bool,
}

/// Re-indents an HTML fragment/document. Always succeeds.
pub(super) fn format_html(source: &str) -> String {
    let tokens = tokenize(source);

    let mut output = String::with_capacity(source.len());
    // Buffered inline content (text + inline elements) for the innermost
    // open block frame, while it might still collapse to a single line.
    // Invariant: at most one block frame is ever "pending" at a time —
    // any block child always commits its nearest open block ancestor
    // before being pushed, so ancestors are always already committed.
    let mut pending: Option<String> = None;
    let mut stack: Vec<Frame> = Vec::new();
    let mut run_has_content = false;

    for token in tokens {
        match token {
            Token::Text(raw) => {
                if raw.chars().all(char::is_whitespace) {
                    if run_has_content {
                        let buffer = active_buffer(&mut output, &mut pending);
                        if !buffer.ends_with(' ') && !buffer.is_empty() {
                            buffer.push(' ');
                        }
                    }
                } else {
                    let collapsed = collapse_newline_whitespace(raw);
                    active_buffer(&mut output, &mut pending).push_str(&collapsed);
                    run_has_content = true;
                }
            }
            Token::RawText(raw) => {
                if let Some(top) = stack.last_mut() {
                    if top.is_block {
                        commit_block(top, &mut output, &mut pending);
                        output.push('\n');
                        // Raw content keeps its own original formatting verbatim.
                        output.push_str(raw);
                        run_has_content = false;
                    } else {
                        active_buffer(&mut output, &mut pending).push_str(raw);
                    }
                }
            }
            Token::Doctype(raw) | Token::Comment(raw) => match stack.last_mut() {
                Some(top) if top.is_block => {
                    commit_block(top, &mut output, &mut pending);
                    output.push('\n');
                    push_indent(&mut output, top.own_depth + 1);
                    output.push_str(raw);
                    run_has_content = false;
                }
                Some(_inline_top) => {
                    active_buffer(&mut output, &mut pending).push_str(raw);
                }
                None => {
                    if !output.is_empty() {
                        output.push('\n');
                    }
                    output.push_str(raw);
                }
            },
            Token::EndTag { name } => {
                if let Some(match_index) = stack
                    .iter()
                    .rposition(|frame| frame.name.eq_ignore_ascii_case(name))
                {
                    while stack.len() > match_index {
                        let mut frame = stack.pop().expect("stack.len() > match_index");
                        close_frame(&mut frame, &mut output, &mut pending);
                    }
                    run_has_content = true;
                } else {
                    // No matching open element: emitted in place, without popping.
                    active_buffer(&mut output, &mut pending).push_str("</");
                    active_buffer(&mut output, &mut pending).push_str(name);
                    active_buffer(&mut output, &mut pending).push('>');
                    run_has_content = true;
                }
            }
            Token::StartTag {
                name,
                attrs,
                self_closing,
            } => {
                if is_void(name) || self_closing {
                    write_self_closing(name, attrs, &mut stack, &mut output, &mut pending);
                    run_has_content = true;
                    continue;
                }

                while let Some(top) = stack.last() {
                    if should_implicitly_close(top.name, name) {
                        let mut frame = stack.pop().expect("stack.last() just returned Some");
                        close_frame(&mut frame, &mut output, &mut pending);
                    } else {
                        break;
                    }
                }

                if is_block(name) {
                    let own_depth = begin_new_block(&mut stack, &mut output, &mut pending);
                    stack.push(Frame {
                        name,
                        attrs,
                        is_block: true,
                        own_depth,
                        committed: false,
                    });
                    pending = Some(String::new());
                    run_has_content = false;
                } else {
                    let buffer = active_buffer(&mut output, &mut pending);
                    buffer.push('<');
                    buffer.push_str(name);
                    buffer.push_str(&attr_suffix(attrs));
                    buffer.push('>');
                    stack.push(Frame {
                        name,
                        attrs,
                        is_block: false,
                        own_depth: 0,
                        committed: true,
                    });
                    run_has_content = true;
                }
            }
        }
    }

    while let Some(mut frame) = stack.pop() {
        close_frame(&mut frame, &mut output, &mut pending);
    }

    output
}

fn close_frame(frame: &mut Frame, output: &mut String, pending: &mut Option<String>) {
    if frame.is_block {
        close_block(frame, output, pending);
    } else {
        let buffer = active_buffer(output, pending);
        buffer.push_str("</");
        buffer.push_str(frame.name);
        buffer.push('>');
    }
}

fn active_buffer<'o>(output: &'o mut String, pending: &'o mut Option<String>) -> &'o mut String {
    match pending {
        Some(buffer) => buffer,
        None => output,
    }
}

fn attr_suffix(attrs: &str) -> String {
    if attrs.is_empty() {
        String::new()
    } else {
        format!(" {attrs}")
    }
}

fn push_indent(output: &mut String, depth: usize) {
    output.push_str(&INDENT_UNIT.repeat(depth));
}

/// Ensures `frame`'s own opening tag (and any buffered pending content) has
/// been written to `output`. No-op if already committed.
fn commit_block(frame: &mut Frame, output: &mut String, pending: &mut Option<String>) {
    if frame.committed {
        return;
    }
    push_indent(output, frame.own_depth);
    output.push('<');
    output.push_str(frame.name);
    output.push_str(&attr_suffix(frame.attrs));
    output.push('>');
    if let Some(buffer) = pending.take() {
        if !buffer.is_empty() {
            output.push('\n');
            push_indent(output, frame.own_depth + 1);
            output.push_str(&buffer);
        }
    }
    frame.committed = true;
}

/// Renders a closing block frame: either the closing tag after already
/// multi-line content, or (if it never committed) the whole element inline
/// on one line, e.g. `<p>Hello <b>world</b></p>`.
fn close_block(frame: &mut Frame, output: &mut String, pending: &mut Option<String>) {
    if frame.committed {
        output.push('\n');
        push_indent(output, frame.own_depth);
        output.push_str("</");
        output.push_str(frame.name);
        output.push('>');
    } else {
        let inline_content = pending.take().unwrap_or_default();
        output.push('<');
        output.push_str(frame.name);
        output.push_str(&attr_suffix(frame.attrs));
        output.push('>');
        output.push_str(&inline_content);
        output.push_str("</");
        output.push_str(frame.name);
        output.push('>');
    }
}

/// Closes any inline frames left open at the top of the stack — a block
/// element can't validly nest inside inline flow, so this is the lenient
/// recovery for malformed markup shaped that way.
fn close_dangling_inline_frames(
    stack: &mut Vec<Frame>,
    output: &mut String,
    pending: &mut Option<String>,
) {
    while matches!(stack.last(), Some(top) if !top.is_block) {
        let mut frame = stack.pop().expect("stack.last() just matched Some");
        close_frame(&mut frame, output, pending);
    }
}

/// Prepares `output` for a new block-level entry (either a real element
/// about to be pushed, or a self-contained void element): closes any
/// dangling inline frames, commits and positions the parent (if any), and
/// returns the depth this new entry belongs at.
fn begin_new_block(
    stack: &mut Vec<Frame>,
    output: &mut String,
    pending: &mut Option<String>,
) -> usize {
    close_dangling_inline_frames(stack, output, pending);
    let own_depth = stack.len();
    match stack.last_mut() {
        Some(parent) => {
            commit_block(parent, output, pending);
            output.push('\n');
            push_indent(output, own_depth);
        }
        None => {
            if !output.is_empty() {
                output.push('\n');
            }
        }
    }
    own_depth
}

fn write_self_closing(
    name: &str,
    attrs: &str,
    stack: &mut Vec<Frame>,
    output: &mut String,
    pending: &mut Option<String>,
) {
    let rendered = format!("<{name}{}>", attr_suffix(attrs));
    if is_block(name) {
        begin_new_block(stack, output, pending);
        output.push_str(&rendered);
    } else {
        active_buffer(output, pending).push_str(&rendered);
    }
}

/// Collapses whitespace runs that contain a newline to a single space
/// (display-oriented reflow); whitespace runs without a newline (e.g. two
/// literal spaces on one source line) are left as-is.
fn collapse_newline_whitespace(text: &str) -> String {
    let mut result = String::with_capacity(text.len());
    let mut chars = text.char_indices().peekable();
    while let Some((start, ch)) = chars.next() {
        if !ch.is_whitespace() {
            result.push(ch);
            continue;
        }
        let mut end = start + ch.len_utf8();
        let mut has_newline = ch == '\n';
        while let Some(&(next_start, next_ch)) = chars.peek() {
            if !next_ch.is_whitespace() {
                break;
            }
            has_newline |= next_ch == '\n';
            end = next_start + next_ch.len_utf8();
            chars.next();
        }
        if has_newline {
            result.push(' ');
        } else {
            result.push_str(&text[start..end]);
        }
    }
    result
}

fn tokenize(source: &str) -> Vec<Token<'_>> {
    let mut tokens = Vec::new();
    let mut pos = 0usize;
    let len = source.len();

    while pos < len {
        let rest = &source[pos..];
        if !rest.starts_with('<') {
            let next_lt = rest.find('<').map_or(len, |offset| pos + offset);
            tokens.push(Token::Text(&source[pos..next_lt]));
            pos = next_lt;
            continue;
        }

        if rest.starts_with("<!--") {
            let end = match rest.find("-->") {
                Some(offset) => pos + offset + 3,
                None => len,
            };
            tokens.push(Token::Comment(&source[pos..end]));
            pos = end;
        } else if rest.len() >= 9 && rest[..9].eq_ignore_ascii_case("<!doctype") {
            let end = source[pos..]
                .find('>')
                .map_or(len, |offset| pos + offset + 1);
            tokens.push(Token::Doctype(&source[pos..end]));
            pos = end;
        } else if rest.starts_with("</") {
            let name_start = pos + 2;
            let name_end = find_name_end(source, name_start);
            let name = &source[name_start..name_end];
            let close_at = source[name_end..]
                .find('>')
                .map_or(len, |offset| name_end + offset + 1);
            if name.is_empty() {
                // Stray "</" with no name: treat as literal text, one char at a time.
                tokens.push(Token::Text(&source[pos..pos + 2]));
                pos += 2;
            } else {
                tokens.push(Token::EndTag { name });
                pos = close_at;
            }
        } else if starts_tag_name(rest) {
            let name_start = pos + 1;
            let name_end = find_name_end(source, name_start);
            let name = &source[name_start..name_end];
            let (attrs_end, after_gt, is_empty) = scan_tag_end(source, name_end);
            let attrs = source[name_end..attrs_end].trim();
            let self_closing = is_empty;
            tokens.push(Token::StartTag {
                name,
                attrs,
                self_closing,
            });
            pos = after_gt;

            if !self_closing && !is_void(name) && is_rawtext(name) {
                match find_rawtext_close(source, pos, name) {
                    Some((content_end, tag_end)) => {
                        if content_end > pos {
                            tokens.push(Token::RawText(&source[pos..content_end]));
                        }
                        tokens.push(Token::EndTag { name });
                        pos = tag_end;
                    }
                    None => {
                        if pos < len {
                            tokens.push(Token::RawText(&source[pos..]));
                        }
                        pos = len;
                    }
                }
            }
        } else {
            // '<' not followed by a valid tag/comment/doctype start: literal text.
            tokens.push(Token::Text(&source[pos..pos + 1]));
            pos += 1;
        }
    }

    tokens
}

fn starts_tag_name(rest: &str) -> bool {
    rest[1..]
        .chars()
        .next()
        .is_some_and(|ch| ch.is_ascii_alphabetic())
}

fn find_name_end(source: &str, start: usize) -> usize {
    let mut end = start;
    for ch in source[start..].chars() {
        if ch.is_whitespace() || ch == '/' || ch == '>' {
            break;
        }
        end += ch.len_utf8();
    }
    end
}

/// Scans a start tag's attribute region, respecting quoted attribute values
/// (which may themselves contain `>`). Returns
/// `(attrs_end, position_after_gt, is_self_closing)`.
fn scan_tag_end(source: &str, start: usize) -> (usize, usize, bool) {
    let bytes = source.as_bytes();
    let len = bytes.len();
    let mut i = start;
    let mut quote: Option<u8> = None;
    loop {
        let Some(&byte) = bytes.get(i) else {
            return (len, len, false);
        };
        match quote {
            Some(q) => {
                if byte == q {
                    quote = None;
                }
                i += 1;
            }
            None => match byte {
                b'"' | b'\'' => {
                    quote = Some(byte);
                    i += 1;
                }
                b'>' => break,
                _ => i += 1,
            },
        }
    }
    let gt_pos = i;
    let is_empty = gt_pos > start && bytes[gt_pos - 1] == b'/';
    let attrs_end = if is_empty { gt_pos - 1 } else { gt_pos };
    (attrs_end, gt_pos + 1, is_empty)
}

/// Finds the case-insensitive `</name` closing a raw-text element. Returns
/// `(content_end, position_after_gt)`.
fn find_rawtext_close(source: &str, from: usize, name: &str) -> Option<(usize, usize)> {
    let bytes = source.as_bytes();
    let len = bytes.len();
    let needle = format!("</{name}");
    let needle_bytes = needle.as_bytes();
    if needle_bytes.is_empty() || from > len {
        return None;
    }
    let mut i = from;
    while i + needle_bytes.len() <= len {
        if bytes[i..i + needle_bytes.len()].eq_ignore_ascii_case(needle_bytes) {
            let after = i + needle_bytes.len();
            let boundary_ok = bytes.get(after).is_none_or(|byte| {
                !(byte.is_ascii_alphanumeric() || *byte == b'_' || *byte == b'-')
            });
            if boundary_ok {
                let mut j = after;
                while j < len && bytes[j] != b'>' {
                    j += 1;
                }
                let pos_after_gt = if j < len { j + 1 } else { len };
                return Some((i, pos_after_gt));
            }
        }
        i += 1;
    }
    None
}

#[cfg(test)]
mod tests {
    use super::format_html;

    #[test]
    fn void_elements_never_open_a_stack_frame() {
        // br/img are inline void elements and flow together; hr is a block
        // void element and forces the enclosing div onto multiple lines.
        assert_eq!(
            format_html("<div><br><img src=\"a.png\"><hr></div>"),
            "<div>\n  <br><img src=\"a.png\">\n  <hr>\n</div>"
        );
        // A block whose only content is inline void elements still collapses.
        assert_eq!(
            format_html("<p>line one<br>line two</p>"),
            "<p>line one<br>line two</p>"
        );
    }

    #[test]
    fn implied_li_close() {
        assert_eq!(
            format_html("<ul><li>one<li>two</ul>"),
            "<ul>\n  <li>one</li>\n  <li>two</li>\n</ul>"
        );
    }

    #[test]
    fn implied_p_close_on_block_start() {
        assert_eq!(
            format_html("<div><p>one<div>two</div></div>"),
            "<div>\n  <p>one</p>\n  <div>two</div>\n</div>"
        );
    }

    #[test]
    fn implied_td_and_tr_close() {
        let source = "<table><tr><td>a<td>b<tr><td>c</table>";
        let formatted = format_html(source);
        assert!(formatted.contains("<td>a</td>"));
        assert!(formatted.contains("<td>b</td>"));
        assert!(formatted.contains("<td>c</td>"));
        assert_eq!(formatted.matches("<tr>").count(), 2);
    }

    #[test]
    fn unmatched_end_tag_is_emitted_in_place_without_panicking() {
        let formatted = format_html("<div>hello</span></div>");
        assert!(formatted.contains("</span>"));
        assert!(formatted.contains("hello"));
    }

    #[test]
    fn script_style_pre_textarea_are_copied_verbatim() {
        // A literal `</script` inside the content (even in a string) still
        // ends the element, matching real HTML tokenizing behavior — a
        // naive lenient scanner does not parse JS strings.
        let source = "<script>\nif (a < b) { doStuff(\"ok\"); }\n</script>";
        let formatted = format_html(source);
        assert!(formatted.contains("if (a < b) { doStuff(\"ok\"); }"));
        assert!(formatted.starts_with("<script>\n"));
        assert!(formatted.ends_with("</script>"));

        let pre = format_html("<pre>  weird   spacing\n\tand a <tag> literally kept\n</pre>");
        assert!(pre.contains("  weird   spacing\n\tand a <tag> literally kept\n"));
    }

    #[test]
    fn comments_and_doctype_are_preserved() {
        let source = "<!DOCTYPE html>\n<html><!-- top --><body></body></html>";
        let formatted = format_html(source);
        assert!(formatted.starts_with("<!DOCTYPE html>\n<html>"));
        assert!(formatted.contains("<!-- top -->"));
    }

    #[test]
    fn attributes_containing_gt_in_quotes_do_not_end_the_tag_early() {
        let formatted = format_html(r#"<div data-x="a > b" data-y='c > d'>hi</div>"#);
        assert!(formatted.contains(r#"data-x="a > b" data-y='c > d'"#));
        assert!(formatted.contains("hi"));
    }

    #[test]
    fn uppercase_tags_are_matched_case_insensitively() {
        assert_eq!(
            format_html("<DIV><P>Hi</P></DIV>"),
            "<DIV>\n  <P>Hi</P>\n</DIV>"
        );
    }

    #[test]
    fn block_with_only_inline_content_stays_on_one_line() {
        assert_eq!(
            format_html("<p>Hello <b>world</b></p>"),
            "<p>Hello <b>world</b></p>"
        );
    }

    #[test]
    fn deeply_nested_divs_do_not_overflow_the_stack() {
        let depth = 10_000;
        let mut source = String::new();
        for _ in 0..depth {
            source.push_str("<div>");
        }
        source.push_str("leaf");
        for _ in 0..depth {
            source.push_str("</div>");
        }
        let formatted = format_html(&source);
        assert!(formatted.starts_with("<div>\n"));
        assert!(formatted.trim_end().ends_with("</div>"));
    }

    #[test]
    fn html_escaping_of_output_preserves_entities_verbatim() {
        let formatted = format_html("<p>Tom &amp; Jerry &lt;3</p>");
        assert_eq!(formatted, "<p>Tom &amp; Jerry &lt;3</p>");
    }

    #[test]
    fn never_fails_on_malformed_markup() {
        for source in ["<div", "<div><span>", "<>text</>", "plain text", ""] {
            // Must not panic; result is best-effort.
            let _ = format_html(source);
        }
    }
}
