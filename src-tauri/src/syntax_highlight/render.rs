//! Stream parsed scopes into HTML, reusing styles within this render only.
use std::collections::HashMap;

use syntect::{
    highlighting::{Color, HighlightIterator, HighlightState, Highlighter, Style, Theme},
    html::{
        append_highlighted_html_for_styled_line, start_highlighted_html_snippet, IncludeBackground,
    },
    parsing::{ParseState, Scope, ScopeStack, SyntaxReference, SyntaxSet},
    util::LinesWithEndings,
};

// Bound temporary cache memory even when a document produces many distinct paths.
const MAX_CACHED_SCOPE_PATHS: usize = 512;
const MAX_CACHED_SCOPE_DEPTH: usize = 32;
const MAX_CACHED_STYLE_OPENINGS: usize = 128;

pub(crate) struct ScopeStyles<'a> {
    highlighter: &'a Highlighter<'a>,
    cached: HashMap<Vec<Scope>, Style>,
}

impl<'a> ScopeStyles<'a> {
    pub(crate) fn new(highlighter: &'a Highlighter<'a>) -> Self {
        Self {
            highlighter,
            cached: HashMap::new(),
        }
    }

    pub(crate) fn style(&mut self, scopes: &[Scope]) -> Option<Style> {
        if let Some(style) = self.cached.get(scopes) {
            return Some(*style);
        }
        if self.cached.len() >= MAX_CACHED_SCOPE_PATHS || scopes.len() > MAX_CACHED_SCOPE_DEPTH {
            return None;
        }
        let style = self.highlighter.style_for_stack(scopes);
        self.cached.insert(scopes.to_vec(), style);
        Some(style)
    }
}

pub(crate) struct HtmlWriter {
    output: String,
    background: Color,
    openings: HashMap<Style, String>,
    previous: Option<Style>,
}

impl HtmlWriter {
    pub(crate) fn new(theme: &Theme, source_bytes: usize) -> Self {
        let (mut output, background) = start_highlighted_html_snippet(theme);
        output.reserve(source_bytes);
        Self {
            output,
            background,
            openings: HashMap::new(),
            previous: None,
        }
    }

    pub(crate) fn append(&mut self, style: Style, text: &str) -> Result<(), syntect::Error> {
        let unified = self.previous.is_some_and(|previous| {
            style == previous || (style.background == previous.background && text.trim().is_empty())
        });
        if !unified {
            self.finish_line();
            if let Some(opening) = self.openings.get(&style) {
                self.output.push_str(opening);
            } else {
                let mut opening = String::new();
                // Let Syntect define CSS ordering, font flags, and alpha formatting.
                append_highlighted_html_for_styled_line(
                    &[(style, "")],
                    IncludeBackground::IfDifferent(self.background),
                    &mut opening,
                )?;
                opening.truncate(opening.len() - "</span>".len());
                self.output.push_str(&opening);
                if self.openings.len() < MAX_CACHED_STYLE_OPENINGS {
                    self.openings.insert(style, opening);
                }
            }
            self.previous = Some(style);
        }
        append_escaped(&mut self.output, text);
        Ok(())
    }

    pub(crate) fn finish_line(&mut self) {
        if self.previous.take().is_some() {
            self.output.push_str("</span>");
        }
    }

    pub(crate) fn finish(mut self) -> String {
        self.finish_line();
        self.output.push_str("</pre>\n");
        self.output
    }
}

fn append_escaped(output: &mut String, text: &str) {
    let mut start = 0;
    for (index, byte) in text.bytes().enumerate() {
        let escaped = match byte {
            b'&' => "&amp;",
            b'<' => "&lt;",
            b'>' => "&gt;",
            b'\'' => "&#39;",
            b'"' => "&quot;",
            _ => continue,
        };
        output.push_str(&text[start..index]);
        output.push_str(escaped);
        start = index + 1;
    }
    output.push_str(&text[start..]);
}

pub(crate) fn highlight(
    source: &str,
    set: &SyntaxSet,
    syntax: &SyntaxReference,
    theme: &Theme,
    highlighter: &Highlighter<'_>,
) -> Result<String, syntect::Error> {
    let mut parser = ParseState::new(syntax);
    let mut scopes = ScopeStack::new();
    let mut styles = ScopeStyles::new(highlighter);
    let mut writer = HtmlWriter::new(theme, source.len());
    let mut incremental: Option<HighlightState> = None;
    for line in LinesWithEndings::from(source) {
        let operations = parser.parse_line(line, set)?;
        if let Some(state) = incremental.as_mut() {
            for (style, text) in HighlightIterator::new(state, &operations, line, highlighter) {
                writer.append(style, text)?;
            }
            writer.finish_line();
            continue;
        }
        let mut start = 0;
        for (index, (end, operation)) in operations.iter().enumerate() {
            if start < *end {
                let Some(style) = styles.style(scopes.as_slice()) else {
                    // Continue from the current full stack (including clear/restore
                    // history), without reparsing or re-emitting the completed prefix.
                    let mut state = HighlightState::new(highlighter, scopes.clone());
                    let remaining: Vec<_> = operations[index..]
                        .iter()
                        .map(|(offset, operation)| (offset - start, operation.clone()))
                        .collect();
                    for (style, text) in
                        HighlightIterator::new(&mut state, &remaining, &line[start..], highlighter)
                    {
                        writer.append(style, text)?;
                    }
                    incremental = Some(state);
                    break;
                };
                writer.append(style, &line[start..*end])?;
            }
            scopes.apply(operation)?;
            start = *end;
        }
        if incremental.is_none() && start < line.len() {
            if let Some(style) = styles.style(scopes.as_slice()) {
                writer.append(style, &line[start..])?;
            } else {
                let mut state = HighlightState::new(highlighter, scopes.clone());
                for (style, text) in
                    HighlightIterator::new(&mut state, &[], &line[start..], highlighter)
                {
                    writer.append(style, text)?;
                }
                incremental = Some(state);
            }
        }
        writer.finish_line();
    }
    Ok(writer.finish())
}

