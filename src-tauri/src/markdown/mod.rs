use std::collections::BTreeMap;

use pulldown_cmark::{
    html::push_html, CodeBlockKind, CowStr, Event, HeadingLevel, Options, Parser, Tag, TagEnd,
};

use crate::document::types::HeadingNode;
use crate::syntax_highlight::SyntaxUiTheme;

#[derive(Debug, Clone)]
pub struct RenderedDocument {
    pub html: String,
    pub headings: Vec<HeadingNode>,
}

#[derive(Debug, Clone)]
struct FlatHeading {
    level: u8,
    title: String,
    anchor_id: String,
    line_start: usize,
}

#[derive(Debug, Clone)]
struct HeadingDraft {
    level: u8,
    title: String,
    line_start: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum EmbeddedMediaKind {
    Image,
    Video,
}

#[derive(Debug, Clone)]
struct EmbeddedMediaDraft {
    destination: String,
    title: String,
    alt_text: String,
    kind: EmbeddedMediaKind,
}

#[derive(Debug)]
struct CodeBlockCapture {
    lang_token: Option<String>,
    buf: String,
}

pub fn render_markdown(source_text: &str, ui_theme: SyntaxUiTheme) -> RenderedDocument {
    let parser = Parser::new_ext(source_text, parser_options());
    let line_starts = line_starts(source_text);
    let mut raw_events = Vec::new();
    let mut flat_headings = Vec::new();
    let mut current_heading: Option<HeadingDraft> = None;

    for (event, range) in parser.into_offset_iter() {
        match &event {
            Event::Start(Tag::Heading { level, .. }) => {
                current_heading = Some(HeadingDraft {
                    level: heading_level_to_u8(*level),
                    title: String::new(),
                    line_start: line_number_for_offset(&line_starts, range.start),
                });
            }
            Event::End(TagEnd::Heading(_)) => {
                if let Some(heading) = current_heading.take() {
                    flat_headings.push(FlatHeading {
                        level: heading.level,
                        title: heading.title.trim().to_string(),
                        anchor_id: String::new(),
                        line_start: heading.line_start,
                    });
                }
            }
            Event::Text(text) | Event::Code(text) => {
                if let Some(heading) = current_heading.as_mut() {
                    heading.title.push_str(text.as_ref());
                }
            }
            Event::SoftBreak | Event::HardBreak => {
                if let Some(heading) = current_heading.as_mut() {
                    heading.title.push(' ');
                }
            }
            _ => {}
        }

        raw_events.push(sanitize_event(event));
    }

    assign_anchor_ids(&mut flat_headings);

    let html = render_html_with_heading_ids(raw_events, &flat_headings, ui_theme);
    let headings = build_heading_tree(&flat_headings);

    RenderedDocument { html, headings }
}

fn parser_options() -> Options {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_TASKLISTS);
    options.insert(Options::ENABLE_MATH);
    options
}

