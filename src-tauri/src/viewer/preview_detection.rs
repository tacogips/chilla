use std::path::Path;

const MARKDOWN_EXTENSIONS: [&str; 3] = ["md", "markdown", "mdown"];
const TEXTUAL_MIME_PREFIXES: [&str; 2] = ["text/", "inode/x-empty"];
const TEXTUAL_APPLICATION_MIME_TYPES: [&str; 10] = [
    "application/json",
    "application/ld+json",
    "application/schema+json",
    "application/toml",
    "application/typescript",
    "application/x-httpd-php",
    "application/x-javascript",
    "application/x-sh",
    "application/xml",
    "application/yaml",
];
/// When magic(1) reports `application/octet-stream` but the path is a known text config/data suffix.
const TEXT_PREVIEW_EXTENSIONS: [&str; 9] = [
    "toml",
    "json",
    "jsonc",
    "yaml",
    "yml",
    "xml",
    "lock",
    "webmanifest",
    "gradle",
];
const IMAGE_EXTENSION_MIME_TYPES: [(&str, &str); 19] = [
    ("apng", "image/apng"),
    ("avif", "image/avif"),
    ("bmp", "image/bmp"),
    ("dib", "image/bmp"),
    ("gif", "image/gif"),
    ("heic", "image/heic"),
    ("heics", "image/heic-sequence"),
    ("heif", "image/heif"),
    ("heifs", "image/heif-sequence"),
    ("ico", "image/vnd.microsoft.icon"),
    ("jpe", "image/jpeg"),
    ("jpeg", "image/jpeg"),
    ("jfif", "image/jpeg"),
    ("jpg", "image/jpeg"),
    ("png", "image/png"),
    ("svg", "image/svg+xml"),
    ("tif", "image/tiff"),
    ("tiff", "image/tiff"),
    ("webp", "image/webp"),
];
const VIDEO_EXTENSION_MIME_TYPES: [(&str, &str); 5] = [
    ("m4v", "video/mp4"),
    ("mov", "video/quicktime"),
    ("mp4", "video/mp4"),
    ("ogv", "video/ogg"),
    ("webm", "video/webm"),
];
const AUDIO_EXTENSION_MIME_TYPES: [(&str, &str); 8] = [
    ("aac", "audio/aac"),
    ("flac", "audio/flac"),
    ("m4a", "audio/mp4"),
    ("mp3", "audio/mpeg"),
    ("oga", "audio/ogg"),
    ("ogg", "audio/ogg"),
    ("opus", "audio/ogg"),
    ("wav", "audio/wav"),
];
const PDF_EXTENSION_MIME_TYPES: [(&str, &str); 1] = [("pdf", "application/pdf")];
const EPUB_EXTENSION_MIME_TYPES: [(&str, &str); 1] = [("epub", "application/epub+zip")];

pub(super) fn is_markdown_path(path: &Path) -> bool {
    path.extension()
        .and_then(std::ffi::OsStr::to_str)
        .map(|extension| extension.to_ascii_lowercase())
        .is_some_and(|extension| MARKDOWN_EXTENSIONS.contains(&extension.as_str()))
}

pub(super) fn is_csv_path(path: &Path) -> bool {
    path.extension()
        .and_then(std::ffi::OsStr::to_str)
        .is_some_and(|extension| extension.eq_ignore_ascii_case("csv"))
}

pub(super) fn should_preview_as_csv(path: &Path, mime_type: &str) -> bool {
    if is_csv_path(path) {
        return true;
    }
    mime_type.eq_ignore_ascii_case("text/csv")
}

pub(super) fn is_textual_mime(mime_type: &str) -> bool {
    let lower = mime_type.to_ascii_lowercase();
    TEXTUAL_MIME_PREFIXES
        .iter()
        .any(|prefix| lower.starts_with(prefix))
        || TEXTUAL_APPLICATION_MIME_TYPES.contains(&lower.as_str())
        || is_textual_application_structured_subtype(&lower)
}

