use std::{
    ffi::OsStr,
    fs,
    io::{ErrorKind, Read},
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};

const MAX_CONFIG_BYTES: u64 = 64 * 1024;

#[derive(Debug, Deserialize, Serialize)]
#[serde(untagged)]
pub enum StringOrStrings {
    String(String),
    Strings(Vec<String>),
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct KeymapBinding {
    pub on: StringOrStrings,
    pub run: StringOrStrings,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub desc: Option<String>,
}

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct KeymapContext {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prepend_keymap: Option<Vec<KeymapBinding>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub keymap: Option<Vec<KeymapBinding>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub append_keymap: Option<Vec<KeymapBinding>>,
}

#[derive(Debug, Default, Deserialize, Serialize)]
#[serde(deny_unknown_fields)]
pub struct KeymapConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mgr: Option<KeymapContext>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace: Option<KeymapContext>,
}

#[derive(Debug, Serialize)]
pub struct KeymapConfigResponse {
    pub path: Option<String>,
    pub config: KeymapConfig,
    pub error: Option<String>,
}

impl KeymapConfigResponse {
    pub(crate) fn failure(path: Option<String>, error: &str) -> Self {
        Self {
            path,
            config: KeymapConfig::default(),
            error: Some(error.into()),
        }
    }
}

fn absolute_path(value: Option<&OsStr>) -> Option<&Path> {
    value
        .map(Path::new)
        .filter(|path| !path.as_os_str().is_empty() && path.is_absolute())
}

fn resolve_path(xdg: Option<&OsStr>, home: Option<&OsStr>) -> Option<PathBuf> {
    absolute_path(xdg)
        .map(Path::to_path_buf)
        .or_else(|| absolute_path(home).map(|path| path.join(".config")))
        .map(|path| path.join("chilla/keymap.toml"))
}

/// Load the user's keymap without creating or changing configuration files.
pub fn load_keymap_config() -> KeymapConfigResponse {
    let xdg = std::env::var_os("XDG_CONFIG_HOME");
    let home = std::env::var_os("HOME");
    #[cfg(windows)]
    let home = home.or_else(|| std::env::var_os("USERPROFILE"));
    load_path(resolve_path(xdg.as_deref(), home.as_deref()))
}

fn load_path(path: Option<PathBuf>) -> KeymapConfigResponse {
    let Some(path) = path else {
        return KeymapConfigResponse::failure(
            None,
            "Cannot resolve the keymap configuration directory",
        );
    };
    let display_path = Some(path.to_string_lossy().into_owned());
    match read_config(&path) {
        Ok(config) => KeymapConfigResponse {
            path: display_path,
            config,
            error: None,
        },
        Err(error) => KeymapConfigResponse::failure(display_path, error),
    }
}

fn read_config(path: &Path) -> Result<KeymapConfig, &'static str> {
    let metadata = match fs::metadata(path) {
        Ok(metadata) => metadata,
        Err(error) if error.kind() == ErrorKind::NotFound => return Ok(KeymapConfig::default()),
        Err(_) => return Err("Cannot read keymap configuration metadata"),
    };
    if !metadata.is_file() {
        return Err("Keymap configuration must be a regular file");
    }
    if metadata.len() > MAX_CONFIG_BYTES {
        return Err("Keymap configuration exceeds 64 KiB");
    }
    let file = fs::File::open(path).map_err(|_| "Cannot open keymap configuration")?;
    let opened_metadata = file
        .metadata()
        .map_err(|_| "Cannot read keymap configuration metadata")?;
    if !opened_metadata.is_file() {
        return Err("Keymap configuration must be a regular file");
    }
    let mut contents = Vec::new();
    file.take(MAX_CONFIG_BYTES + 1)
        .read_to_end(&mut contents)
        .map_err(|_| "Cannot read keymap configuration")?;
    if contents.len() as u64 > MAX_CONFIG_BYTES {
        return Err("Keymap configuration exceeds 64 KiB");
    }
    let text =
        std::str::from_utf8(&contents).map_err(|_| "Keymap configuration must be UTF-8 text")?;
    // Parser diagnostics may echo user content; expose only a structural summary.
    toml::from_str(text).map_err(|_| "Invalid keymap TOML or unsupported configuration fields")
}

#[cfg(test)]
mod tests;
