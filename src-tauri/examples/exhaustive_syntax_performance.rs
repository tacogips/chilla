//! Benchmark every exact generated grammar identity, including hidden syntaxes.
//! Timings exclude report generation and fingerprints. Inputs are checked-in synthetic snippets.
use std::{
    collections::{BTreeMap, BTreeSet},
    hint::black_box,
    path::Path,
    time::Instant,
};

use syntect::{
    dumps::from_uncompressed_data,
    highlighting::{HighlightIterator, HighlightState, Highlighter, Style, Theme, ThemeSet},
    html::{
        append_highlighted_html_for_styled_line, highlighted_html_for_string,
        start_highlighted_html_snippet, IncludeBackground,
    },
    parsing::{ParseState, ScopeStack, SyntaxReference, SyntaxSet},
    util::LinesWithEndings,
};

const PACK: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/chilla-syntaxes.packdump"));

#[path = "../src/syntax_highlight/render.rs"]
mod render;

fn staged_optimized(
    source: &str,
    set: &SyntaxSet,
    syntax: &SyntaxReference,
    theme: &Theme,
    highlighter: &Highlighter<'_>,
) -> Result<(serde_json::Value, String), Box<dyn std::error::Error>> {
    let stage_started = Instant::now();
    let started = Instant::now();
    let mut parser = ParseState::new(syntax);
    let mut scopes = ScopeStack::new();
    let mut styles = render::ScopeStyles::new(highlighter);
    let mut writer = render::HtmlWriter::new(theme, source.len());
    let setup_ms = started.elapsed().as_secs_f64() * 1000.0;
    let (mut parse_ms, mut style_ms, mut html_ms) = (0.0, 0.0, 0.0);
    for line in LinesWithEndings::from(source) {
        let started = Instant::now();
        let operations = parser.parse_line(line, set)?;
        parse_ms += started.elapsed().as_secs_f64() * 1000.0;
        let started = Instant::now();
        let mut regions = Vec::new();
        let mut start = 0;
        for (end, operation) in operations {
            if start < end {
                let Some(style) = styles.style(scopes.as_slice()) else {
                    return Ok((
                        serde_json::json!({"breakdown_available": false, "cache_limit": true, "instrumented_prefix_ms": stage_started.elapsed().as_secs_f64() * 1000.0}),
                        render::highlight(source, set, syntax, theme, highlighter)?,
                    ));
                };
                regions.push((style, &line[start..end]));
            }
            scopes.apply(&operation)?;
            start = end;
        }
        if start < line.len() {
            let Some(style) = styles.style(scopes.as_slice()) else {
                return Ok((
                    serde_json::json!({"breakdown_available": false, "cache_limit": true, "instrumented_prefix_ms": stage_started.elapsed().as_secs_f64() * 1000.0}),
                    render::highlight(source, set, syntax, theme, highlighter)?,
                ));
            };
            regions.push((style, &line[start..]));
        }
        style_ms += started.elapsed().as_secs_f64() * 1000.0;
        let started = Instant::now();
        for (style, text) in regions {
            writer.append(style, text)?;
        }
        writer.finish_line();
        html_ms += started.elapsed().as_secs_f64() * 1000.0;
    }
    Ok((
        serde_json::json!({ "breakdown_available": true, "setup_ms": setup_ms, "parse_ms": parse_ms, "style_ms": style_ms, "html_ms": html_ms }),
        writer.finish(),
    ))
}

fn staged(
    source: &str,
    set: &SyntaxSet,
    syntax: &SyntaxReference,
    theme: &Theme,
) -> Result<(serde_json::Value, String), Box<dyn std::error::Error>> {
    let started = Instant::now();
    let highlighter = Highlighter::new(theme);
    let mut parser = ParseState::new(syntax);
    let mut state = HighlightState::new(&highlighter, ScopeStack::new());
    let (mut html, background) = start_highlighted_html_snippet(theme);
    let setup_ms = started.elapsed().as_secs_f64() * 1000.0;
    let mut parse_ms = 0.0;
    let mut style_ms = 0.0;
    let mut html_ms = 0.0;
    for line in LinesWithEndings::from(source) {
        let started = Instant::now();
        let operations = parser.parse_line(line, set)?;
        parse_ms += started.elapsed().as_secs_f64() * 1000.0;
        let started = Instant::now();
        let regions: Vec<(Style, &str)> =
            HighlightIterator::new(&mut state, &operations, line, &highlighter).collect();
        style_ms += started.elapsed().as_secs_f64() * 1000.0;
        let started = Instant::now();
        append_highlighted_html_for_styled_line(
            &regions,
            IncludeBackground::IfDifferent(background),
            &mut html,
        )?;
        html_ms += started.elapsed().as_secs_f64() * 1000.0;
    }
    html.push_str("</pre>\n");
    Ok((
        serde_json::json!({ "setup_ms": setup_ms, "parse_ms": parse_ms, "style_ms": style_ms, "html_ms": html_ms }),
        html,
    ))
}

