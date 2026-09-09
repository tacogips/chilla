//! Synthetic shared-highlighter benchmark, emitting timings and fingerprints only.
//! Pass a language (or `all`), optionally `--light`. Each process starts with cold caches.
//! Add `--initialize` to measure syntax-set initialization separately before highlighting.
//! Add `--large` for roughly 256 KiB inputs (prefer release builds for this mode).

#[path = "support/syntax_fixtures.rs"]
mod syntax_fixtures;

use std::{hint::black_box, path::Path, time::Instant};

use chilla_lib::syntax_highlight::{describe_file_syntax, highlight_file_source, SyntaxUiTheme};

fn main() -> std::process::ExitCode {
    let language = std::env::args()
        .nth(1)
        .unwrap_or_else(|| "rust".to_string());
    let theme = if std::env::args()
        .skip(2)
        .any(|argument| argument == "--light")
    {
        SyntaxUiTheme::Light
    } else {
        SyntaxUiTheme::Dark
    };
    let languages: &[&str] = if language == "all" {
        syntax_fixtures::LANGUAGES
    } else {
        &[language.as_str()]
    };
    for (case, language) in languages.iter().enumerate() {
        let Some((extension, source)) = syntax_fixtures::fixture(language) else {
            eprintln!("unknown synthetic fixture language");
            return std::process::ExitCode::FAILURE;
        };
        let source = if std::env::args()
            .skip(2)
            .any(|argument| argument == "--large")
        {
            source.repeat(16)
        } else {
            source
        };
        let path = format!("synthetic.{extension}");
        println!(
            "language={language} theme={theme:?} process_first_case={} source_bytes={} source_hash={}",
            case == 0,
            source.len(),
            blake3::hash(source.as_bytes()),
        );
        if std::env::args()
            .skip(2)
            .any(|argument| argument == "--initialize")
        {
            let started = Instant::now();
            black_box(describe_file_syntax(Path::new(&path)));
            println!(
                "language={language} initialization_ms={:.3}",
                started.elapsed().as_secs_f64() * 1000.0
            );
        }
        for iteration in 0..3 {
            let started = Instant::now();
            let html = highlight_file_source(black_box(&source), Path::new(&path), theme);
            let elapsed = started.elapsed();
            println!(
                "language={language} iteration={iteration} highlight_ms={:.3} html_bytes={} spans={} html_hash={}",
                elapsed.as_secs_f64() * 1000.0,
                html.len(),
                html.matches("<span").count(),
                blake3::hash(html.as_bytes()),
            );
            black_box(html);
        }
    }
    std::process::ExitCode::SUCCESS
}