fn sanitize_event(event: Event<'_>) -> Event<'_> {
    match event {
        Event::Html(html) | Event::InlineHtml(html) => sanitize_raw_html_event(html),
        other => other,
    }
}

fn sanitize_raw_html_event(html: CowStr<'_>) -> Event<'_> {
    match sanitize_allowed_raw_html(html.as_ref()) {
        Some(safe_html) => Event::Html(CowStr::from(safe_html)),
        None => Event::Text(html),
    }
}

fn sanitize_allowed_raw_html(raw_html: &str) -> Option<String> {
    sanitize_raw_paragraph_tag(raw_html).or_else(|| sanitize_raw_img_tag(raw_html))
}

fn sanitize_raw_paragraph_tag(raw_html: &str) -> Option<String> {
    let trimmed = raw_html.trim();

    if trimmed.eq("</p>") {
        return Some("</p>".to_string());
    }

    if !trimmed.starts_with("<p") || trimmed.starts_with("</") || !trimmed.ends_with('>') {
        return None;
    }

    let attr_source = trimmed
        .strip_prefix("<p")?
        .strip_suffix('>')?
        .trim_end_matches('/')
        .trim();

    if attr_source.is_empty() {
        return Some("<p>".to_string());
    }

    let attributes = parse_html_attributes(attr_source);
    let align = attributes.get("align").map(|value| value.trim())?;

    if !matches!(align, "left" | "center" | "right" | "justify") {
        return None;
    }

    Some(format!("<p align=\"{}\">", escape_html_attribute(align)))
}

fn sanitize_raw_img_tag(raw_html: &str) -> Option<String> {
    let trimmed = raw_html.trim();

    if !trimmed.starts_with("<img") || trimmed.starts_with("</") || !trimmed.ends_with('>') {
        return None;
    }

    let attr_source = trimmed
        .strip_prefix("<img")?
        .strip_suffix('>')?
        .trim_end_matches('/')
        .trim();
    let attributes = parse_html_attributes(attr_source);
    let src = attributes.get("src")?.trim();

    if src.is_empty() {
        return None;
    }

    let mut html = format!("<img src=\"{}\"", escape_html_attribute(src));

    if let Some(alt) = attributes.get("alt").map(|value| value.trim()) {
        html.push_str(&format!(" alt=\"{}\"", escape_html_attribute(alt)));
    }

    if let Some(title) = attributes.get("title").map(|value| value.trim()) {
        html.push_str(&format!(" title=\"{}\"", escape_html_attribute(title)));
    }

    if let Some(width) = attributes
        .get("width")
        .map(|value| value.trim())
        .filter(|value| is_safe_html_dimension(value))
    {
        html.push_str(&format!(" width=\"{}\"", escape_html_attribute(width)));
    }

    if let Some(height) = attributes
        .get("height")
        .map(|value| value.trim())
        .filter(|value| is_safe_html_dimension(value))
    {
        html.push_str(&format!(" height=\"{}\"", escape_html_attribute(height)));
    }

    html.push_str(" />");
    Some(html)
}

fn is_safe_html_dimension(value: &str) -> bool {
    !value.is_empty() && value.chars().all(|character| character.is_ascii_digit())
}

fn parse_html_attributes(value: &str) -> BTreeMap<String, String> {
    let mut attributes = BTreeMap::new();
    let bytes = value.as_bytes();
    let mut cursor = 0usize;

    while cursor < bytes.len() {
        while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
            cursor += 1;
        }

        if cursor >= bytes.len() {
            break;
        }

        let name_start = cursor;

        while cursor < bytes.len()
            && !bytes[cursor].is_ascii_whitespace()
            && bytes[cursor] != b'='
            && bytes[cursor] != b'/'
        {
            cursor += 1;
        }

        if name_start == cursor {
            cursor += 1;
            continue;
        }

        let name = value[name_start..cursor].trim().to_ascii_lowercase();

        while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
            cursor += 1;
        }

        if cursor >= bytes.len() || bytes[cursor] != b'=' {
            continue;
        }

        cursor += 1;

        while cursor < bytes.len() && bytes[cursor].is_ascii_whitespace() {
            cursor += 1;
        }

        if cursor >= bytes.len() {
            break;
        }

        let quote = bytes[cursor];
        let attr_value = if quote == b'"' || quote == b'\'' {
            cursor += 1;
            let value_start = cursor;

            while cursor < bytes.len() && bytes[cursor] != quote {
                cursor += 1;
            }

            let parsed = value[value_start..cursor].to_string();

            if cursor < bytes.len() {
                cursor += 1;
            }

            parsed
        } else {
            let value_start = cursor;

            while cursor < bytes.len()
                && !bytes[cursor].is_ascii_whitespace()
                && bytes[cursor] != b'/'
            {
                cursor += 1;
            }

            value[value_start..cursor].to_string()
        };

        attributes.insert(name, attr_value);
    }

    attributes
}

