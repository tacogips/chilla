//! Formatters for the "Formatted" view of structured data text previews.
//!
//! Every formatter here is token based: source bytes are re-emitted as-is
//! (key order, duplicate keys, string escapes, numeric spelling, attribute
//! and entity text) and only whitespace/indentation is rewritten. None of
//! them deserialize into a generic map, so formatting never changes meaning.

mod css;
mod html;
mod javascript;
mod json;
mod xml;

use std::path::Path;

use crate::viewer::types::StructuredDataFormat;

/// Formatting is skipped above this size; the raw view remains available.
const MAX_FORMAT_SOURCE_BYTES: usize = 16 * 1024 * 1024;

/// Result of attempting to format a structured data source.
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct FormatOutcome {
    /// The formatted text, or `None` if formatting failed entirely (or was
    /// skipped because the source is too large).
    pub formatted: Option<String>,
    /// A human-readable reason formatting is unavailable, or a
    /// partial-formatting notice (e.g. JSON Lines records left verbatim).
    pub notice: Option<String>,
}

/// Maps a file path to the structured data family it belongs to, based on
/// its extension (case-insensitive), matching the format inventory in
/// `design-docs/specs/design-structured-data-formatting.md`.
pub fn structured_format_for_path(path: &Path) -> Option<StructuredDataFormat> {
    let extension = path.extension()?.to_str()?.to_ascii_lowercase();
    match extension.as_str() {
        "json" | "geojson" | "jsonld" | "webmanifest" | "har" => Some(StructuredDataFormat::Json),
        "jsonl" | "ndjson" | "jsonlines" => Some(StructuredDataFormat::JsonLines),
        "xml" | "xsd" | "xsl" | "xslt" | "rss" | "atom" | "opml" | "plist" | "wsdl" | "kml"
        | "gpx" | "csproj" | "fsproj" | "vbproj" | "props" | "targets" | "resx" | "xaml"
        | "nuspec" => Some(StructuredDataFormat::Xml),
        "html" | "htm" | "xhtml" | "shtml" => Some(StructuredDataFormat::Html),
        "css" | "scss" | "less" => Some(StructuredDataFormat::Css),
        "js" | "mjs" | "cjs" | "jsx" | "ts" | "mts" | "cts" | "tsx" => {
            Some(StructuredDataFormat::JavaScript)
        }
        _ => None,
    }
}

/// Formats `source` according to `format`. Never panics on malformed input;
/// failures are reported through `FormatOutcome::notice`. `path` is only
/// consulted by the JavaScript/TypeScript formatter, to always use
/// re-indent-only mode for `.jsx`/`.tsx` (JSX syntax is never re-broken).
pub fn format_structured_source(
    source: &str,
    format: StructuredDataFormat,
    path: &Path,
) -> FormatOutcome {
    if source.len() > MAX_FORMAT_SOURCE_BYTES {
        let limit_mib = MAX_FORMAT_SOURCE_BYTES / (1024 * 1024);
        return FormatOutcome {
            formatted: None,
            notice: Some(format!(
                "File is larger than {limit_mib} MiB; formatting is skipped."
            )),
        };
    }

    match format {
        StructuredDataFormat::Json => match json::format_json(source) {
            Ok(formatted) => FormatOutcome {
                formatted: Some(formatted),
                notice: None,
            },
            Err(message) => FormatOutcome {
                formatted: None,
                notice: Some(message),
            },
        },
        StructuredDataFormat::JsonLines => json::format_json_lines(source),
        StructuredDataFormat::Xml => match xml::format_xml(source) {
            Ok(formatted) => FormatOutcome {
                formatted: Some(formatted),
                notice: None,
            },
            Err(message) => FormatOutcome {
                formatted: None,
                notice: Some(message),
            },
        },
        // HTML/CSS/JS are lenient best-effort beautifiers: they never fail,
        // so there is never a notice once past the size-limit check above.
        StructuredDataFormat::Html => FormatOutcome {
            formatted: Some(html::format_html(source)),
            notice: None,
        },
        StructuredDataFormat::Css => FormatOutcome {
            formatted: Some(css::format_css(source)),
            notice: None,
        },
        StructuredDataFormat::JavaScript => {
            let is_jsx = path
                .extension()
                .and_then(|extension| extension.to_str())
                .is_some_and(|extension| {
                    extension.eq_ignore_ascii_case("jsx") || extension.eq_ignore_ascii_case("tsx")
                });
            FormatOutcome {
                formatted: Some(javascript::format_javascript(source, is_jsx)),
                notice: None,
            }
        }
    }
}

/// Computes the 1-based `(line, column)` of a byte offset within `source`,
/// counting each `char` as one column.
fn line_col(source: &str, byte_pos: usize) -> (usize, usize) {
    let end = byte_pos.min(source.len());
    let mut line = 1usize;
    let mut column = 1usize;
    for ch in source[..end].chars() {
        if ch == '\n' {
            line += 1;
            column = 1;
        } else {
            column += 1;
        }
    }
    (line, column)
}

