use serde::Serialize;

pub type RevisionToken = String;

#[derive(Debug, Clone, Serialize)]
pub struct DocumentSnapshot {
    pub path: String,
    pub file_name: String,
    pub source_text: String,
    pub source_html: String,
    pub html: String,
    pub headings: Vec<HeadingNode>,
    pub revision_token: RevisionToken,
    pub last_modified: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct HeadingNode {
    pub level: u8,
    pub title: String,
    pub anchor_id: String,
    pub line_start: usize,
    pub children: Vec<HeadingNode>,
}
