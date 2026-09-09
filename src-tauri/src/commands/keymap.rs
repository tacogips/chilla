use crate::keymap_config::{load_keymap_config, KeymapConfigResponse};

#[tauri::command]
pub async fn get_keymap_config() -> KeymapConfigResponse {
    tauri::async_runtime::spawn_blocking(load_keymap_config)
        .await
        .unwrap_or_else(|_| {
            KeymapConfigResponse::failure(None, "Keymap configuration worker failed")
        })
}
