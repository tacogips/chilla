use super::*;

#[test]
fn source_footer_follows_complete_source_for_text_and_csv() {
    let directory = TestDir::new();
    for extension in ["txt", "csv"] {
        for bytes in [
            Vec::new(),
            b"<&>\"'\r\nlast".to_vec(),
            b"value,\xff\n".to_vec(),
            "long<&>".repeat(4096).into_bytes(),
        ] {
            let path = directory.path().join(format!("source.{extension}"));
            fs::write(&path, &bytes).expect("write fixture");
            let source = String::from_utf8_lossy(&bytes);
            let expected =
                crate::syntax_highlight::highlight_file_source(&source, &path, SyntaxUiTheme::Dark);
            let preview = ViewerService::new()
                .open_file_preview(&path, SyntaxUiTheme::Dark)
                .expect("source preview");
            let html = match preview {
                FilePreview::Text { html, .. } => html,
                FilePreview::Csv { raw_html, .. } => raw_html,
                _ => panic!("expected source preview"),
            };
            assert!(html.starts_with(&format!(
                "<section class=\"file-preview file-preview--text\">{expected}<footer class=\"file-preview__meta\" aria-label=\"File information\">"
            )));
            assert!(html.ends_with("</footer></section>"));
            assert_eq!(html.matches("<footer").count(), 1);
            assert!(!html.contains("File type:"));
            assert!(!html.contains("File size:"));
            let footer = html.split_once("<footer").expect("footer").1;
            assert_eq!(
                footer.contains("Encoding: UTF-8 with replacement characters"),
                std::str::from_utf8(&bytes).is_err()
            );
            assert!(!html.contains("long<&>"));
        }
    }
}
