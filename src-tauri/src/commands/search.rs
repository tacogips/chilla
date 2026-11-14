use crate::viewer::search::{search, DirectorySearchInput, DirectorySearchResult};

#[tauri::command]
pub async fn search_directory(
    input: DirectorySearchInput,
) -> Result<DirectorySearchResult, String> {
    tauri::async_runtime::spawn_blocking(move || search(input).map_err(|error| error.to_string()))
        .await
        .map_err(|error| error.to_string())?
}