fn render_html_with_heading_ids(
    events: Vec<Event<'_>>,
    flat_headings: &[FlatHeading],
    ui_theme: SyntaxUiTheme,
) -> String {
    let mut heading_index = 0usize;
    let mut output_events = Vec::with_capacity(events.len());
    let mut current_media: Option<EmbeddedMediaDraft> = None;
    let mut link_depth = 0usize;
    let mut code_capture: Option<CodeBlockCapture> = None;

    for event in events {
        if let Some(media) = current_media.as_mut() {
            match event {
                Event::End(TagEnd::Image) => {
                    output_events.push(Event::Html(CowStr::from(render_embedded_media(media))));
                    current_media = None;
                }
                Event::Text(text) | Event::Code(text) => {
                    media.alt_text.push_str(text.as_ref());
                }
                Event::SoftBreak | Event::HardBreak => {
                    media.alt_text.push(' ');
                }
                _ => {}
            }

            continue;
        }

        if code_capture.is_some() {
            match event {
                Event::Text(text) | Event::Code(text) => {
                    if let Some(capture) = code_capture.as_mut() {
                        capture.buf.push_str(text.as_ref());
                    }
                }
                Event::SoftBreak | Event::HardBreak => {
                    if let Some(capture) = code_capture.as_mut() {
                        capture.buf.push('\n');
                    }
                }
                Event::End(TagEnd::CodeBlock) => {
                    let finished = code_capture.take().expect("code block buffer");
                    let html = if finished
                        .lang_token
                        .as_deref()
                        .is_some_and(|lang| lang.eq_ignore_ascii_case("mermaid"))
                    {
                        format!(
                            "<pre><code class=\"language-mermaid\">{}</code></pre>",
                            escape_html_text(&finished.buf)
                        )
                    } else {
                        crate::syntax_highlight::highlight_markdown_fence(
                            &finished.buf,
                            finished.lang_token.as_deref(),
                            ui_theme,
                        )
                    };
                    output_events.push(Event::Html(CowStr::from(html)));
                }
                _ => {}
            }

            continue;
        }

        match event {
            Event::Start(Tag::Heading { level, .. }) => {
                let tag_name = heading_tag_name(level);
                let anchor_id = flat_headings
                    .get(heading_index)
                    .map(|heading| heading.anchor_id.clone())
                    .unwrap_or_else(|| "section".to_string());
                output_events.push(Event::Html(CowStr::from(format!(
                    "<{tag_name} id=\"{anchor_id}\">"
                ))));
            }
            Event::End(TagEnd::Heading(level)) => {
                let tag_name = heading_tag_name(level);
                output_events.push(Event::Html(CowStr::from(format!("</{tag_name}>"))));
                heading_index += 1;
            }
            Event::Start(Tag::Image {
                dest_url, title, ..
            }) => {
                current_media = Some(EmbeddedMediaDraft {
                    destination: dest_url.to_string(),
                    title: title.to_string(),
                    alt_text: String::new(),
                    kind: embedded_media_kind(dest_url.as_ref()),
                });
            }
            Event::Start(Tag::Link { .. }) => {
                link_depth += 1;
                output_events.push(event);
            }
            Event::End(TagEnd::Link) => {
                link_depth = link_depth.saturating_sub(1);
                output_events.push(event);
            }
            Event::Start(Tag::CodeBlock(kind)) => {
                let lang_token = match kind {
                    CodeBlockKind::Fenced(info) => info
                        .split_whitespace()
                        .next()
                        .filter(|chunk| !chunk.is_empty())
                        .map(|chunk| chunk.to_string()),
                    CodeBlockKind::Indented => None,
                };
                code_capture = Some(CodeBlockCapture {
                    lang_token,
                    buf: String::new(),
                });
            }
            Event::Text(text) if link_depth == 0 => {
                push_linkified_text(&mut output_events, text.as_ref())
            }
            other => output_events.push(other),
        }
    }

    let mut html = String::new();
    push_html(&mut html, output_events.into_iter());
    html
}

fn push_linkified_text(output_events: &mut Vec<Event<'_>>, text: &str) {
    let mut cursor = 0usize;

    while let Some((start, end)) = find_next_url(text, cursor) {
        if start > cursor {
            output_events.push(Event::Text(CowStr::from(text[cursor..start].to_string())));
        }

        let url = &text[start..end];
        output_events.push(Event::Html(CowStr::from(format!(
            "<a href=\"{}\">{}</a>",
            escape_html_attribute(url),
            escape_html_text(url),
        ))));
        cursor = end;
    }

    if cursor < text.len() {
        output_events.push(Event::Text(CowStr::from(text[cursor..].to_string())));
    }
}

fn find_next_url(text: &str, start_at: usize) -> Option<(usize, usize)> {
    let prefixes = ["https://", "http://"];
    let mut next_match: Option<(usize, &str)> = None;

    for prefix in prefixes {
        let mut search_from = start_at;

        while let Some(offset) = text[search_from..].find(prefix) {
            let absolute_offset = search_from + offset;
            let is_word_boundary = absolute_offset == 0
                || !text[..absolute_offset]
                    .chars()
                    .next_back()
                    .is_some_and(|character| character.is_alphanumeric());

            if is_word_boundary {
                match next_match {
                    Some((current_offset, _)) if current_offset <= absolute_offset => {}
                    _ => next_match = Some((absolute_offset, prefix)),
                }
                break;
            }

            search_from = absolute_offset + prefix.len();
        }
    }

    let (match_start, prefix) = next_match?;
    let mut match_end = match_start + prefix.len();

    for (_, character) in text[match_end..].char_indices() {
        if character.is_whitespace() || matches!(character, '<' | '>' | '"' | '\'') {
            break;
        }

        match_end += character.len_utf8();
    }

    while let Some(character) = text[match_start..match_end].chars().next_back() {
        let should_trim = matches!(character, '.' | ',' | '!' | '?' | ':' | ';')
            || has_unbalanced_trailing_delimiter(&text[match_start..match_end], character);

        if !should_trim {
            break;
        }

        match_end -= character.len_utf8();
    }

    if match_end > match_start {
        Some((match_start, match_end))
    } else {
        None
    }
}

