use std::path::{Path, PathBuf};

use tauri::AppHandle;

use crate::{document::service::DocumentService, watcher::service::WatcherService};

pub struct AppState {
    startup_path: PathBuf,
    app_handle: AppHandle,
    document_service: DocumentService,
    watcher_service: WatcherService,
}

impl AppState {
    pub fn new(
        startup_path: PathBuf,
        app_handle: AppHandle,
        document_service: DocumentService,
        watcher_service: WatcherService,
    ) -> Self {
        Self {
            startup_path,
            app_handle,
            document_service,
            watcher_service,
        }
    }

    pub fn startup_path(&self) -> &Path {
        &self.startup_path
    }

    pub fn app_handle(&self) -> AppHandle {
        self.app_handle.clone()
    }

    pub fn document_service(&self) -> DocumentService {
        self.document_service.clone()
    }

    pub fn watcher_service(&self) -> WatcherService {
        self.watcher_service.clone()
    }
}
