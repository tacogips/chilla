use serde::{Deserialize, Serialize};

use crate::document::types::DocumentSnapshot;

#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum WorkspaceMode {
    Markdown,
    FileView,
}

#[derive(Debug, Clone, Serialize)]
pub struct StartupContext {
    pub initial_mode: WorkspaceMode,
    pub current_directory_path: String,
    pub selected_file_path: Option<String>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DirectorySortField {
    Name,
    Mtime,
    Size,
    Extension,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DirectorySortDirection {
    Asc,
    Desc,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct DirectoryListSort {
    pub field: DirectorySortField,
    pub direction: DirectorySortDirection,
}

impl Default for DirectoryListSort {
    fn default() -> Self {
        Self {
            field: DirectorySortField::Name,
            direction: DirectorySortDirection::Asc,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct DirectoryPage {
    pub current_directory_path: String,
    pub parent_directory_path: Option<String>,
    pub entries: Vec<DirectoryEntry>,
    pub total_entry_count: usize,
    pub offset: usize,
    pub limit: usize,
    pub has_more: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct DirectoryEntry {
    pub path: String,
    pub canonical_path: String,
    pub name: String,
    pub is_directory: bool,
    pub size_bytes: u64,
    pub modified_at_unix_ms: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum FilePreview {
    Markdown {
        mime_type: String,
        #[serde(flatten)]
        snapshot: DocumentSnapshot,
    },
    Image {
        path: String,
        file_name: String,
        mime_type: String,
        html: String,
        last_modified: String,
    },
    Video {
        path: String,
        file_name: String,
        mime_type: String,
        stream_url: Option<String>,
        html: String,
        last_modified: String,
    },
    Audio {
        path: String,
        file_name: String,
        mime_type: String,
        stream_url: Option<String>,
        html: String,
        last_modified: String,
    },
    Pdf {
        path: String,
        file_name: String,
        mime_type: String,
        html: String,
        last_modified: String,
    },
    Text {
        path: String,
        file_name: String,
        mime_type: String,
        html: String,
        last_modified: String,
    },
    Binary {
        path: String,
        file_name: String,
        mime_type: String,
        html: String,
        last_modified: String,
        message: String,
    },
}