fn main() -> Result<(), Box<dyn std::error::Error>> {
    let syntaxes: SyntaxSet = from_uncompressed_data(PACK)?;
    let fixtures: BTreeMap<String, String> =
        serde_json::from_str(include_str!("support/exhaustive_fixtures.json"))?;
    let scopes: BTreeSet<_> = syntaxes
        .syntaxes()
        .iter()
        .map(|syntax| syntax.scope.to_string())
        .collect();
    assert_eq!(
        scopes,
        fixtures.keys().cloned().collect(),
        "every generated grammar needs exactly one explicit fixture"
    );
    let themes = ThemeSet::load_defaults();
    let baseline_mode = std::env::args().any(|argument| argument == "--baseline");
    let selected: Vec<_> = std::env::args()
        .filter_map(|argument| argument.strip_prefix("--scope=").map(str::to_owned))
        .collect();
    let selected_theme =
        std::env::args().find_map(|argument| argument.strip_prefix("--theme=").map(str::to_owned));
    let samples = std::env::args()
        .find_map(|argument| argument.strip_prefix("--samples=").map(str::to_owned))
        .map(|value| value.parse::<usize>())
        .transpose()?
        .unwrap_or(3);
    if !(1..=100).contains(&samples) {
        return Err("sample count must be between 1 and 100".into());
    }
    let mut entries = Vec::new();
    for identity in syntaxes.syntaxes() {
        let scope = identity.scope.to_string();
        if !selected.is_empty() && !selected.contains(&scope) {
            continue;
        }
        let snippet = &fixtures[&scope];
        let source = snippet.repeat(8192_usize.div_ceil(snippet.len()));
        let mut measurements = Vec::new();
        for (theme_name, theme_key) in [("dark", "base16-ocean.dark"), ("light", "InspiredGitHub")]
        {
            if selected_theme
                .as_deref()
                .is_some_and(|selected| selected != theme_name)
            {
                continue;
            }
            let started = Instant::now();
            let set: SyntaxSet = from_uncompressed_data(PACK)?;
            let set_load_ms = started.elapsed().as_secs_f64() * 1000.0;
            let syntax = set
                .find_syntax_by_scope(identity.scope)
                .ok_or("missing exact grammar identity")?;
            assert_eq!(syntax.name, identity.name);
            let theme = &themes.themes[theme_key];
            let started = Instant::now();
            let highlighter = Highlighter::new(theme);
            let highlighter_init_ms = if baseline_mode {
                0.0
            } else {
                started.elapsed().as_secs_f64() * 1000.0
            };
            let started = Instant::now();
            let first_html = if baseline_mode {
                highlighted_html_for_string(&source, &set, syntax, theme)?
            } else {
                render::highlight(&source, &set, syntax, theme, &highlighter)?
            };
            let cold_render_ms = started.elapsed().as_secs_f64() * 1000.0;
            // Stage cold work against a separate fresh set so instrumentation never warms
            // the measured first full render. Stage totals are not the full-render timer.
            let stage_set: SyntaxSet = from_uncompressed_data(PACK)?;
            let stage_syntax = stage_set
                .find_syntax_by_scope(identity.scope)
                .ok_or("missing stage grammar")?;
            let (cold_stages, cold_html) = if baseline_mode {
                staged(&source, &stage_set, stage_syntax, theme)?
            } else {
                staged_optimized(&source, &stage_set, stage_syntax, theme, &highlighter)?
            };
            assert_eq!(first_html, cold_html);
            let mut uncached_ms = Vec::new();
            let mut reference_uncached_ms = Vec::new();
            for iteration in 0..samples {
                let order = if iteration % 2 == 0 {
                    [true, false]
                } else {
                    [false, true]
                };
                for reference in order {
                    let started = Instant::now();
                    let html = if reference || baseline_mode {
                        highlighted_html_for_string(black_box(&source), &set, syntax, theme)?
                    } else {
                        render::highlight(black_box(&source), &set, syntax, theme, &highlighter)?
                    };
                    let elapsed_ms = started.elapsed().as_secs_f64() * 1000.0;
                    if reference {
                        reference_uncached_ms.push(elapsed_ms);
                    } else {
                        uncached_ms.push(elapsed_ms);
                    }
                    assert_eq!(
                        html, cold_html,
                        "optimized and reference pipelines must agree"
                    );
                    black_box(html);
                }
            }
            let (warm_stages, warm_html) = if baseline_mode {
                staged(&source, &set, syntax, theme)?
            } else {
                staged_optimized(&source, &set, syntax, theme, &highlighter)?
            };
            assert_eq!(warm_html, cold_html);
            measurements.push(serde_json::json!({
                "theme": theme_name, "set_load_ms": set_load_ms,
                "highlighter_init_ms": highlighter_init_ms, "cold_render_ms": cold_render_ms,
                "cold_total_ms": set_load_ms + highlighter_init_ms + cold_render_ms,
                "cold_stages": cold_stages, "warm_stages": warm_stages, "uncached_ms": uncached_ms,
                "reference_uncached_ms": reference_uncached_ms,
                "html_bytes": cold_html.len(), "spans": cold_html.matches("<span").count(),
                "html_hash": blake3::hash(cold_html.as_bytes()).to_string(),
            }));
        }
        entries.push(serde_json::json!({
            "name": identity.name, "scope": scope, "extensions": identity.file_extensions,
            "hidden": identity.hidden, "source_bytes": source.len(),
            "source_hash": blake3::hash(source.as_bytes()).to_string(), "measurements": measurements,
        }));
    }
    let inventory = chilla_lib::syntax_highlight::diagnostics::inventory();
    let expected_inventory: serde_json::Value =
        serde_json::from_str(include_str!("support/exhaustive_inventory.json"))?;
    assert_eq!(
        serde_json::to_value(&inventory)?,
        expected_inventory,
        "checked-in grammar identities must remain current"
    );
    let mut dispatch = Vec::new();
    for identity in &inventory {
        for extension in &identity.extensions {
            let path = format!("fixture.{extension}");
            dispatch.push(serde_json::json!({
                "declared_scope": identity.scope, "extension": extension,
                "file": chilla_lib::syntax_highlight::diagnostics::resolve(Some(Path::new(&path)), None, ""),
                "bare_filename": chilla_lib::syntax_highlight::diagnostics::resolve(Some(Path::new(extension)), None, ""),
                "fence": chilla_lib::syntax_highlight::diagnostics::resolve(None, Some(extension), ""),
            }));
        }
    }
    let aliases: Vec<_> = ["ts", "typescript", "tsx", "jsx", "shell", "shellscript", "console", "md", "swift", "nix", "json"]
        .into_iter().map(|language| serde_json::json!({
            "language": language, "resolution": chilla_lib::syntax_highlight::diagnostics::resolve(None, Some(language), ""),
        })).collect();
    let filenames: Vec<_> = [".bashrc", ".bash_profile", ".bash_login", ".bash_logout", ".bash_aliases", ".profile", ".zshenv", ".zprofile", ".zshrc", ".zlogin", ".zlogout", "bash", "sh", "zsh", "sample.env", "sample.ksh", "sample.nix", "sample.swift", "sample.JSON", "Cargo.lock", "Makefile", "Gemfile"]
        .into_iter().map(|path| serde_json::json!({
            "path": path, "resolution": chilla_lib::syntax_highlight::diagnostics::resolve(Some(Path::new(path)), None, ""),
        })).collect();
    println!(
        "{}",
        serde_json::to_string_pretty(&serde_json::json!({
            "profile": if cfg!(debug_assertions) { "debug" } else { "release" },
            "grammar_count": entries.len(), "fixture_target_bytes": 8192, "entries": entries,
            "pipeline": if baseline_mode { "syntect-reference" } else { "scope-cache-streaming" },
            "samples": samples, "sample_order": "alternating reference/optimized pairs",
            "timing_notes": "Each grammar/theme gets a fresh packdump for cold full rendering and a separate fresh packdump for cold stages. Theme loading is excluded. Highlighter setup is recorded separately for the optimized path, and is inside the reference renderer. Warm uncached calls reparse all source; no whole-source result cache is used. Stage instrumentation collects per-line regions; full optimized rendering streams them.",
            "dispatch": { "extensions": dispatch, "fence_aliases": aliases, "filenames": filenames },
        }))?
    );
    Ok(())
}
