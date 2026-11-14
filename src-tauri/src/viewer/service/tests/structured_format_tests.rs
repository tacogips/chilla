use std::fs;

use super::{TestDir, ViewerService};
use crate::{
    syntax_highlight::SyntaxUiTheme,
    viewer::types::{FilePreview, StructuredDataFormat},
};

#[test]
fn json_text_preview_offers_a_formatted_view() {
    let test_dir = TestDir::new();
    let path = test_dir.path().join("data.json");
    fs::write(&path, r#"{"b":1,"a":2}"#).expect("write json");

    match ViewerService::new()
        .open_file_preview(&path, SyntaxUiTheme::Dark)
        .expect("json preview")
    {
        FilePreview::Text {
            structured_format,
            formatted_html,
            format_notice,
            file_type,
            ..
        } => {
            assert_eq!(structured_format, Some(StructuredDataFormat::Json));
            assert_eq!(file_type, "JSON");
            let formatted_html = formatted_html.expect("expected formatted JSON html");
            assert!(formatted_html.contains("file-preview--text"));
            assert!(formatted_html.contains("Formatted"));
            // key order preserved, pretty-printed with 2-space indent
            assert!(formatted_html.contains("b"));
            assert!(formatted_html.contains("a"));
            assert!(format_notice.is_none());
        }
        _ => panic!("expected text preview for JSON"),
    }
}

#[test]
fn json_lines_text_preview_reports_partial_failures_in_the_notice() {
    let test_dir = TestDir::new();
    let path = test_dir.path().join("data.jsonl");
    fs::write(&path, "{\"a\":1}\nnot json\n{\"b\":2}\n").expect("write jsonl");

    match ViewerService::new()
        .open_file_preview(&path, SyntaxUiTheme::Dark)
        .expect("jsonl preview")
    {
        FilePreview::Text {
            structured_format,
            formatted_html,
            format_notice,
            file_type,
            ..
        } => {
            assert_eq!(structured_format, Some(StructuredDataFormat::JsonLines));
            assert_eq!(file_type, "JSON Lines");
            let formatted_html = formatted_html.expect("partial JSONL formatting still succeeds");
            assert!(formatted_html.contains("file-preview__notice"));
            assert!(formatted_html.contains("not json"));
            let notice = format_notice.expect("expected a partial-formatting notice");
            assert!(notice.contains("1 line"));
        }
        _ => panic!("expected text preview for JSON Lines"),
    }
}

#[test]
fn xml_text_preview_offers_a_formatted_view() {
    let test_dir = TestDir::new();
    let path = test_dir.path().join("data.xml");
    fs::write(&path, "<root><child>value</child></root>").expect("write xml");

    match ViewerService::new()
        .open_file_preview(&path, SyntaxUiTheme::Dark)
        .expect("xml preview")
    {
        FilePreview::Text {
            structured_format,
            formatted_html,
            format_notice,
            ..
        } => {
            assert_eq!(structured_format, Some(StructuredDataFormat::Xml));
            let formatted_html = formatted_html.expect("expected formatted XML html");
            assert!(formatted_html.contains("&lt;child&gt;") || formatted_html.contains("child"));
            assert!(format_notice.is_none());
        }
        _ => panic!("expected text preview for XML"),
    }
}

#[test]
fn invalid_json_disables_the_formatted_view_but_keeps_raw_preview() {
    let test_dir = TestDir::new();
    let path = test_dir.path().join("broken.json");
    fs::write(&path, "{not valid json").expect("write invalid json");

    match ViewerService::new()
        .open_file_preview(&path, SyntaxUiTheme::Dark)
        .expect("json preview even when malformed")
    {
        FilePreview::Text {
            structured_format,
            formatted_html,
            format_notice,
            html,
            ..
        } => {
            assert_eq!(structured_format, Some(StructuredDataFormat::Json));
            assert!(formatted_html.is_none());
            assert!(format_notice.is_some());
            assert!(html.contains("not valid json"));
        }
        _ => panic!("expected text preview for malformed JSON"),
    }
}

#[test]
fn plain_rust_source_has_no_structured_format() {
    let test_dir = TestDir::new();
    let path = test_dir.path().join("main.rs");
    fs::write(&path, "fn main() {}\n").expect("write rust source");

    match ViewerService::new()
        .open_file_preview(&path, SyntaxUiTheme::Dark)
        .expect("rust source preview")
    {
        FilePreview::Text {
            structured_format,
            formatted_html,
            format_notice,
            ..
        } => {
            assert_eq!(structured_format, None);
            assert!(formatted_html.is_none());
            assert!(format_notice.is_none());
        }
        _ => panic!("expected text preview for Rust source"),
    }
}

#[test]
fn html_text_preview_offers_a_formatted_view() {
    let test_dir = TestDir::new();
    let path = test_dir.path().join("page.html");
    fs::write(&path, "<div><p>hello <b>world</b></p></div>").expect("write html");

    match ViewerService::new()
        .open_file_preview(&path, SyntaxUiTheme::Dark)
        .expect("html preview")
    {
        FilePreview::Text {
            structured_format,
            formatted_html,
            format_notice,
            ..
        } => {
            assert_eq!(structured_format, Some(StructuredDataFormat::Html));
            let formatted_html = formatted_html.expect("HTML formatting is always produced");
            assert!(formatted_html.contains("file-preview--text"));
            assert!(formatted_html.contains("Formatted"));
            assert!(format_notice.is_none());
        }
        _ => panic!("expected text preview for HTML"),
    }
}

#[test]
fn css_text_preview_offers_a_formatted_view() {
    let test_dir = TestDir::new();
    let path = test_dir.path().join("styles.css");
    fs::write(&path, "a{color:red;background:blue}").expect("write css");

    match ViewerService::new()
        .open_file_preview(&path, SyntaxUiTheme::Dark)
        .expect("css preview")
    {
        FilePreview::Text {
            structured_format,
            formatted_html,
            format_notice,
            ..
        } => {
            assert_eq!(structured_format, Some(StructuredDataFormat::Css));
            let formatted_html = formatted_html.expect("CSS formatting is always produced");
            assert!(formatted_html.contains("color: red;"));
            assert!(format_notice.is_none());
        }
        _ => panic!("expected text preview for CSS"),
    }
}

#[test]
fn javascript_text_preview_offers_a_formatted_view() {
    let test_dir = TestDir::new();
    let path = test_dir.path().join("app.js");
    fs::write(&path, "function f(a,b){return a+b;}").expect("write js");

    match ViewerService::new()
        .open_file_preview(&path, SyntaxUiTheme::Dark)
        .expect("js preview")
    {
        FilePreview::Text {
            structured_format,
            formatted_html,
            format_notice,
            ..
        } => {
            assert_eq!(structured_format, Some(StructuredDataFormat::JavaScript));
            let formatted_html = formatted_html.expect("JS formatting is always produced");
            assert!(formatted_html.contains("file-preview--text"));
            assert!(format_notice.is_none());
        }
        _ => panic!("expected text preview for JavaScript"),
    }
}

#[test]
fn tsv_file_is_routed_to_csv_preview_with_tab_delimited_rows() {
    let test_dir = TestDir::new();
    let path = test_dir.path().join("data.tsv");
    fs::write(&path, "a,b\tc,d\n1,2\t3,4\n").expect("write tsv");

    match ViewerService::new()
        .open_file_preview(&path, SyntaxUiTheme::Dark)
        .expect("tsv preview")
    {
        FilePreview::Csv {
            mime_type,
            rows,
            column_count,
            parse_error,
            ..
        } => {
            assert_eq!(mime_type, "text/tab-separated-values");
            assert!(parse_error.is_none());
            assert_eq!(column_count, 2);
            assert_eq!(rows[0], vec!["a,b".to_string(), "c,d".to_string()]);
            assert_eq!(rows[1], vec!["1,2".to_string(), "3,4".to_string()]);
        }
        _ => panic!("expected CSV-shaped preview for TSV"),
    }
}
