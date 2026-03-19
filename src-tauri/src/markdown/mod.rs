use std::collections::BTreeMap;

use pulldown_cmark::{html::push_html, CowStr, Event, HeadingLevel, Options, Parser, Tag, TagEnd};

use crate::document::types::HeadingNode;

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

pub fn render_markdown(source_text: &str) -> RenderedDocument {
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

    let html = render_html_with_heading_ids(raw_events, &flat_headings);
    let headings = build_heading_tree(&flat_headings);

    RenderedDocument { html, headings }
}

fn parser_options() -> Options {
    let mut options = Options::empty();
    options.insert(Options::ENABLE_STRIKETHROUGH);
    options.insert(Options::ENABLE_TABLES);
    options.insert(Options::ENABLE_TASKLISTS);
    options
}

fn sanitize_event(event: Event<'_>) -> Event<'_> {
    match event {
        Event::Html(html) | Event::InlineHtml(html) => Event::Text(html),
        other => other,
    }
}

fn render_html_with_heading_ids(events: Vec<Event<'_>>, flat_headings: &[FlatHeading]) -> String {
    let mut heading_index = 0usize;
    let mut output_events = Vec::with_capacity(events.len());

    for event in events {
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
            other => output_events.push(other),
        }
    }

    let mut html = String::new();
    push_html(&mut html, output_events.into_iter());
    html
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
    use super::render_markdown;

    #[test]
    fn renders_heading_ids_and_nested_headings() {
        let rendered =
            render_markdown("# Intro\n\n## Child Topic\n\n### Deep Topic\n\n## Child Topic\n");

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
        let rendered = render_markdown("```mermaid\ngraph TD;\nA-->B;\n```");

        assert!(rendered.html.contains("language-mermaid"));
        assert!(rendered.html.contains("graph TD;"));
    }
}