fn has_unbalanced_trailing_delimiter(candidate: &str, trailing_character: char) -> bool {
    match trailing_character {
        ')' => count_character(candidate, '(') < count_character(candidate, ')'),
        ']' => count_character(candidate, '[') < count_character(candidate, ']'),
        '}' => count_character(candidate, '{') < count_character(candidate, '}'),
        _ => false,
    }
}

fn count_character(value: &str, target: char) -> usize {
    value
        .chars()
        .filter(|character| *character == target)
        .count()
}

fn render_embedded_media(media: &EmbeddedMediaDraft) -> String {
    let source = escape_html_attribute(&media.destination);
    let title_attribute = if media.title.trim().is_empty() {
        String::new()
    } else {
        format!(" title=\"{}\"", escape_html_attribute(&media.title))
    };
    let alt_text = media.alt_text.trim();
    let escaped_alt_text = escape_html_attribute(alt_text);

    match media.kind {
        EmbeddedMediaKind::Image => {
            format!("<img src=\"{source}\" alt=\"{escaped_alt_text}\"{title_attribute} />")
        }
        EmbeddedMediaKind::Video => {
            let caption = if alt_text.is_empty() {
                String::new()
            } else {
                format!("<figcaption>{}</figcaption>", escape_html_text(alt_text))
            };
            let aria_attribute = if alt_text.is_empty() {
                String::new()
            } else {
                format!(" aria-label=\"{escaped_alt_text}\"")
            };

            format!(
                "<figure class=\"preview-media preview-media--video\"><video controls preload=\"none\" playsinline src=\"{source}\"{title_attribute}{aria_attribute}>{}</video>{caption}</figure>",
                escape_html_text(alt_text),
            )
        }
    }
}

fn embedded_media_kind(destination: &str) -> EmbeddedMediaKind {
    if is_video_destination(destination) {
        EmbeddedMediaKind::Video
    } else {
        EmbeddedMediaKind::Image
    }
}

fn is_video_destination(destination: &str) -> bool {
    let trimmed = destination
        .split(['?', '#'])
        .next()
        .unwrap_or(destination)
        .to_ascii_lowercase();

    ["mp4", "m4v", "mov", "webm", "ogv"]
        .iter()
        .any(|extension| trimmed.ends_with(&format!(".{extension}")))
}

fn escape_html_attribute(value: &str) -> String {
    escape_html_text(value)
        .replace('\"', "&quot;")
        .replace('\'', "&#39;")
}

fn escape_html_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn heading_tag_name(level: HeadingLevel) -> &'static str {
    match level {
        HeadingLevel::H1 => "h1",
        HeadingLevel::H2 => "h2",
        HeadingLevel::H3 => "h3",
        HeadingLevel::H4 => "h4",
        HeadingLevel::H5 => "h5",
        HeadingLevel::H6 => "h6",
    }
}

fn heading_level_to_u8(level: HeadingLevel) -> u8 {
    match level {
        HeadingLevel::H1 => 1,
        HeadingLevel::H2 => 2,
        HeadingLevel::H3 => 3,
        HeadingLevel::H4 => 4,
        HeadingLevel::H5 => 5,
        HeadingLevel::H6 => 6,
    }
}

fn line_starts(source_text: &str) -> Vec<usize> {
    let mut starts = vec![0usize];

    for (index, character) in source_text.char_indices() {
        if character == '\n' {
            starts.push(index + 1);
        }
    }

    starts
}

fn line_number_for_offset(line_starts: &[usize], offset: usize) -> usize {
    line_starts.partition_point(|line_start| *line_start <= offset)
}