#[cfg(test)]
mod tests {
    use super::*;
    use syntect::{
        highlighting::{FontStyle, ThemeSet},
        parsing::{ClearAmount, ScopeStackOp, SyntaxDefinition},
    };

    #[test]
    fn cached_styles_preserve_zero_width_clear_and_restore_operations() {
        let themes = ThemeSet::load_defaults();
        for theme in themes.themes.values() {
            let highlighter = Highlighter::new(theme);
            let operations = vec![
                (0, ScopeStackOp::Push(Scope::new("source.rust").unwrap())),
                (0, ScopeStackOp::Push(Scope::new("meta.block").unwrap())),
                (
                    1,
                    ScopeStackOp::Push(Scope::new("string.quoted.double").unwrap()),
                ),
                (2, ScopeStackOp::Clear(ClearAmount::All)),
                (3, ScopeStackOp::Restore),
                (
                    3,
                    ScopeStackOp::Push(Scope::new("constant.numeric").unwrap()),
                ),
                (4, ScopeStackOp::Pop(1)),
                (5, ScopeStackOp::Clear(ClearAmount::TopN(1))),
                (6, ScopeStackOp::Restore),
                (7, ScopeStackOp::Pop(2)),
                (8, ScopeStackOp::Noop),
            ];
            let text = "abcdefghi";
            let mut expected_state = HighlightState::new(&highlighter, ScopeStack::new());
            let expected: Vec<_> =
                HighlightIterator::new(&mut expected_state, &operations, text, &highlighter)
                    .collect();
            let mut scopes = ScopeStack::new();
            let mut cache = ScopeStyles::new(&highlighter);
            let mut actual = Vec::new();
            let mut start = 0;
            for (end, operation) in operations {
                if start < end {
                    actual.push((cache.style(scopes.as_slice()).unwrap(), &text[start..end]));
                }
                scopes.apply(&operation).unwrap();
                start = end;
            }
            actual.push((cache.style(scopes.as_slice()).unwrap(), &text[start..]));
            assert_eq!(actual, expected);
        }
    }

    #[test]
    fn scope_cache_limits_do_not_truncate_keys_or_return_wrong_styles() {
        let theme = Theme::default();
        let highlighter = Highlighter::new(&theme);
        let mut cache = ScopeStyles::new(&highlighter);
        let scope = Scope::new("source.test").unwrap();
        assert!(cache
            .style(&vec![scope; MAX_CACHED_SCOPE_DEPTH + 1])
            .is_none());
        for index in 0..MAX_CACHED_SCOPE_PATHS {
            let path = [Scope::new(&format!("source.unique{index}")).unwrap()];
            assert_eq!(cache.style(&path), Some(highlighter.style_for_stack(&path)));
        }
        assert_eq!(cache.cached.len(), MAX_CACHED_SCOPE_PATHS);
        assert!(cache.style(&[scope]).is_none());
    }

    #[test]
    fn writer_preserves_flags_whitespace_alpha_escaping_and_bounded_openings() {
        let theme = Theme::default();
        let base = Highlighter::new(&theme).get_default();
        let mut writer = HtmlWriter::new(&theme, 0);
        let mut regions = Vec::new();
        for index in 0..=255 {
            let style = Style {
                foreground: Color {
                    r: index,
                    g: 10,
                    b: 30,
                    a: index,
                },
                font_style: FontStyle::BOLD | FontStyle::ITALIC | FontStyle::UNDERLINE,
                ..base
            };
            regions.push((style, "日本語 <>&'\""));
            regions.push((base, " \n\t"));
        }
        for (style, text) in &regions {
            writer.append(*style, text).unwrap();
        }
        assert!(writer.openings.len() <= MAX_CACHED_STYLE_OPENINGS);
        let (mut expected, background) = start_highlighted_html_snippet(&theme);
        append_highlighted_html_for_styled_line(
            &regions,
            IncludeBackground::IfDifferent(background),
            &mut expected,
        )
        .unwrap();
        expected.push_str("</pre>\n");
        assert_eq!(writer.finish(), expected);
    }

    #[test]
    fn deep_stack_fallback_preserves_midline_prefix_and_following_lines() {
        let definition = SyntaxDefinition::load_from_str(
            "name: Nested\nscope: source.nested\ncontexts:\n  main:\n    - match: '\\['\n      push: nested\n  nested:\n    - meta_scope: meta.nested\n    - match: '\\['\n      push: nested\n    - match: '\\]'\n      pop: true\n    - match: '<'\n      push:\n        - clear_scopes: true\n        - meta_scope: string.quoted.double\n        - match: '>'\n          pop: true\n",
            true, None,
        ).unwrap();
        let mut builder = SyntaxSet::new().into_builder();
        builder.add(definition);
        let set = builder.build();
        let syntax = set.find_syntax_by_name("Nested").unwrap();
        let source = format!(
            "{}prefix {}<日本語 &>tail{} suffix\n[<next line>]\n",
            "prior line\n".repeat(100),
            "[".repeat(40),
            "]".repeat(40)
        );
        let themes = ThemeSet::load_defaults();
        for theme in themes.themes.values() {
            let expected =
                syntect::html::highlighted_html_for_string(&source, &set, syntax, theme).unwrap();
            let actual = highlight(&source, &set, syntax, theme, &Highlighter::new(theme)).unwrap();
            assert_eq!(actual, expected);
        }
    }
}
