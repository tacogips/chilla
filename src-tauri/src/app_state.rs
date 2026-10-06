use std::sync::{Arc, Mutex, RwLock};

use tauri::AppHandle;

use crate::{
    document::service::DocumentService,
    media_stream::MediaStreamService,
    syntax_highlight::SyntaxUiTheme,
    viewer::{service::ViewerService, types::StartupContext},
    watcher::service::WatcherService,
};

/// Queue managed before the event loop starts, including events before Tauri Ready.
#[derive(Clone, Default)]
pub struct NativeOpenRequests(Arc<Mutex<Vec<Vec<String>>>>);
impl NativeOpenRequests {
    pub fn enqueue(&self, paths: Vec<String>) -> Result<(), String> {
        if paths.is_empty() {
            return Ok(());
        }
        self.0
            .lock()
            .map_err(|_| "native file-open queue unavailable".to_string())?
            .push(paths);
        Ok(())
    }
    pub fn take(&self) -> Result<Vec<Vec<String>>, String> {
        let mut requests = self
            .0
            .lock()
            .map_err(|_| "native file-open queue unavailable".to_string())?;
        Ok(std::mem::take(&mut *requests))
    }
}

pub struct AppState {
    startup_context: StartupContext,
    native_open_requests: NativeOpenRequests,
    app_handle: AppHandle,
    document_service: DocumentService,
    viewer_service: ViewerService,
    watcher_service: WatcherService,
    media_stream_service: MediaStreamService,
    syntax_ui_theme: Arc<RwLock<SyntaxUiTheme>>,
}

impl AppState {
    pub fn new(
        startup_context: StartupContext,
        app_handle: AppHandle,
        document_service: DocumentService,
        viewer_service: ViewerService,
        watcher_service: WatcherService,
        media_stream_service: MediaStreamService,
        native_open_requests: NativeOpenRequests,
    ) -> Self {
        Self {
            startup_context,
            native_open_requests,
            app_handle,
            document_service,
            viewer_service,
            watcher_service,
            media_stream_service,
            syntax_ui_theme: Arc::new(RwLock::new(SyntaxUiTheme::Dark)),
        }
    }

    /// Retain an ordered native file-open batch until the frontend can consume it.
    pub fn enqueue_native_open_request(&self, paths: Vec<String>) -> Result<(), String> {
        self.native_open_requests.enqueue(paths)
    }

    /// Atomically drain all batches, preserving delivery and file order.
    pub fn take_native_open_requests(&self) -> Result<Vec<Vec<String>>, String> {
        self.native_open_requests.take()
    }

    pub fn syntax_ui_theme(&self) -> SyntaxUiTheme {
        self.syntax_ui_theme
            .read()
            .map(|guard| *guard)
            .unwrap_or_default()
    }

    pub fn set_syntax_ui_theme(&self, theme: SyntaxUiTheme) {
        if let Ok(mut guard) = self.syntax_ui_theme.write() {
            *guard = theme;
        }
    }

    pub fn syntax_ui_theme_handle(&self) -> Arc<RwLock<SyntaxUiTheme>> {
        Arc::clone(&self.syntax_ui_theme)
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

    pub fn media_stream_service(&self) -> MediaStreamService {
        self.media_stream_service.clone()
    }
}
