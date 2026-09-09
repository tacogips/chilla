use super::*;
use std::sync::atomic::{AtomicU64, Ordering};

static COUNTER: AtomicU64 = AtomicU64::new(0);

struct Fixture(PathBuf);

impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "chilla-search-{}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(path.join("nested/deeper")).unwrap();
        Self(path)
    }

    fn input(&self, query: &str, kind: DirectorySearchKind) -> DirectorySearchInput {
        DirectorySearchInput {
            path: display_path(&self.0),
            query: query.into(),
            kind,
            hide_git_ignored: false,
        }
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn recursive_names_match_relative_paths_without_reading_binary_contents() {
    let fixture = Fixture::new();
    fs::write(fixture.0.join("nested/deeper/Report.bin"), [0, 255]).unwrap();
    let result = search(fixture.input("NESTED/DEEPER/REPORT", DirectorySearchKind::Name)).unwrap();
    assert_eq!(result.matches.len(), 1);
    assert_eq!(result.matches[0].relative_path, "nested/deeper/Report.bin");
    assert_eq!(result.matches[0].line_number, None);
    assert_eq!(result.skipped_count, 0);
}

#[test]
fn content_matches_are_literal_case_sensitive_with_unicode_excerpt_and_lines() {
    let fixture = Fixture::new();
    let long_line = format!("{}literal.*{}", "あ".repeat(500), "界".repeat(500));
    fs::write(
        fixture.0.join("nested/deeper/text.txt"),
        format!("LITERAL.*\n{long_line}\nliteral.*\n"),
    )
    .unwrap();
    let result = search(fixture.input("literal.*", DirectorySearchKind::Content)).unwrap();
    assert_eq!(result.matches.len(), 2);
    assert_eq!(result.matches[0].line_number, Some(2));
    assert_eq!(result.matches[1].line_number, Some(3));
    let excerpt = result.matches[0].line_text.as_ref().unwrap();
    assert!(excerpt.contains("literal.*"));
    assert!(excerpt.chars().count() < 200);
    assert!(excerpt.starts_with('…') && excerpt.ends_with('…'));
}

#[test]
fn content_search_preserves_leading_and_trailing_query_spaces() {
    let fixture = Fixture::new();
    fs::write(
        fixture.0.join("text.txt"),
        "needle\n needle \n needle\nneedle \n",
    )
    .unwrap();
    let result = search(fixture.input(" needle ", DirectorySearchKind::Content)).unwrap();
    assert_eq!(result.matches.len(), 1);
    assert_eq!(result.matches[0].line_number, Some(2));
    assert_eq!(result.matches[0].line_text.as_deref(), Some(" needle "));
}

#[test]
fn skips_binary_non_utf8_and_oversized_content() {
    let fixture = Fixture::new();
    fs::write(fixture.0.join("binary"), [0, b'x']).unwrap();
    fs::write(fixture.0.join("invalid"), [255, b'x']).unwrap();
    fs::write(fixture.0.join("large"), "x".repeat(20)).unwrap();
    let limits = SearchLimits {
        file_bytes: 10,
        ..SearchLimits::default()
    };
    let result =
        search_with_limits(fixture.input("x", DirectorySearchKind::Content), limits).unwrap();
    assert!(result.matches.is_empty());
    assert_eq!(result.skipped_count, 3);
}

#[test]
fn result_entry_byte_and_time_limits_mark_partial_results() {
    let fixture = Fixture::new();
    fs::write(fixture.0.join("a"), "x\nx\nx").unwrap();
    for limits in [
        SearchLimits {
            matches: 1,
            ..SearchLimits::default()
        },
        SearchLimits {
            entries: 1,
            ..SearchLimits::default()
        },
        SearchLimits {
            total_bytes: 1,
            ..SearchLimits::default()
        },
        SearchLimits {
            duration: Duration::ZERO,
            ..SearchLimits::default()
        },
    ] {
        let match_limit = limits.matches;
        let result =
            search_with_limits(fixture.input("x", DirectorySearchKind::Content), limits).unwrap();
        assert!(result.truncated);
        assert!(result.matches.len() <= match_limit);
    }
}

#[cfg(unix)]
#[test]
fn skips_symlink_files_escapes_cycles_and_git_metadata() {
    use std::os::unix::fs::symlink;
    let fixture = Fixture::new();
    let outside = Fixture::new();
    fs::write(outside.0.join("secret"), "needle").unwrap();
    symlink(&outside.0, fixture.0.join("escape")).unwrap();
    symlink(outside.0.join("secret"), fixture.0.join("file-link")).unwrap();
    symlink(&fixture.0, fixture.0.join("nested/cycle")).unwrap();
    fs::create_dir(fixture.0.join(".git")).unwrap();
    fs::write(fixture.0.join(".git/hidden"), "needle").unwrap();
    let result = search(fixture.input("needle", DirectorySearchKind::Content)).unwrap();
    assert!(result.matches.is_empty());
    assert_eq!(result.skipped_count, 3);
    assert_eq!(result.scanned_files, 0);
}

#[test]
fn respects_git_ignore_before_descending() {
    let fixture = Fixture::new();
    let status = std::process::Command::new("git")
        .args(["init", "--quiet"])
        .current_dir(&fixture.0)
        .env_clear()
        .env("PATH", "/usr/bin:/bin")
        .status()
        .unwrap();
    assert!(status.success());
    fs::write(fixture.0.join(".gitignore"), "nested/\n").unwrap();
    fs::write(fixture.0.join("nested/needle.txt"), "needle").unwrap();
    let mut input = fixture.input("needle", DirectorySearchKind::Name);
    input.hide_git_ignored = true;
    assert!(search(input).unwrap().matches.is_empty());
    assert_eq!(
        search(fixture.input("needle", DirectorySearchKind::Name))
            .unwrap()
            .matches
            .len(),
        1
    );
}

#[test]
fn rejects_invalid_root_and_empty_or_oversized_query() {
    let fixture = Fixture::new();
    assert!(search(fixture.input(" ", DirectorySearchKind::Name)).is_err());
    assert!(search(fixture.input(&"a".repeat(1025), DirectorySearchKind::Name)).is_err());
    let mut input = fixture.input("x", DirectorySearchKind::Name);
    input.path = display_path(&fixture.0.join("missing"));
    assert!(search(input).is_err());
    fs::write(fixture.0.join("file"), "x").unwrap();
    let mut input = fixture.input("x", DirectorySearchKind::Name);
    input.path = display_path(&fixture.0.join("file"));
    assert!(search(input).is_err());
}
