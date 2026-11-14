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
    verbose_log,
};

struct ActiveWatcher {
    _watcher: RecommendedWatcher,
    _watched_path: PathBuf,
    _watched_directory: PathBuf,
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
        let watched_directory = watched_path
            .parent()
            .map(Path::to_path_buf)
            .ok_or_else(|| AppError::State("document path has no parent directory".to_string()))?;
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

                let reload_started_at = verbose_log::is_enabled().then(Instant::now);
                let reload_result =
                    document_service_for_callback.reload(&watched_path_for_callback, ui_theme);
                record_reload_outcome(
                    &watched_path_for_callback,
                    reload_started_at,
                    &reload_result,
                );
                if let Ok(snapshot) = reload_result {
                    let _ = app_handle_for_callback.emit(DOCUMENT_REFRESHED_EVENT, snapshot);
                }
            })?;

        watcher.configure(Config::default().with_poll_interval(Duration::from_millis(250)))?;
        watcher.watch(&watched_directory, RecursiveMode::NonRecursive)?;

        let mut active_watcher = self
            .active_watcher
            .lock()
            .map_err(|_| AppError::State("watcher state lock poisoned".to_string()))?;
        *active_watcher = Some(ActiveWatcher {
            _watcher: watcher,
            _watched_path: watched_path,
            _watched_directory: watched_directory,
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

fn record_reload_outcome<T>(path: &Path, started_at: Option<Instant>, result: &AppResult<T>) {
    let Some(started_at) = started_at else {
        return;
    };

    match result {
        Ok(_) => verbose_log::record_path_phase("watcher_reload", path, started_at, "success"),
        Err(error) => {
            verbose_log::record_app_error("watcher_reload", Some(path), started_at, error);
        }
    }
}

fn paths_match(candidate: &Path, watched_path: &Path) -> bool {
    if candidate == watched_path {
        return true;
    }

    if candidate.file_name() == watched_path.file_name()
        && candidate.parent() == watched_path.parent()
    {
        return true;
    }

    match candidate.canonicalize() {
        Ok(path) => path == watched_path,
        Err(_) => false,
    }
}

#[cfg(test)]
mod tests {
    use std::{io, path::Path, time::Instant};

    use crate::{
        error::{AppError, AppResult},
        verbose_log,
    };

    use super::{paths_match, record_reload_outcome};

    #[test]
    fn paths_match_accepts_same_directory_replacement_path_without_canonicalizing() {
        assert!(paths_match(
            Path::new("/tmp/chilla/notes.md"),
            Path::new("/tmp/chilla/notes.md")
        ));
    }

    #[test]
    fn paths_match_rejects_same_name_in_different_directory() {
        assert!(!paths_match(
            Path::new("/tmp/chilla-other/notes.md"),
            Path::new("/tmp/chilla/notes.md")
        ));
    }

    #[test]
    fn watcher_reload_records_one_semantic_success_without_file_io_duplication() {
        let path = Path::new("/tmp/chilla/notes.md");
        let result: AppResult<()> = Ok(());
        let (_, lines) = verbose_log::with_test_sink(|| {
            record_reload_outcome(path, Some(Instant::now()), &result);
        });

        assert_eq!(lines.len(), 1);
        assert!(lines[0].contains("event=\"watcher_reload\" outcome=\"success\""));
        assert!(lines[0].contains("path=\"/tmp/chilla/notes.md\""));
        assert!(!lines[0].contains("event=\"file_io\""));
    }

    #[test]
    fn watcher_reload_records_one_swallowed_semantic_failure() {
        let path = Path::new("/tmp/chilla/missing.md");
        let error = AppError::io("read", path, io::Error::from(io::ErrorKind::NotFound));
        let result: AppResult<()> = Err(error);
        let (_, lines) = verbose_log::with_test_sink(|| {
            record_reload_outcome(path, Some(Instant::now()), &result);
        });

        assert_eq!(lines.len(), 1);
        assert!(lines[0].contains("event=\"watcher_reload\" outcome=\"failure\""));
        assert!(lines[0].contains("path=\"/tmp/chilla/missing.md\""));
        assert!(lines[0].contains("error="));
        assert!(lines[0].contains("raw_os_error=unavailable"));
        assert!(!lines[0].contains("event=\"file_io\""));
    }
}
