use tauri::AppHandle;

use crate::{
    document::service::DocumentService,
    viewer::{service::ViewerService, types::StartupContext},
    watcher::service::WatcherService,
};

pub struct AppState {
    startup_context: StartupContext,
    app_handle: AppHandle,
    document_service: DocumentService,
    viewer_service: ViewerService,
    watcher_service: WatcherService,
}

impl AppState {
    pub fn new(
        startup_context: StartupContext,
        app_handle: AppHandle,
        document_service: DocumentService,
        viewer_service: ViewerService,
        watcher_service: WatcherService,
    ) -> Self {
        Self {
            startup_context,
            app_handle,
            document_service,
            viewer_service,
            watcher_service,
        }
    }

    pub fn startup_context(&self) -> StartupContext {
        self.startup_context.clone()
    }

    pub fn app_handle(&self) -> AppHandle {
        self.app_handle.clone()
    }

    pub fn document_service(&self) -> DocumentService {
        self.document_service.clone()
    }

    pub fn viewer_service(&self) -> ViewerService {
        self.viewer_service.clone()
    }

    pub fn watcher_service(&self) -> WatcherService {
        self.watcher_service.clone()
    }
}