/// Formats an error message with a 1-based line and column.
fn error_at(source: &str, byte_pos: usize, message: &str) -> String {
    let (line, column) = line_col(source, byte_pos);
    format!("{message} at line {line}, column {column}")
}

#[cfg(test)]
mod tests {
    use std::path::Path;

    use super::{format_structured_source, structured_format_for_path, MAX_FORMAT_SOURCE_BYTES};
    use crate::viewer::types::StructuredDataFormat;

    #[test]
    fn structured_format_for_path_matches_the_format_inventory() {
        let json_cases = ["a.json", "a.GEOJSON", "a.jsonld", "a.webmanifest", "a.har"];
        for case in json_cases {
            assert_eq!(
                structured_format_for_path(Path::new(case)),
                Some(StructuredDataFormat::Json),
                "expected JSON for {case}"
            );
        }

        let json_lines_cases = ["a.jsonl", "a.NDJSON", "a.jsonlines"];
        for case in json_lines_cases {
            assert_eq!(
                structured_format_for_path(Path::new(case)),
                Some(StructuredDataFormat::JsonLines),
                "expected JSON Lines for {case}"
            );
        }

        let xml_cases = [
            "a.xml",
            "a.XSD",
            "a.xsl",
            "a.xslt",
            "a.rss",
            "a.atom",
            "a.opml",
            "a.plist",
            "a.wsdl",
            "a.kml",
            "a.gpx",
            "a.csproj",
            "a.fsproj",
            "a.vbproj",
            "a.props",
            "a.targets",
            "a.resx",
            "a.xaml",
            "a.nuspec",
        ];
        for case in xml_cases {
            assert_eq!(
                structured_format_for_path(Path::new(case)),
                Some(StructuredDataFormat::Xml),
                "expected XML for {case}"
            );
        }

        let html_cases = ["a.html", "a.HTM", "a.xhtml", "a.shtml"];
        for case in html_cases {
            assert_eq!(
                structured_format_for_path(Path::new(case)),
                Some(StructuredDataFormat::Html),
                "expected HTML for {case}"
            );
        }

        let css_cases = ["a.css", "a.SCSS", "a.less"];
        for case in css_cases {
            assert_eq!(
                structured_format_for_path(Path::new(case)),
                Some(StructuredDataFormat::Css),
                "expected CSS for {case}"
            );
        }

        let js_cases = [
            "a.js", "a.mjs", "a.cjs", "a.jsx", "a.TS", "a.mts", "a.cts", "a.tsx",
        ];
        for case in js_cases {
            assert_eq!(
                structured_format_for_path(Path::new(case)),
                Some(StructuredDataFormat::JavaScript),
                "expected JavaScript for {case}"
            );
        }

        for case in ["a.jsonc", "a.txt", "a.toml", "a", "a.tsv"] {
            assert_eq!(
                structured_format_for_path(Path::new(case)),
                None,
                "expected no structured format for {case}"
            );
        }
    }

    #[test]
    fn html_css_js_are_lenient_and_never_produce_a_notice() {
        for (source, format) in [
            ("<div><p>hi", StructuredDataFormat::Html),
            ("a{color:red", StructuredDataFormat::Css),
            ("function f(", StructuredDataFormat::JavaScript),
        ] {
            let outcome = format_structured_source(source, format, Path::new("a"));
            assert!(
                outcome.formatted.is_some(),
                "expected lenient formatter to always produce output for {format:?}"
            );
            assert!(
                outcome.notice.is_none(),
                "expected no notice for {format:?}"
            );
        }
    }

    #[test]
    fn oversized_source_skips_formatting_with_a_notice() {
        let source = "x".repeat(MAX_FORMAT_SOURCE_BYTES + 1);
        let outcome =
            format_structured_source(&source, StructuredDataFormat::Json, Path::new("a.json"));
        assert!(outcome.formatted.is_none());
        assert!(outcome
            .notice
            .as_deref()
            .is_some_and(|notice| notice.contains("16 MiB")));
    }

    #[test]
    fn json_success_has_no_notice() {
        let outcome = format_structured_source(
            r#"{"a":1}"#,
            StructuredDataFormat::Json,
            Path::new("a.json"),
        );
        assert_eq!(outcome.formatted.as_deref(), Some("{\n  \"a\": 1\n}"));
        assert!(outcome.notice.is_none());
    }

    #[test]
    fn json_failure_has_no_formatted_text() {
        let outcome =
            format_structured_source("{", StructuredDataFormat::Json, Path::new("a.json"));
        assert!(outcome.formatted.is_none());
        assert!(outcome.notice.is_some());
    }

    #[test]
    fn xml_success_has_no_notice() {
        let outcome = format_structured_source(
            "<a><b>1</b></a>",
            StructuredDataFormat::Xml,
            Path::new("a.xml"),
        );
        assert_eq!(outcome.formatted.as_deref(), Some("<a>\n  <b>1</b>\n</a>"));
        assert!(outcome.notice.is_none());
    }
}
