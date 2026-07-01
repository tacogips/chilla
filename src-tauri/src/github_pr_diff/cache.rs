use std::{
    collections::hash_map::DefaultHasher,
    fs,
    hash::{Hash, Hasher},
    path::PathBuf,
};

use serde::{Deserialize, Serialize};

use super::{GitHubPrTarget, PrDiffSnapshot};

#[derive(Debug, Deserialize, Serialize)]
struct PrDiffCacheRecord {
    updated_at: String,
    snapshot: PrDiffSnapshot,
}

pub(super) fn read_cached_snapshot(
    target: &GitHubPrTarget,
    updated_at: Option<&str>,
) -> Option<PrDiffSnapshot> {
    let updated_at = updated_at?;
    let cache_path = cache_file_path(target);
    let cache_text = fs::read_to_string(cache_path).ok()?;
    let cache_record = serde_json::from_str::<PrDiffCacheRecord>(&cache_text).ok()?;

    if cache_record.updated_at == updated_at {
        Some(cache_record.snapshot)
    } else {
        None
    }
}

pub(super) fn write_cached_snapshot(
    target: &GitHubPrTarget,
    updated_at: &str,
    snapshot: &PrDiffSnapshot,
) -> std::io::Result<()> {
    let cache_path = cache_file_path(target);
    if let Some(parent) = cache_path.parent() {
        fs::create_dir_all(parent)?;
    }

    let cache_record = PrDiffCacheRecord {
        updated_at: updated_at.to_string(),
        snapshot: snapshot.clone(),
    };
    let cache_text = serde_json::to_string(&cache_record).map_err(std::io::Error::other)?;
    fs::write(cache_path, cache_text)
}

pub(super) fn cache_file_path(target: &GitHubPrTarget) -> PathBuf {
    let mut hasher = DefaultHasher::new();
    target.owner.hash(&mut hasher);
    target.repo.hash(&mut hasher);
    target.source.hash(&mut hasher);
    let key = hasher.finish();

    std::env::temp_dir()
        .join("chilla")
        .join("github-diff-cache")
        .join(format!("source-{key:016x}.json"))
}