fn assign_anchor_ids(flat_headings: &mut [FlatHeading]) {
    let mut counts = BTreeMap::<String, usize>::new();

    for heading in flat_headings {
        let base_slug = slugify_heading(&heading.title);
        let next_count = counts.entry(base_slug.clone()).or_insert(0);
        *next_count += 1;
        heading.anchor_id = if *next_count == 1 {
            base_slug
        } else {
            format!("{base_slug}-{next_count}")
        };
    }
}

fn slugify_heading(title: &str) -> String {
    let mut slug = String::new();
    let mut previous_was_dash = false;

    for character in title.chars() {
        if character.is_alphanumeric() {
            previous_was_dash = false;
            slug.extend(character.to_lowercase());
        } else if !previous_was_dash {
            slug.push('-');
            previous_was_dash = true;
        }
    }

    let trimmed = slug.trim_matches('-').to_string();

    if trimmed.is_empty() {
        "section".to_string()
    } else {
        trimmed
    }
}

fn build_heading_tree(flat_headings: &[FlatHeading]) -> Vec<HeadingNode> {
    fn build_nodes(
        flat_headings: &[FlatHeading],
        index: &mut usize,
        parent_level: u8,
    ) -> Vec<HeadingNode> {
        let mut nodes = Vec::new();

        while let Some(next_heading) = flat_headings.get(*index) {
            if next_heading.level <= parent_level {
                break;
            }

            let level = next_heading.level;
            let mut node = HeadingNode {
                level: next_heading.level,
                title: next_heading.title.clone(),
                anchor_id: next_heading.anchor_id.clone(),
                line_start: next_heading.line_start,
                children: Vec::new(),
            };
            *index += 1;
            node.children = build_nodes(flat_headings, index, level);
            nodes.push(node);
        }

        nodes
    }

    let mut index = 0usize;
    build_nodes(flat_headings, &mut index, 0)
}

#[cfg(test)]
mod tests {
    use crate::syntax_highlight::SyntaxUiTheme;

    use super::render_markdown;

    #[test]
    fn renders_heading_ids_and_nested_headings() {
        let rendered = render_markdown(
            "# Intro\n\n## Child Topic\n\n### Deep Topic\n\n## Child Topic\n",
            SyntaxUiTheme::Dark,
        );

        assert!(rendered.html.contains("<h1 id=\"intro\">Intro</h1>"));
        assert!(rendered
            .html
            .contains("<h2 id=\"child-topic\">Child Topic</h2>"));
        assert!(rendered
            .html
            .contains("<h2 id=\"child-topic-2\">Child Topic</h2>"));
        assert_eq!(rendered.headings.len(), 1);
        assert_eq!(rendered.headings[0].children.len(), 2);
        assert_eq!(
            rendered.headings[0].children[0].children[0].title,
            "Deep Topic"
        );
    }

    #[test]
    fn preserves_mermaid_code_blocks_in_html_output() {
        let rendered = render_markdown("```mermaid\ngraph TD;\nA-->B;\n```", SyntaxUiTheme::Dark);

        assert!(rendered.html.contains("language-mermaid"));
        assert!(rendered.html.contains("graph TD;"));
    }