/// `application/*+json`, `+xml`, `+yaml` (e.g. `application/schema+json`, `application/xhtml+xml`).
fn is_textual_application_structured_subtype(lower_mime: &str) -> bool {
    if !lower_mime.starts_with("application/") {
        return false;
    }
    lower_mime.contains("+json")
        || lower_mime.contains("+xml")
        || lower_mime.ends_with("+yaml")
        || lower_mime.ends_with("+yml")
}

pub(super) fn is_text_preview_extension(path: &Path) -> bool {
    path.extension()
        .and_then(std::ffi::OsStr::to_str)
        .map(|extension| {
            let lower = extension.to_ascii_lowercase();
            TEXT_PREVIEW_EXTENSIONS.contains(&lower.as_str())
        })
        .unwrap_or(false)
}

pub(super) fn fallback_media_mime_type<'a>(
    path: &Path,
    detected_mime_type: &'a str,
) -> Option<&'a str> {
    if detected_mime_type.starts_with("image/")
        || detected_mime_type.starts_with("video/")
        || detected_mime_type.starts_with("audio/")
        || detected_mime_type == "application/pdf"
    {
        return None;
    }

    let extension = path
        .extension()
        .and_then(std::ffi::OsStr::to_str)?
        .to_ascii_lowercase();

    IMAGE_EXTENSION_MIME_TYPES
        .iter()
        .chain(VIDEO_EXTENSION_MIME_TYPES.iter())
        .chain(AUDIO_EXTENSION_MIME_TYPES.iter())
        .chain(PDF_EXTENSION_MIME_TYPES.iter())
        .chain(EPUB_EXTENSION_MIME_TYPES.iter())
        .find_map(|(candidate_extension, candidate_mime_type)| {
            (extension == *candidate_extension).then_some(*candidate_mime_type)
        })
}

#[cfg(test)]
mod tests {
    use super::{fallback_media_mime_type, is_text_preview_extension};
    use std::path::Path;

    #[test]
    fn supported_image_extensions_fall_back_to_expected_mime_case_insensitively() {
        let cases = [
            ("apng", "image/apng"),
            ("avif", "image/avif"),
            ("bmp", "image/bmp"),
            ("dib", "image/bmp"),
            ("gif", "image/gif"),
            ("heic", "image/heic"),
            ("heics", "image/heic-sequence"),
            ("heif", "image/heif"),
            ("heifs", "image/heif-sequence"),
            ("ico", "image/vnd.microsoft.icon"),
            ("jpe", "image/jpeg"),
            ("jpeg", "image/jpeg"),
            ("jfif", "image/jpeg"),
            ("jpg", "image/jpeg"),
            ("png", "image/png"),
            ("svg", "image/svg+xml"),
            ("tif", "image/tiff"),
            ("tiff", "image/tiff"),
            ("webp", "image/webp"),
        ];

        for (extension, expected_mime_type) in cases {
            let lowercase_path = format!("preview.{extension}");
            assert_eq!(
                fallback_media_mime_type(Path::new(&lowercase_path), "application/octet-stream"),
                Some(expected_mime_type),
                "expected image fallback for {lowercase_path}"
            );

            let uppercase_path = format!("preview.{}", extension.to_ascii_uppercase());
            assert_eq!(
                fallback_media_mime_type(Path::new(&uppercase_path), "text/plain"),
                Some(expected_mime_type),
                "expected case-insensitive image fallback for {uppercase_path}"
            );
        }
    }

    #[test]
    fn detected_image_mime_is_preserved_without_extension_fallback() {
        for detected_mime_type in ["image/svg+xml", "image/webp", "image/avif", "image/tiff"] {
            assert_eq!(
                fallback_media_mime_type(Path::new("preview.unknown"), detected_mime_type),
                None,
                "expected detected image MIME to remain authoritative: {detected_mime_type}"
            );
        }
    }

    #[test]
    fn svg_extension_is_not_a_generic_text_preview_extension() {
        assert!(!is_text_preview_extension(Path::new("diagram.svg")));
        assert!(!is_text_preview_extension(Path::new("diagram.SVG")));
    }
}
