use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

use crate::viewer::{
    service::ViewerService,
    types::{DirectoryListSort, DirectorySortDirection, DirectorySortField},
};

use super::git_ignored_entry_names;

static TEST_DIR_COUNTER: AtomicU64 = AtomicU64::new(0);

struct TestDir {
    path: PathBuf,
}

impl TestDir {
    fn new() -> Self {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let process_id = std::process::id();
        let counter = TEST_DIR_COUNTER.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!(
            "chilla-directory-listing-tests-{process_id}-{unique}-{counter}"
        ));
        fs::create_dir_all(&path).expect("create temporary directory");
        Self { path }
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TestDir {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}

fn default_directory_sort() -> DirectoryListSort {
    DirectoryListSort {
        field: DirectorySortField::Name,
        direction: DirectorySortDirection::Asc,
    }
}

fn initialize_git_repository(path: &Path) {
    let status = Command::new("git")
        .arg("init")
        .arg("--quiet")
        .current_dir(path)
        .status()
        .expect("initialize Git repository");
    assert!(status.success(), "Git repository initialization failed");
}

#[test]
fn hides_direct_git_ignored_files_and_directories_when_enabled() {
    let test_dir = TestDir::new();
    initialize_git_repository(test_dir.path());
    fs::write(
        test_dir.path().join(".gitignore"),
        ".chilla-ignored-file\n.chilla-ignored-directory/\n",
    )
    .expect("write ignore rules");
    fs::write(test_dir.path().join(".chilla-ignored-file"), "ignored").expect("write ignored file");
    fs::create_dir_all(test_dir.path().join(".chilla-ignored-directory"))
        .expect("create ignored directory");
    fs::write(
        test_dir.path().join(".chilla-ignored-directory/child.txt"),
        "ignored",
    )
    .expect("write ignored directory child");
    fs::write(test_dir.path().join("visible.txt"), "visible").expect("write visible file");

    let unfiltered = ViewerService::new()
        .list_directory(
            test_dir.path(),
            default_directory_sort(),
            None,
            false,
            0,
            200,
        )
        .expect("unfiltered directory page");
    let filtered = ViewerService::new()
        .list_directory(
            test_dir.path(),
            default_directory_sort(),
            None,
            true,
            0,
            200,
        )
        .expect("filtered directory page");

    assert!(unfiltered
        .entries
        .iter()
        .any(|entry| entry.name == ".chilla-ignored-file"));
    assert!(unfiltered
        .entries
        .iter()
        .any(|entry| entry.name == ".chilla-ignored-directory"));
    assert!(!filtered
        .entries
        .iter()
        .any(|entry| entry.name == ".chilla-ignored-file"));
    assert!(!filtered
        .entries
        .iter()
        .any(|entry| entry.name == ".chilla-ignored-directory"));
    assert!(filtered
        .entries
        .iter()
        .any(|entry| entry.name == "visible.txt"));
    assert_eq!(filtered.total_entry_count, unfiltered.total_entry_count - 2);
}

#[test]
fn hides_entries_using_nested_git_ignore_rules() {
    let test_dir = TestDir::new();
    initialize_git_repository(test_dir.path());
    let nested_directory = test_dir.path().join("nested");
    fs::create_dir_all(&nested_directory).expect("create nested directory");
    fs::write(
        nested_directory.join(".gitignore"),
        ".chilla-nested-ignored.txt\n",
    )
    .expect("write nested ignore rules");
    fs::write(
        nested_directory.join(".chilla-nested-ignored.txt"),
        "ignored",
    )
    .expect("write nested ignored file");
    fs::write(nested_directory.join("visible.txt"), "visible").expect("write visible file");

    let filtered = ViewerService::new()
        .list_directory(
            &nested_directory,
            default_directory_sort(),
            None,
            true,
            0,
            200,
        )
        .expect("filtered nested directory page");

    let names = filtered
        .entries
        .iter()
        .map(|entry| entry.name.as_str())
        .collect::<Vec<_>>();
    assert_eq!(names, vec![".gitignore", "visible.txt"]);
    assert_eq!(filtered.total_entry_count, 2);
}

#[test]
fn streams_large_git_ignore_input_while_draining_output() {
    let test_dir = TestDir::new();
    initialize_git_repository(test_dir.path());
    fs::write(
        test_dir.path().join(".gitignore"),
        "ignored-pressure-*.tmp\n",
    )
    .expect("write ignore rules");

    let name_padding = "x".repeat(180);
    let entry_names = (0..8_192)
        .map(|index| format!("ignored-pressure-{index:04}-{name_padding}.tmp"))
        .collect::<Vec<_>>();
    let ignored_entry_names =
        git_ignored_entry_names(test_dir.path(), entry_names.iter().map(String::as_str));

    assert_eq!(ignored_entry_names.len(), entry_names.len());
    assert!(entry_names
        .iter()
        .all(|entry_name| ignored_entry_names.contains(entry_name)));
}

#[test]
fn keeps_entries_when_not_in_a_git_repository() {
    let test_dir = TestDir::new();
    fs::write(test_dir.path().join("visible.txt"), "visible").expect("write visible file");

    let page = ViewerService::new()
        .list_directory(
            test_dir.path(),
            default_directory_sort(),
            None,
            true,
            0,
            200,
        )
        .expect("non-repository directory page");

    assert_eq!(page.total_entry_count, 1);
    assert_eq!(page.entries[0].name, "visible.txt");
    assert!(!page.entries[0].is_symlink);
}

#[cfg(unix)]
#[test]
fn identifies_file_and_directory_symlinks_without_changing_path_semantics() {
    use std::os::unix::fs::symlink;

    let test_dir = TestDir::new();
    let file_target = test_dir.path().join("target.txt");
    let directory_target = test_dir.path().join("target-directory");
    let file_link = test_dir.path().join("file-link.txt");
    let directory_link = test_dir.path().join("directory-link");
    fs::write(&file_target, "target").expect("write file target");
    fs::create_dir(&directory_target).expect("create directory target");
    symlink(&file_target, &file_link).expect("create file symlink");
    symlink(&directory_target, &directory_link).expect("create directory symlink");

    let page = ViewerService::new()
        .list_directory(
            test_dir.path(),
            default_directory_sort(),
            None,
            false,
            0,
            200,
        )
        .expect("directory page");

    let file_entry = page
        .entries
        .iter()
        .find(|entry| entry.name == "file-link.txt")
        .expect("file symlink entry");
    assert!(file_entry.is_symlink);
    assert!(!file_entry.is_directory);
    assert_eq!(
        file_entry.path,
        Path::new(&page.current_directory_path)
            .join("file-link.txt")
            .display()
            .to_string()
    );
    assert_eq!(
        file_entry.canonical_path,
        file_target
            .canonicalize()
            .expect("canonical file target")
            .display()
            .to_string()
    );
    assert_eq!(
        serde_json::to_value(file_entry).expect("serialize file symlink")["is_symlink"],
        true
    );

    let directory_entry = page
        .entries
        .iter()
        .find(|entry| entry.name == "directory-link")
        .expect("directory symlink entry");
    assert!(directory_entry.is_symlink);
    assert!(directory_entry.is_directory);
    assert_eq!(
        directory_entry.path,
        Path::new(&page.current_directory_path)
            .join("directory-link")
            .display()
            .to_string()
    );
    assert_eq!(
        directory_entry.canonical_path,
        directory_target
            .canonicalize()
            .expect("canonical directory target")
            .display()
            .to_string()
    );
    assert_eq!(
        serde_json::to_value(directory_entry).expect("serialize directory symlink")["is_symlink"],
        true
    );
}

#[cfg(unix)]
#[test]
fn canonicalized_explicit_file_set_entries_are_not_symlinks() {
    use std::os::unix::fs::symlink;

    let test_dir = TestDir::new();
    let target = test_dir.path().join("target.txt");
    let link = test_dir.path().join("link.txt");
    fs::write(&target, "target").expect("write target");
    symlink(&target, &link).expect("create symlink");

    let page = ViewerService::new()
        .list_explicit_file_set(
            &[link.display().to_string()],
            default_directory_sort(),
            None,
            0,
            200,
        )
        .expect("explicit file-set page");

    assert_eq!(page.entries.len(), 1);
    let entry = &page.entries[0];
    let canonical_target = target
        .canonicalize()
        .expect("canonical target")
        .display()
        .to_string();
    assert!(!entry.is_symlink);
    assert_eq!(entry.path, canonical_target);
    assert_eq!(entry.canonical_path, canonical_target);
    assert_eq!(
        serde_json::to_value(entry).expect("serialize explicit entry")["is_symlink"],
        false
    );
}

#[test]
fn filters_git_ignored_entries_before_counting_and_pagination() {
    let test_dir = TestDir::new();
    initialize_git_repository(test_dir.path());
    let nested_directory = test_dir.path().join("nested");
    fs::create_dir_all(&nested_directory).expect("create nested directory");
    fs::write(nested_directory.join(".gitignore"), "ignored-*.txt\n").expect("write ignore rules");
    for index in 0..205 {
        fs::write(
            nested_directory.join(format!("visible-{index:03}.txt")),
            "visible",
        )
        .expect("write visible file");
    }
    for index in 0..5 {
        fs::write(
            nested_directory.join(format!("ignored-{index:03}.txt")),
            "ignored",
        )
        .expect("write ignored file");
    }

    let first_page = ViewerService::new()
        .list_directory(
            &nested_directory,
            default_directory_sort(),
            None,
            true,
            0,
            200,
        )
        .expect("first filtered page");
    let second_page = ViewerService::new()
        .list_directory(
            &nested_directory,
            default_directory_sort(),
            None,
            true,
            200,
            200,
        )
        .expect("second filtered page");

    assert_eq!(first_page.total_entry_count, 206);
    assert_eq!(first_page.entries.len(), 200);
    assert!(first_page.has_more);
    assert_eq!(second_page.total_entry_count, 206);
    assert_eq!(second_page.entries.len(), 6);
    assert!(!second_page.has_more);
    assert!(first_page
        .entries
        .iter()
        .chain(second_page.entries.iter())
        .all(|entry| !entry.name.starts_with("ignored-")));
}