    #[test]
    fn emits_math_spans_for_dollar_latex() {
        let rendered = render_markdown(
            r"Inline $x^2$ and display $$\int_0^1 x\,dx$$",
            SyntaxUiTheme::Dark,
        );

        assert!(rendered.html.contains(r#"class="math math-inline""#));
        assert!(rendered.html.contains(r#"class="math math-display""#));
        assert!(rendered.html.contains("x^2"));
        assert!(rendered.html.contains(r"\int_0^1"));
    }

    #[test]
    fn escapes_html_inside_math_spans() {
        let rendered = render_markdown(r"$a < b$", SyntaxUiTheme::Dark);

        assert!(
            rendered.html.contains("a &lt; b"),
            "expected escaped less-than in math span, got: {}",
            rendered.html
        );
    }

    #[test]
    fn highlights_fenced_rust_with_syntect() {
        let rendered = render_markdown("```rust\nlet x: u32 = 1;\n```", SyntaxUiTheme::Dark);

        assert!(
            rendered.html.contains("let</span>"),
            "body missing in: {}",
            rendered.html
        );
        assert!(
            rendered.html.contains("u32"),
            "body missing in: {}",
            rendered.html
        );
        assert!(
            rendered.html.contains("style=") && rendered.html.contains("<span"),
            "expected syntect HTML, got: {}",
            rendered.html
        );
    }

    #[test]
    fn autolinks_plain_urls() {
        let rendered = render_markdown(
            "Visit https://example.com/docs for details.",
            SyntaxUiTheme::Dark,
        );

        assert!(rendered
            .html
            .contains("<a href=\"https://example.com/docs\">https://example.com/docs</a>"));
    }

    #[test]
    fn autolinks_urls_without_trailing_parentheses_or_punctuation() {
        let rendered = render_markdown("Visit (https://example.com/docs).", SyntaxUiTheme::Dark);

        assert!(rendered
            .html
            .contains("(<a href=\"https://example.com/docs\">https://example.com/docs</a>)."));
    }

    #[test]
    fn autolinks_later_valid_urls_after_invalid_prefix_boundaries() {
        let rendered = render_markdown(
            "skiphttps://invalid.example https://valid.example/docs",
            SyntaxUiTheme::Dark,
        );

        assert!(rendered
            .html
            .contains("<a href=\"https://valid.example/docs\">https://valid.example/docs</a>"));
        assert!(!rendered
            .html
            .contains("<a href=\"https://invalid.example\">https://invalid.example</a>"));
    }

    #[test]
    fn renders_video_files_from_markdown_media_syntax() {
        let rendered = render_markdown("![Demo clip](./fixtures/demo.mp4)", SyntaxUiTheme::Dark);

        assert!(rendered.html.contains("<video controls preload=\"none\""));
        assert!(rendered.html.contains("src=\"./fixtures/demo.mp4\""));
        assert!(rendered.html.contains("<figcaption>Demo clip</figcaption>"));
        assert!(!rendered.html.contains("<img"));
    }

    #[test]
    fn preserves_standard_image_rendering_for_image_files() {
        let rendered = render_markdown(
            "![Preview image](./fixtures/preview.png)",
            SyntaxUiTheme::Dark,
        );

        assert!(rendered
            .html
            .contains("<img src=\"./fixtures/preview.png\" alt=\"Preview image\""));
    }

    #[test]
    fn highlights_typescript_fences_in_markdown_preview() {
        let rendered = render_markdown(
            "```typescript\nconst answer: number = 42;\nconsole.log(answer);\n```",
            SyntaxUiTheme::Dark,
        );

        assert!(
            rendered.html.contains("style=") && rendered.html.contains("<span"),
            "expected syntax-highlighted HTML for typescript fence, got: {}",
            rendered.html
        );
    }

    #[test]
    fn preserves_safe_raw_html_img_tags() {
        let rendered = render_markdown("<img src=\"etc/msrv-badge.svg\">", SyntaxUiTheme::Dark);

        assert!(rendered.html.contains("<img src=\"etc/msrv-badge.svg\" />"));
    }

    #[test]
    fn preserves_center_aligned_paragraph_wrapping_image() {
        let rendered = render_markdown(
            "<p align=\"center\">\n  <img src=\"usage/resource/qraftbox_log.png\" alt=\"QraftBox\" width=\"400\" />\n</p>",
            SyntaxUiTheme::Dark,
        );

        assert!(rendered.html.contains("<p align=\"center\">"));
        assert!(rendered.html.contains(
            "<img src=\"usage/resource/qraftbox_log.png\" alt=\"QraftBox\" width=\"400\" />"
        ));
        assert!(rendered.html.contains("</p>"));
    }

    #[test]
    fn strips_unsafe_attributes_from_raw_html_img_tags() {
        let rendered = render_markdown(
            "<img src=\"etc/msrv-badge.svg\" alt=\"MSRV\" onerror=\"alert(1)\">",
            SyntaxUiTheme::Dark,
        );

        assert!(rendered
            .html
            .contains("<img src=\"etc/msrv-badge.svg\" alt=\"MSRV\" />"));
        assert!(!rendered.html.contains("onerror"));
    }

    #[test]
    fn strips_unsafe_attributes_from_raw_paragraph_tags() {
        let rendered = render_markdown(
            "<p align=\"center\" onclick=\"alert(1)\">\nsafe\n</p>",
            SyntaxUiTheme::Dark,
        );

        assert!(rendered.html.contains("<p align=\"center\">"));
        assert!(rendered.html.contains("safe"));
        assert!(rendered.html.contains("</p>"));
        assert!(!rendered.html.contains("onclick"));
    }

    #[test]
    fn leaves_other_raw_html_as_text() {
        let rendered = render_markdown("<span>unsafe</span>", SyntaxUiTheme::Dark);

        assert!(rendered.html.contains("&lt;span&gt;unsafe&lt;/span&gt;"));
    }
}
