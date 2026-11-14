use std::{fs, path::Path};

use super::{TestDir, ViewerService};
use crate::{
    syntax_highlight::SyntaxUiTheme,
    viewer::types::{CsvRowCountStatus, FileOpenOptions, FilePreview},
};

fn open_with_each_header_option(path: &Path) -> (FilePreview, FilePreview) {
    let service = ViewerService::new();
    let without_header = service
        .open_file_preview_with_options(
            path,
            SyntaxUiTheme::Dark,
            FileOpenOptions {
                csv_first_row_as_header: false,
            },
        )
        .expect("open CSV with first-row header disabled");
    let with_header = service
        .open_file_preview_with_options(
            path,
            SyntaxUiTheme::Dark,
            FileOpenOptions {
                csv_first_row_as_header: true,
            },
        )
        .expect("open CSV with first-row header enabled");

    (without_header, with_header)
}

fn assert_header_option_changes_only_metadata(
    without_header: FilePreview,
    with_header: FilePreview,
) -> (String, Vec<Vec<String>>, usize, usize, Option<usize>) {
    let FilePreview::Csv {
        path: without_path,
        file_name: without_file_name,
        mime_type: without_mime_type,
        raw_html: without_raw_html,
        rows: without_rows,
        column_count: without_column_count,
        displayed_row_count: without_displayed_row_count,
        total_row_count: without_total_row_count,
        row_count_status: without_row_count_status,
        truncated: without_truncated,
        formatted_available: without_formatted_available,
        parse_error: without_parse_error,
        first_row_as_header: without_first_row_as_header,
        size_bytes: without_size_bytes,
        last_modified: without_last_modified,
    } = without_header
    else {
        panic!("expected CSV preview with first-row header disabled");
    };
    let FilePreview::Csv {
        path: with_path,
        file_name: with_file_name,
        mime_type: with_mime_type,
        raw_html: with_raw_html,
        rows: with_rows,
        column_count: with_column_count,
        displayed_row_count: with_displayed_row_count,
        total_row_count: with_total_row_count,
        row_count_status: with_row_count_status,
        truncated: with_truncated,
        formatted_available: with_formatted_available,
        parse_error: with_parse_error,
        first_row_as_header: with_first_row_as_header,
        size_bytes: with_size_bytes,
        last_modified: with_last_modified,
    } = with_header
    else {
        panic!("expected CSV preview with first-row header enabled");
    };

    assert!(!without_first_row_as_header);
    assert!(with_first_row_as_header);
    assert_eq!(without_path, with_path);
    assert_eq!(without_file_name, with_file_name);
    assert_eq!(without_mime_type, with_mime_type);
    assert_eq!(without_raw_html, with_raw_html);
    assert_eq!(without_rows, with_rows);
    assert_eq!(without_column_count, with_column_count);
    assert_eq!(without_displayed_row_count, with_displayed_row_count);
    assert_eq!(without_total_row_count, with_total_row_count);
    assert_eq!(without_row_count_status, with_row_count_status);
    assert_eq!(without_truncated, with_truncated);
    assert_eq!(without_formatted_available, with_formatted_available);
    assert_eq!(without_parse_error, with_parse_error);
    assert_eq!(without_size_bytes, with_size_bytes);
    assert_eq!(without_last_modified, with_last_modified);

    (
        without_raw_html,
        without_rows,
        without_column_count,
        without_displayed_row_count,
        without_total_row_count,
    )
}

#[test]
fn open_file_preview_treats_csv_as_structured_preview() {
    let test_dir = TestDir::new();
    let csv_path = test_dir.path().join("data.csv");
    fs::write(&csv_path, "a,b\n\"c,d\",e\n").expect("write csv");

    match ViewerService::new()
        .open_file_preview(&csv_path, SyntaxUiTheme::Dark)
        .expect("csv preview")
    {
        FilePreview::Csv {
            mime_type,
            rows,
            column_count,
            row_count_status,
            formatted_available,
            parse_error,
            raw_html,
            first_row_as_header,
            ..
        } => {
            assert_eq!(mime_type, "text/csv");
            assert!(!first_row_as_header);
            assert!(formatted_available);
            assert!(parse_error.is_none());
            assert_eq!(row_count_status, CsvRowCountStatus::Complete);
            assert_eq!(column_count, 2);
            assert_eq!(rows.len(), 2);
            assert_eq!(rows[0], vec!["a", "b"]);
            assert_eq!(rows[1], vec!["c,d", "e"]);
            assert!(
                raw_html.contains("file-preview") && raw_html.contains("<pre"),
                "expected highlighted raw HTML wrapper, got: {raw_html}"
            );
        }
        _ => panic!("expected CSV preview"),
    }
}

