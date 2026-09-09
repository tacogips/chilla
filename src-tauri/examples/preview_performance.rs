//! Run with an explicit local text-file path. Only aggregate metrics are printed.
//! Append `--preview-only` to measure a cold full preview in a fresh process.
//! Append `--light` to measure the light theme instead of the default dark theme.
use std::{hint::black_box, path::PathBuf, time::Instant};

use chilla_lib::{
    syntax_highlight::{highlight_file_source, SyntaxUiTheme},
    viewer::service::ViewerService,
};

fn run() -> Result<(), &'static str> {
    let path = std::env::args_os()
        .nth(1)
        .map(PathBuf::from)
        .ok_or("provide a local text-file path")?;
    let started = Instant::now();
    let bytes = std::fs::read(&path).map_err(|_| "input read failed")?;
    println!(
        "read_ms={:.3} source_bytes={}",
        started.elapsed().as_secs_f64() * 1000.0,
        bytes.len()
    );
    let source = String::from_utf8_lossy(&bytes);
    let preview_only = std::env::args_os()
        .skip(2)
        .any(|arg| arg == "--preview-only");
    let theme = if std::env::args_os().skip(2).any(|arg| arg == "--light") {
        SyntaxUiTheme::Light
    } else {
        SyntaxUiTheme::Dark
    };
    for iteration in 0..if preview_only { 0 } else { 4 } {
        let started = Instant::now();
        let html = highlight_file_source(black_box(&source), &path, theme);
        println!(
            "highlight_iteration={iteration} highlight_ms={:.3} html_bytes={} spans={}",
            started.elapsed().as_secs_f64() * 1000.0,
            html.len(),
            html.matches("<span").count()
        );
        black_box(html);
    }
    for iteration in 0..4 {
        let started = Instant::now();
        let preview = ViewerService::new()
            .open_file_preview(&path, theme)
            .map_err(|_| "preview failed")?;
        let preview_ms = started.elapsed().as_secs_f64() * 1000.0;
        let started = Instant::now();
        let serialized =
            serde_json::to_vec(black_box(&preview)).map_err(|_| "serialization failed")?;
        println!("preview_iteration={iteration} preview_ms={preview_ms:.3} serialize_ms={:.3} response_bytes={}", started.elapsed().as_secs_f64() * 1000.0, serialized.len());
        black_box(serialized);
    }
    Ok(())
}

fn main() -> std::process::ExitCode {
    match run() {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("{message}");
            std::process::ExitCode::FAILURE
        }
    }
}
