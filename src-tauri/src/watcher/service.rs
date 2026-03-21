use std::{
    path::{Path, PathBuf},
    sync::{Arc, Mutex, RwLock},
    time::{Duration, Instant},
};

use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{AppHandle, Emitter};

use crate::{
    document::service::DocumentService,
    error::{AppError, AppResult},
    events::DOCUMENT_REFRESHED_EVENT,
    syntax_highlight::SyntaxUiTheme,
};

struct ActiveWatcher {
    _watcher: RecommendedWatcher,
    _watched_path: PathBuf,
}

#[derive(Clone, Default)]
pub struct WatcherService {
    active_watcher: Arc<Mutex<Option<ActiveWatcher>>>,
}

impl WatcherService {
    pub fn new() -> Self {
        Self {
            active_watcher: Arc::new(Mutex::new(None)),
        }
    }

    pub fn watch_active_document(
        &self,
        path: PathBuf,
        app_handle: AppHandle,
        document_service: DocumentService,
        syntax_ui_theme: Arc<RwLock<SyntaxUiTheme>>,
    ) -> AppResult<()> {
        let watched_path = path.clone();
        let last_refresh = Arc::new(Mutex::new(None::<Instant>));
        let refresh_guard = Arc::clone(&last_refresh);
        let app_handle_for_callback = app_handle.clone();
        let document_service_for_callback = document_service.clone();
        let watched_path_for_callback = watched_path.clone();
        let syntax_ui_theme_for_callback = Arc::clone(&syntax_ui_theme);

        let mut watcher =
            notify::recommended_watcher(move |result: notify::Result<notify::Event>| {
                let Ok(event) = result else {
                    return;
                };

                if !matches!(event.kind, EventKind::Modify(_) | EventKind::Create(_)) {
                    return;
                }

                if !event
                    .paths
                    .iter()
                    .any(|event_path| paths_match(event_path, &watched_path_for_callback))
                {
                    return;
                }

                let Ok(mut last_refresh_at) = refresh_guard.lock() else {
                    return;
                };

                if last_refresh_at
                    .as_ref()
                    .is_some_and(|previous| previous.elapsed() < Duration::from_millis(200))
                {
                    return;
                }

                *last_refresh_at = Some(Instant::now());

                let ui_theme = syntax_ui_theme_for_callback
                    .read()
                    .map(|guard| *guard)
                    .unwrap_or_default();

                if let Ok(snapshot) =
                    document_service_for_callback.reload(&watched_path_for_callback, ui_theme)
                {
                    let _ = app_handle_for_callback.emit(DOCUMENT_REFRESHED_EVENT, snapshot);
                }
            })?;

        watcher.configure(Config::default().with_poll_interval(Duration::from_millis(250)))?;
        watcher.watch(&watched_path, RecursiveMode::NonRecursive)?;

        let mut active_watcher = self
            .active_watcher
            .lock()
            .map_err(|_| AppError::State("watcher state lock poisoned".to_string()))?;
        *active_watcher = Some(ActiveWatcher {
            _watcher: watcher,
            _watched_path: watched_path,
        });

        Ok(())
    }

    pub fn stop(&self) -> AppResult<()> {
        let mut active_watcher = self
            .active_watcher
            .lock()
            .map_err(|_| AppError::State("watcher state lock poisoned".to_string()))?;
        *active_watcher = None;
        Ok(())
    }
}

fn paths_match(candidate: &Path, watched_path: &Path) -> bool {
    if candidate == watched_path {
        return true;
    }

    match candidate.canonicalize() {
        Ok(path) => path == watched_path,
        Err(_) => false,
    }
}
