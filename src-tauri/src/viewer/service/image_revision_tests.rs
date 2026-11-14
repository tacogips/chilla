use std::{
    fs,
    path::Path,
    time::{Duration, SystemTime, UNIX_EPOCH},
};

use super::ViewerService;
use crate::{syntax_highlight::SyntaxUiTheme, viewer::types::FilePreview};

#[test]
fn image_preview_url_uses_the_clean_file_path() {
    let unique = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    let test_directory = std::env::temp_dir().join(format!(
        "chilla-image-revision-test-{}-{unique}",
        std::process::id()
    ));
    fs::create_dir_all(&test_directory).expect("create image revision test directory");
    let image_path = test_directory.join("preview.png");
    fs::write(&image_path, png_header_with_marker(0)).expect("write initial image fixture");

    let (first_html, first_revision) = open_image_preview(&image_path);

    let mut next_preview = None;
    for marker in 1..=20 {
        std::thread::sleep(Duration::from_millis(2));
        fs::write(&image_path, png_header_with_marker(marker))
            .expect("replace image fixture from disk");
        let preview = open_image_preview(&image_path);
        if preview.1 != first_revision {
            next_preview = Some(preview);
            break;
        }
    }

    let (next_html, next_revision) =
        next_preview.expect("filesystem modification marker should advance");
    let escaped_path = image_path
        .canonicalize()
        .expect("canonical image fixture path")
        .display()
        .to_string();

    assert!(first_html.contains(&format!("src=\"{escaped_path}\"")));
    assert!(next_html.contains(&format!("src=\"{escaped_path}\"")));
    assert!(!first_html.contains("?revision="));
    assert!(!next_html.contains("?revision="));
    assert_ne!(first_revision, next_revision);

    fs::remove_dir_all(&test_directory).expect("remove image revision test directory");
}

fn open_image_preview(path: &Path) -> (String, String) {
    match ViewerService::new()
        .open_file_preview(path, SyntaxUiTheme::Dark)
        .expect("open image preview")
    {
        FilePreview::Image {
            html,
            last_modified,
            ..
        } => (html, last_modified),
        _ => panic!("expected image preview"),
    }
}

fn png_header_with_marker(marker: u8) -> Vec<u8> {
    let mut bytes = vec![137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82];
    bytes.push(marker);
    bytes
}
