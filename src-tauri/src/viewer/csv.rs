//! Bounded CSV parsing for file-view previews.

use csv::StringRecord;

#[derive(Debug, Clone, Copy)]
pub struct CsvPreviewLimits {
    pub max_rows: usize,
    pub max_cells: usize,
}

impl Default for CsvPreviewLimits {
    fn default() -> Self {
        Self {
            max_rows: 4000,
            max_cells: 120_000,
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedCsvPreview {
    pub rows: Vec<Vec<String>>,
    pub column_count: usize,
    pub displayed_row_count: usize,
    pub total_row_count: Option<usize>,
    pub truncated: bool,
    pub parse_error: Option<String>,
}

pub fn parse_csv_preview(source: &str, limits: CsvPreviewLimits) -> ParsedCsvPreview {
    let mut reader = csv::ReaderBuilder::new()
        .flexible(true)
        .has_headers(false)
        .comment(None)
        .from_reader(source.as_bytes());

    let mut rows = Vec::new();
    let mut column_count = 0usize;
    let mut cell_total = 0usize;
    let mut truncated = false;
    let mut parse_error = None::<String>;

    if limits.max_rows == 0 || limits.max_cells == 0 {
        return ParsedCsvPreview {
            rows,
            column_count: 0,
            displayed_row_count: 0,
            total_row_count: None,
            truncated: true,
            parse_error: None,
        };
    }

    let mut records = reader.records();
    loop {
        let next = records.next();
        let Some(record_result) = next else {
            break;
        };

        match record_result {
            Ok(record) => {
                if rows.len() >= limits.max_rows {
                    truncated = true;
                    break;
                }

                let mut row_strings = csv_record_to_owned(&record);
                let full_row_len = row_strings.len();
                column_count = column_count.max(full_row_len);

                let remaining = limits.max_cells.saturating_sub(cell_total);
                if remaining == 0 {
                    truncated = true;
                    break;
                }

                if full_row_len <= remaining {
                    cell_total += full_row_len;
                    rows.push(row_strings);
                    if rows.len() >= limits.max_rows {
                        truncated = true;
                        break;
                    }
                    continue;
                }

                row_strings.truncate(remaining);
                rows.push(row_strings);
                truncated = true;
                break;
            }
            Err(source) => {
                parse_error = Some(source.to_string());
                rows.clear();
                column_count = 0;
                truncated = false;
                break;
            }
        }
    }

    let displayed_row_count = rows.len();

    let total_row_count = if parse_error.is_none() && !truncated {
        Some(displayed_row_count)
    } else {
        None
    };

    ParsedCsvPreview {
        rows,
        column_count,
        displayed_row_count,
        total_row_count,
        truncated,
        parse_error,
    }
}

fn csv_record_to_owned(record: &StringRecord) -> Vec<String> {
    record.iter().map(|cell| cell.to_string()).collect()
}

#[cfg(test)]
mod tests {
    use super::{parse_csv_preview, CsvPreviewLimits};

    #[test]
    fn parse_preserves_commas_inside_quotes() {
        let src = r#""hello, world",x"#;
        let parsed = parse_csv_preview(src, CsvPreviewLimits::default());
        assert!(parsed.parse_error.is_none());
        assert_eq!(parsed.rows.len(), 1);
        assert_eq!(
            parsed.rows[0],
            vec!["hello, world".to_string(), "x".to_string()]
        );
        assert_eq!(parsed.column_count, 2);
    }

    #[test]
    fn parse_decodes_escaped_inner_quotes() {
        let src = r#""say ""hey"" buddy",tail"#;
        let parsed = parse_csv_preview(src, CsvPreviewLimits::default());
        assert!(parsed.parse_error.is_none(), "{:?}", parsed.parse_error);
        assert_eq!(parsed.rows[0][0], "say \"hey\" buddy", "{:?}", parsed.rows);
        assert_eq!(parsed.rows[0][1], "tail");
    }

    #[test]
    fn parse_multiline_field() {
        let src = "\"line1\nline2\",z\n";
        let parsed = parse_csv_preview(src, CsvPreviewLimits::default());
        assert!(parsed.parse_error.is_none(), "{:?}", parsed.parse_error);
        assert_eq!(parsed.rows.len(), 1);
        assert_eq!(parsed.rows[0][0], "line1\nline2", "{:?}", parsed.rows[0]);
        assert_eq!(parsed.rows[0][1], "z");
    }

    #[test]
    fn parse_ragged_rows_sets_column_count() {
        let src = "a,b,c\nd,e\nf,g,h,i\n";
        let parsed = parse_csv_preview(src, CsvPreviewLimits::default());
        assert!(parsed.parse_error.is_none());
        assert_eq!(parsed.column_count, 4);
        assert_eq!(parsed.rows[1].len(), 2);
    }

    #[test]
    fn parse_truncates_at_row_limit() {
        let mut src = String::new();
        for i in 0..10 {
            src.push_str(&format!("{i}\n"));
        }
        let limits = CsvPreviewLimits {
            max_rows: 4,
            max_cells: 10_000,
        };
        let parsed = parse_csv_preview(&src, limits);
        assert!(parsed.parse_error.is_none());
        assert!(parsed.truncated);
        assert_eq!(parsed.displayed_row_count, 4);
        assert_eq!(parsed.total_row_count, None);
    }

    #[test]
    fn parse_truncates_at_cell_limit() {
        let src = "a,b,c,d\n";
        let limits = CsvPreviewLimits {
            max_rows: 100,
            max_cells: 3,
        };
        let parsed = parse_csv_preview(src, limits);
        assert!(parsed.parse_error.is_none());
        assert!(parsed.truncated);
        assert_eq!(parsed.displayed_row_count, 1);
        assert_eq!(parsed.rows[0], vec!["a", "b", "c"]);
        let cells: usize = parsed.rows.iter().map(|row| row.len()).sum();
        assert_eq!(cells, 3);
    }

    #[test]
    fn parse_truncates_wide_row_at_cell_budget() {
        let src = "cell1,cell2,cell3,cell4,cell5\n";
        let limits = CsvPreviewLimits {
            max_rows: 10,
            max_cells: 3,
        };
        let parsed = parse_csv_preview(src, limits);
        assert!(parsed.parse_error.is_none(), "{:?}", parsed.parse_error);
        assert!(parsed.truncated);
        assert_eq!(parsed.rows.len(), 1);
        assert_eq!(parsed.rows[0], vec!["cell1", "cell2", "cell3"]);
        assert_eq!(parsed.column_count, 5);
        let cells: usize = parsed.rows.iter().map(|row| row.len()).sum();
        assert!(cells <= limits.max_cells);
    }

    #[test]
    fn cell_total_never_exceeds_max_cells() {
        let src = "aa,bb,cc\n1,2,3,4,5\nx\n";
        for max_cells in 1usize..8 {
            let limits = CsvPreviewLimits {
                max_rows: 100,
                max_cells,
            };
            let parsed = parse_csv_preview(src, limits);
            let sum: usize = parsed.rows.iter().map(|row| row.len()).sum();
            assert!(
                sum <= max_cells,
                "max_cells={max_cells} got sum={sum} rows={:?}",
                parsed.rows
            );
        }
    }
}
