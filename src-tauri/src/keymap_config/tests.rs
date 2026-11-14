use super::*;
use std::{
    sync::atomic::{AtomicU64, Ordering},
    time::{SystemTime, UNIX_EPOCH},
};

static COUNTER: AtomicU64 = AtomicU64::new(0);

struct Fixture(PathBuf);

impl Fixture {
    fn new() -> Self {
        let path = std::env::temp_dir().join(format!(
            "chilla-keymap-{}-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap()
                .as_nanos(),
            COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir(&path).unwrap();
        Self(path)
    }

    fn read(&self, content: impl AsRef<[u8]>) -> KeymapConfigResponse {
        let path = self.0.join("keymap.toml");
        fs::write(&path, content).unwrap();
        load_path(Some(path))
    }
}

impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_dir_all(&self.0);
    }
}

#[test]
fn resolves_absolute_xdg_or_home_without_mutating_environment() {
    let fixture = Fixture::new();
    let home = fixture.0.join("home");
    let xdg = fixture.0.join("xdg");
    assert_eq!(
        resolve_path(Some(xdg.as_os_str()), Some(home.as_os_str())),
        Some(xdg.join("chilla/keymap.toml"))
    );
    for invalid in [None, Some(OsStr::new("")), Some(OsStr::new("relative"))] {
        assert_eq!(
            resolve_path(invalid, Some(home.as_os_str())),
            Some(home.join(".config/chilla/keymap.toml"))
        );
    }
    assert_eq!(resolve_path(None, None), None);
    assert_eq!(resolve_path(None, Some(OsStr::new("relative"))), None);
}

#[test]
fn preserves_scalar_arrays_and_empty_replacement_on_wire() {
    let fixture = Fixture::new();
    let response = fixture.read(
        r#"
[mgr]
keymap = []
prepend_keymap = [{ on = "t", run = "toggle_tree" }]
[[workspace.append_keymap]]
on = ["g", "g"]
run = ["noop", "noop"]
desc = "Go"
"#,
    );
    assert!(response.error.is_none());
    assert_eq!(
        serde_json::to_value(response.config).unwrap(),
        serde_json::json!({
            "mgr": {"keymap": [], "prepend_keymap": [{"on": "t", "run": "toggle_tree"}]},
            "workspace": {"append_keymap": [{"on": ["g", "g"], "run": ["noop", "noop"], "desc": "Go"}]}
        })
    );
}

#[test]
fn documented_example_is_valid_keymap_toml() {
    let fixture = Fixture::new();
    let response = fixture.read(include_str!("../../../examples/keymap.toml"));
    assert!(response.error.is_none());
    assert!(response.config.mgr.is_some());
    assert!(response.config.workspace.is_some());
}

#[test]
fn missing_file_and_empty_document_use_defaults_without_writing() {
    let fixture = Fixture::new();
    let missing = fixture.0.join("absent/keymap.toml");
    let response = load_path(Some(missing.clone()));
    assert!(response.error.is_none());
    assert_eq!(
        serde_json::to_value(response.config).unwrap(),
        serde_json::json!({})
    );
    assert!(!missing.exists());
    assert!(fixture.read("").error.is_none());
    assert!(load_path(None).error.is_some());
}

#[test]
fn rejects_malformed_unknown_fields_and_invalid_binding_types_without_echo() {
    let fixture = Fixture::new();
    for text in [
        "not-valid-secret-content",
        "[other]\nkeymap=[]",
        "[mgr]\nprepend_keymaps=[]",
        "[mgr]\nkeymap=[{on='a',run='noop',typo='private-content'}]",
        "[mgr]\nkeymap=[{on=3,run='noop'}]",
        "[mgr]\nkeymap=[{on='a',run=['noop',3]}]",
        "[mgr]\nkeymap=[{on='a'}]",
    ] {
        let response = fixture.read(text);
        let error = response.error.unwrap();
        assert!(!error.contains(text));
        assert!(!error.contains("private-content"));
        assert_eq!(
            serde_json::to_value(response.config).unwrap(),
            serde_json::json!({})
        );
    }
}

#[test]
fn rejects_nonregular_non_utf8_and_oversized_files() {
    let fixture = Fixture::new();
    assert!(load_path(Some(fixture.0.clone()))
        .error
        .unwrap()
        .contains("regular file"));
    assert!(fixture.read([255, 254]).error.unwrap().contains("UTF-8"));
    assert!(fixture
        .read(vec![b' '; MAX_CONFIG_BYTES as usize + 1])
        .error
        .unwrap()
        .contains("64 KiB"));
    assert!(fixture
        .read(vec![b' '; MAX_CONFIG_BYTES as usize])
        .error
        .is_none());
}

#[cfg(unix)]
#[test]
fn unreadable_configuration_returns_sanitized_error() {
    use std::os::unix::fs::PermissionsExt;

    let fixture = Fixture::new();
    let path = fixture.0.join("keymap.toml");
    fs::write(&path, "private contents").unwrap();
    fs::set_permissions(&path, fs::Permissions::from_mode(0o000)).unwrap();
    // Privileged test runners can bypass mode bits, so only assert unreadability when enforced.
    if fs::File::open(&path).is_err() {
        let response = load_path(Some(path));
        assert_eq!(
            response.error.as_deref(),
            Some("Cannot open keymap configuration")
        );
        assert_eq!(
            serde_json::to_value(response.config).unwrap(),
            serde_json::json!({})
        );
    }
}

#[cfg(unix)]
#[test]
fn rejects_fifo_before_opening_it() {
    let fixture = Fixture::new();
    let fifo = fixture.0.join("fifo");
    let status = std::process::Command::new("mkfifo")
        .arg(&fifo)
        .env_clear()
        .env("PATH", "/usr/bin:/bin")
        .status()
        .unwrap();
    assert!(status.success());
    assert!(load_path(Some(fifo))
        .error
        .unwrap()
        .contains("regular file"));
}
