use std::{
    fs,
    path::{Path, PathBuf},
    process::Command,
    time::{SystemTime, UNIX_EPOCH},
};

#[test]
fn verbose_version_is_information_only_and_artifact_free() {
    let home = TestDirectory::new("verbose-version");
    let output = Command::new(env!("CARGO_BIN_EXE_chilla"))
        .args(["--verbose", "--version"])
        .env("HOME", home.path())
        .output()
        .expect("run chilla --verbose --version");

    assert!(output.status.success());
    assert_eq!(
        String::from_utf8(output.stdout).expect("version output is UTF-8"),
        format!("{}\n", env!("CARGO_PKG_VERSION"))
    );
    assert!(output.stderr.is_empty());
    assert!(!home
        .path()
        .join("Library")
        .join("Logs")
        .join("chilla")
        .exists());
}

struct TestDirectory {
    path: PathBuf,
}

impl TestDirectory {
    fn new(label: &str) -> Self {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let path =
            std::env::temp_dir().join(format!("chilla-{label}-{}-{unique}", std::process::id()));
        fs::create_dir_all(&path).expect("create isolated home");
        Self { path }
    }

    fn path(&self) -> &Path {
        &self.path
    }
}

impl Drop for TestDirectory {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.path);
    }
}
