//! Token-based XML formatter.
//!
//! Tags, attributes, entities, comments, CDATA, processing instructions, and
//! DOCTYPE declarations are copied verbatim from the source; only structure
//! (indentation and line breaks) is rewritten. Tokenizing is a single linear
//! pass, and rendering walks an explicit stack of open elements rather than
//! recursing per nesting level, so deeply nested documents do not risk a
//! stack overflow.

use super::error_at;

const INDENT_UNIT: &str = "  ";

#[derive(Clone, Copy)]
enum Token<'a> {
    Declaration(&'a str),
    Comment(&'a str),
    Cdata(&'a str),
    Doctype(&'a str),
    StartTag { name: &'a str, attrs: &'a str },
    EmptyTag { name: &'a str, attrs: &'a str },
    EndTag { name: &'a str },
    Text(&'a str),
}

struct Frame<'a> {
    name: &'a str,
    attrs: &'a str,
    /// Depth at which this element's own open/close tags are indented; its
    /// children render one level deeper.
    own_depth: usize,
    significant_children: usize,
    /// Buffered text while this element might still collapse to one line
    /// (at most one significant child so far, and it was `Text`/`Cdata`).
    /// Cleared (and written out) once the element commits to multi-line.
    pending_text: Option<String>,
    /// Whether this element's opening tag (and depth's worth of `\n` +
    /// indent for its first child) has been written to the shared output
    /// buffer. Once true, the element is permanently multi-line.
    committed: bool,
}

/// Re-indents an XML document. Returns the formatted text, or an error
/// message describing the first mismatched/unclosed tag or tokenizing
/// problem.
///
/// Rendering writes directly into one shared buffer as tokens are visited,
/// rather than building a separate string per element and copying child
/// output into ever-larger parent strings on the way up — the latter is
/// quadratic (or worse) for a deeply nested, narrow document, even though it
/// never recurses. Each byte of the final output is written at most once.
pub(super) fn format_xml(source: &str) -> Result<String, String> {
    let source = source.strip_prefix('\u{feff}').unwrap_or(source);
    let tokens = tokenize(source)?;

    // Holds the in-progress rendering of the currently open root-to-leaf
    // element chain (empty whenever no element is open).
    let mut output = String::new();
    let mut stack: Vec<Frame> = Vec::new();
    let mut document: Vec<String> = Vec::new();
    let mut root_closed = false;

    for token in tokens {
        match token {
            Token::Text(raw) => {
                let trimmed = raw.trim();
                if trimmed.is_empty() {
                    continue;
                }
                let Some(frame) = stack.last_mut() else {
                    return Err("text is not allowed outside the root element".to_string());
                };
                add_text_or_cdata_child(frame, &mut output, trimmed);
            }
            Token::Cdata(raw) => {
                let Some(frame) = stack.last_mut() else {
                    return Err("CDATA is not allowed outside the root element".to_string());
                };
                add_text_or_cdata_child(frame, &mut output, raw);
            }
            Token::Comment(raw) | Token::Declaration(raw) | Token::Doctype(raw) => {
                match stack.last_mut() {
                    Some(frame) => add_structural_child(frame, &mut output, raw),
                    None => document.push(raw.to_string()),
                }
            }
            Token::EmptyTag { name, attrs } => {
                let rendered = format!("<{name}{}/>", attr_suffix(attrs));
                match stack.last_mut() {
                    Some(frame) => add_structural_child(frame, &mut output, &rendered),
                    None => {
                        if root_closed {
                            return Err("multiple root elements are not allowed".to_string());
                        }
                        document.push(rendered);
                        root_closed = true;
                    }
                }
            }
            Token::StartTag { name, attrs } => {
                if stack.is_empty() && root_closed {
                    return Err("multiple root elements are not allowed".to_string());
                }
                if let Some(parent) = stack.last_mut() {
                    begin_element_child(parent, &mut output);
                }
                let own_depth = stack.len();
                stack.push(Frame {
                    name,
                    attrs,
                    own_depth,
                    significant_children: 0,
                    pending_text: None,
                    committed: false,
                });
            }
            Token::EndTag { name } => {
                let Some(mut frame) = stack.pop() else {
                    return Err(format!(
                        "unexpected closing tag </{name}> with no matching open tag"
                    ));
                };
                if frame.name != name {
                    return Err(format!(
                        "mismatched closing tag: expected </{}> but found </{name}>",
                        frame.name
                    ));
                }
                close_element(&mut frame, &mut output);
                if stack.is_empty() {
                    document.push(std::mem::take(&mut output));
                    root_closed = true;
                }
            }
        }
    }

    if let Some(open) = stack.last() {
        return Err(format!("unclosed tag <{}>", open.name));
    }
    if !root_closed {
        return Err("no root element found".to_string());
    }

    Ok(document.join("\n"))
}

fn attr_suffix(attrs: &str) -> String {
    if attrs.is_empty() {
        String::new()
    } else {
        format!(" {attrs}")
    }
}

/// Appends `depth` indent units. Uses `str::repeat` (which grows by
/// doubling, i.e. `O(log depth)` copies) rather than one `push_str` per
/// unit, since deeply nested documents call this at every level.
fn push_indent(output: &mut String, depth: usize) {
    output.push_str(&INDENT_UNIT.repeat(depth));
}

/// Writes `frame`'s own opening tag (and flushes any buffered pending text
/// as that first child's line) if it hasn't been written yet. A no-op once
/// already committed.
fn commit(frame: &mut Frame, output: &mut String) {
    if frame.committed {
        return;
    }
    push_indent(output, frame.own_depth);
    output.push('<');
    output.push_str(frame.name);
    output.push_str(&attr_suffix(frame.attrs));
    output.push('>');
    if let Some(text) = frame.pending_text.take() {
        output.push('\n');
        push_indent(output, frame.own_depth + 1);
        output.push_str(&text);
    }
    frame.committed = true;
}

/// Commits `frame` if needed, then starts a fresh indented line for a new
/// child (the caller appends that child's own content next).
fn start_new_child_line(frame: &mut Frame, output: &mut String) {
    commit(frame, output);
    output.push('\n');
    push_indent(output, frame.own_depth + 1);
}

/// A comment/PI/DOCTYPE/empty-tag child: always disqualifies collapsing,
/// and its full rendering is already known, so it is written immediately.
fn add_structural_child(frame: &mut Frame, output: &mut String, rendered: &str) {
    frame.significant_children += 1;
    start_new_child_line(frame, output);
    output.push_str(rendered);
}

/// A start tag beginning a new child element: always disqualifies
/// collapsing. The child's own tag/content is written by later tokens (via
/// `commit`/`close_element` on the newly pushed frame), so only the
/// separating line is prepared here.
fn begin_element_child(frame: &mut Frame, output: &mut String) {
    frame.significant_children += 1;
    start_new_child_line(frame, output);
}

/// A text/CDATA child: may still keep `frame` collapsed to a single line if
/// it turns out to be the only significant child.
fn add_text_or_cdata_child(frame: &mut Frame, output: &mut String, content: &str) {
    frame.significant_children += 1;
    if frame.significant_children == 1 && !frame.committed {
        frame.pending_text = Some(content.to_string());
        return;
    }
    start_new_child_line(frame, output);
    output.push_str(content);
}

/// Finalizes a closing element: if it never committed (zero children, or a
/// single text/CDATA child), its whole `<tag>...</tag>` is written inline
/// now; otherwise its closing tag is appended after the already-streamed
/// multi-line body.
fn close_element(frame: &mut Frame, output: &mut String) {
    if frame.committed {
        output.push('\n');
        push_indent(output, frame.own_depth);
        output.push_str("</");
        output.push_str(frame.name);
        output.push('>');
    } else {
        output.push('<');
        output.push_str(frame.name);
        output.push_str(&attr_suffix(frame.attrs));
        output.push('>');
        if let Some(text) = frame.pending_text.take() {
            output.push_str(&text);
        }
        output.push_str("</");
        output.push_str(frame.name);
        output.push('>');
    }
}

fn tokenize(source: &str) -> Result<Vec<Token<'_>>, String> {
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
            let close = rest
                .find("-->")
                .ok_or_else(|| error_at(source, pos, "unterminated comment"))?;
            let end = pos + close + 3;
            tokens.push(Token::Comment(&source[pos..end]));
            pos = end;
        } else if rest.starts_with("<![CDATA[") {
            let close = rest
                .find("]]>")
                .ok_or_else(|| error_at(source, pos, "unterminated CDATA section"))?;
            let end = pos + close + 3;
            tokens.push(Token::Cdata(&source[pos..end]));
            pos = end;
        } else if rest.starts_with("<!DOCTYPE") {
            let end = find_doctype_end(source, pos)?;
            tokens.push(Token::Doctype(&source[pos..end]));
            pos = end;
        } else if rest.starts_with("<?") {
            let close = rest
                .find("?>")
                .ok_or_else(|| error_at(source, pos, "unterminated processing instruction"))?;
            let end = pos + close + 2;
            tokens.push(Token::Declaration(&source[pos..end]));
            pos = end;
        } else if rest.starts_with("</") {
            let name_start = pos + 2;
            let name_end = find_name_end(source, name_start);
            let name = &source[name_start..name_end];
            if name.is_empty() {
                return Err(error_at(source, name_start, "expected a tag name"));
            }
            let after_name = skip_ws_str(source, name_end);
            if !source[after_name..].starts_with('>') {
                return Err(error_at(
                    source,
                    after_name,
                    "expected '>' to close the tag",
                ));
            }
            tokens.push(Token::EndTag { name });
            pos = after_name + 1;
        } else {
            let name_start = pos + 1;
            let name_end = find_name_end(source, name_start);
            let name = &source[name_start..name_end];
            if name.is_empty() {
                return Err(error_at(source, name_start, "expected a tag name"));
            }
            let (attrs_end, after_gt, is_empty) = scan_tag_end(source, name_end)?;
            let attrs = source[name_end..attrs_end].trim();
            tokens.push(if is_empty {
                Token::EmptyTag { name, attrs }
            } else {
                Token::StartTag { name, attrs }
            });
            pos = after_gt;
        }
    }

    Ok(tokens)
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

fn skip_ws_str(source: &str, start: usize) -> usize {
    let mut end = start;
    for ch in source[start..].chars() {
        if !ch.is_whitespace() {
            break;
        }
        end += ch.len_utf8();
    }
    end
}

/// Scans a start/empty tag's attribute region, respecting quoted attribute
/// values so a `>` inside a quote does not end the tag early. Returns
/// `(attrs_end, position_after_gt, is_empty_tag)`.
fn scan_tag_end(source: &str, start: usize) -> Result<(usize, usize, bool), String> {
    let bytes = source.as_bytes();
    let mut i = start;
    let mut quote: Option<u8> = None;
    loop {
        let Some(&byte) = bytes.get(i) else {
            return Err(error_at(source, start, "unterminated tag"));
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
    Ok((attrs_end, gt_pos + 1, is_empty))
}

/// Scans a `<!DOCTYPE ...>` declaration, tracking `[`/`]` depth so a `>`
/// inside an internal subset does not end the declaration early.
fn find_doctype_end(source: &str, start: usize) -> Result<usize, String> {
    let bytes = source.as_bytes();
    let mut i = start;
    let mut depth = 0i32;
    loop {
        let Some(&byte) = bytes.get(i) else {
            return Err(error_at(source, start, "unterminated DOCTYPE declaration"));
        };
        match byte {
            b'[' => {
                depth += 1;
                i += 1;
            }
            b']' => {
                depth -= 1;
                i += 1;
            }
            b'>' if depth <= 0 => {
                i += 1;
                break;
            }
            _ => i += 1,
        }
    }
    Ok(i)
}

#[cfg(test)]
mod tests {
    use super::format_xml;

    #[test]
    fn single_text_child_stays_on_one_line() {
        assert_eq!(
            format_xml("<a><b>1</b></a>").unwrap(),
            "<a>\n  <b>1</b>\n</a>"
        );
        assert_eq!(
            format_xml("<a>\n  <b>\n    hello\n  </b>\n</a>").unwrap(),
            "<a>\n  <b>hello</b>\n</a>"
        );
    }

    #[test]
    fn empty_element_renders_without_children() {
        assert_eq!(format_xml("<a></a>").unwrap(), "<a></a>");
        assert_eq!(format_xml("<a/>").unwrap(), "<a/>");
        assert_eq!(format_xml("<a>   \n  </a>").unwrap(), "<a></a>");
    }

    #[test]
    fn mixed_content_does_not_collapse() {
        let source = "<a>text<b/></a>";
        let formatted = format_xml(source).unwrap();
        assert_eq!(formatted, "<a>\n  text\n  <b/>\n</a>");
    }

    #[test]
    fn attributes_and_entities_are_copied_verbatim() {
        let source = r#"<a x="1"  y='two &amp; three'><b>&lt;ok&gt;</b></a>"#;
        let formatted = format_xml(source).unwrap();
        assert!(formatted.contains(r#"x="1"  y='two &amp; three'"#));
        assert!(formatted.contains("&lt;ok&gt;"));
    }

    #[test]
    fn comments_pi_doctype_and_cdata_are_their_own_tokens() {
        let source = concat!(
            "<?xml version=\"1.0\"?>\n",
            "<!DOCTYPE root>\n",
            "<root>\n",
            "  <!-- note -->\n",
            "  <data><![CDATA[raw <stuff> & things]]></data>\n",
            "</root>\n"
        );
        let formatted = format_xml(source).unwrap();
        assert!(formatted.starts_with("<?xml version=\"1.0\"?>\n<!DOCTYPE root>\n<root>"));
        assert!(formatted.contains("  <!-- note -->"));
        assert!(formatted.contains("<data><![CDATA[raw <stuff> & things]]></data>"));
    }

    #[test]
    fn cdata_is_not_trimmed_when_collapsed() {
        let source = "<a><![CDATA[  spaced  ]]></a>";
        assert_eq!(format_xml(source).unwrap(), "<a><![CDATA[  spaced  ]]></a>");
    }

    #[test]
    fn mismatched_tag_is_an_error() {
        let error = format_xml("<a><b></c></a>").unwrap_err();
        assert!(error.contains("mismatched closing tag"));
    }

    #[test]
    fn unclosed_tag_is_an_error() {
        let error = format_xml("<a><b></b>").unwrap_err();
        assert!(error.contains("unclosed tag <a>"));
    }

    #[test]
    fn unexpected_closing_tag_is_an_error() {
        let error = format_xml("<a></a></a>").unwrap_err();
        assert!(error.contains("unexpected closing tag"));
    }

    #[test]
    fn deeply_nested_elements_do_not_overflow_the_stack() {
        let depth = 10_000;
        let mut source = String::new();
        for i in 0..depth {
            source.push_str(&format!("<n{i}>"));
        }
        source.push_str("leaf");
        for i in (0..depth).rev() {
            source.push_str(&format!("</n{i}>"));
        }
        let formatted = format_xml(&source).expect("deeply nested XML should still format");
        assert!(formatted.starts_with("<n0>"));
        assert!(formatted.trim_end().ends_with("</n0>"));
    }

    #[test]
    fn multiple_root_elements_is_an_error() {
        let error = format_xml("<a/><b/>").unwrap_err();
        assert!(error.contains("multiple root elements"));
    }

    #[test]
    fn stray_top_level_text_is_an_error() {
        let error = format_xml("<a/>stray").unwrap_err();
        assert!(error.contains("root element"));
    }
}