#[test]
fn csv_open_options_change_only_header_metadata() {
    let test_dir = TestDir::new();
    let csv_path = test_dir.path().join("data.csv");
    fs::write(&csv_path, "first,second\nvalue,2\n").expect("write csv");

    let previews = open_with_each_header_option(&csv_path);
    let (_, rows, column_count, displayed_row_count, total_row_count) =
        assert_header_option_changes_only_metadata(previews.0, previews.1);
    assert_eq!(rows[0], vec!["first", "second"]);
    assert_eq!(column_count, 2);
    assert_eq!(displayed_row_count, 2);
    assert_eq!(total_row_count, Some(2));
}

#[test]
fn csv_open_options_preserve_lossy_utf8_and_flexible_rows() {
    let test_dir = TestDir::new();
    let csv_path = test_dir.path().join("lossy-ragged.csv");
    fs::write(&csv_path, b"first,na\xffme\nsecond,value,extra\n").expect("write lossy ragged CSV");

    let previews = open_with_each_header_option(&csv_path);
    for preview in [&previews.0, &previews.1] {
        let FilePreview::Csv {
            formatted_available,
            parse_error,
            row_count_status,
            truncated,
            ..
        } = preview
        else {
            panic!("expected CSV preview for lossy ragged input");
        };
        assert!(formatted_available);
        assert!(parse_error.is_none());
        assert_eq!(*row_count_status, CsvRowCountStatus::Complete);
        assert!(!truncated);
    }
    let (raw_html, rows, column_count, displayed_row_count, total_row_count) =
        assert_header_option_changes_only_metadata(previews.0, previews.1);
    assert_eq!(
        rows,
        vec![
            vec!["first", "na\u{fffd}me"],
            vec!["second", "value", "extra"]
        ]
    );
    assert_eq!(column_count, 3);
    assert_eq!(displayed_row_count, 2);
    assert_eq!(total_row_count, Some(2));
    assert!(raw_html.contains("Encoding: UTF-8 with replacement characters"));
}

#[test]
fn csv_preview_serializes_first_row_as_header_in_snake_case() {
    let test_dir = TestDir::new();
    let csv_path = test_dir.path().join("data.csv");
    fs::write(&csv_path, "first,second\nvalue,2\n").expect("write csv");

    let preview = ViewerService::new()
        .open_file_preview_with_options(
            &csv_path,
            SyntaxUiTheme::Dark,
            FileOpenOptions {
                csv_first_row_as_header: true,
            },
        )
        .expect("open CSV with first-row header enabled");
    let serialized = serde_json::to_value(preview).expect("serialize CSV preview");

    assert_eq!(serialized["first_row_as_header"], true);
    assert!(serialized.get("firstRowAsHeader").is_none());
}

#[test]
fn csv_open_options_preserve_bom_source_content_and_metadata() {
    let test_dir = TestDir::new();
    let csv_path = test_dir.path().join("bom.csv");
    fs::write(&csv_path, b"\xef\xbb\xbffirst,second\nvalue,2\n").expect("write BOM CSV");

    let previews = open_with_each_header_option(&csv_path);
    let (raw_html, rows, column_count, displayed_row_count, total_row_count) =
        assert_header_option_changes_only_metadata(previews.0, previews.1);
    assert_eq!(rows, vec![vec!["first", "second"], vec!["value", "2"]]);
    assert_eq!(column_count, 2);
    assert_eq!(displayed_row_count, 2);
    assert_eq!(total_row_count, Some(2));
    assert!(!raw_html.contains('\u{feff}'));
}

#[test]
fn csv_open_options_preserve_empty_source_content_and_metadata() {
    let test_dir = TestDir::new();
    let csv_path = test_dir.path().join("empty.csv");
    fs::write(&csv_path, []).expect("write empty CSV");

    let previews = open_with_each_header_option(&csv_path);
    let (_, rows, column_count, displayed_row_count, total_row_count) =
        assert_header_option_changes_only_metadata(previews.0, previews.1);
    assert!(rows.is_empty());
    assert_eq!(column_count, 0);
    assert_eq!(displayed_row_count, 0);
    assert_eq!(total_row_count, Some(0));
}
