use std::{
    fs::{self, File, OpenOptions},
    io::{self, IsTerminal, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc::{self, Receiver, SyncSender, TrySendError},
        Arc, Mutex, OnceLock,
    },
    thread,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use crate::{cli::StartupTarget, error::AppError};

#[cfg(test)]
use std::cell::RefCell;

#[cfg(unix)]
use std::os::unix::fs::{MetadataExt, OpenOptionsExt, PermissionsExt};

pub const VERBOSE_LOG_PATH_PATTERN: &str =
    "~/Library/Logs/chilla/chilla-verbose-<pid>[-<collision>].log";
pub const VERBOSE_LOG_MAX_BYTES: u64 = 10 * 1024 * 1024;
pub const VERBOSE_LOG_RETENTION: Duration = Duration::from_secs(14 * 24 * 60 * 60);
const MAX_LOG_FILE_ATTEMPTS: u32 = 100;
const LIMIT_MARKER_RESERVED_BYTES: u64 = 512;
const RECORD_QUEUE_CAPACITY: usize = 1_024;
const RETENTION_MAX_ENTRIES: usize = 256;
const RETENTION_MAX_DURATION: Duration = Duration::from_millis(25);
const SHUTDOWN_MAX_DURATION: Duration = Duration::from_millis(250);

pub struct VerboseInit {
    pub enabled: bool,
    pub process_started_at: Instant,
}

pub enum VerboseIoOutcome<'a> {
    Success { size_bytes: Option<u64> },
    Failure { error: &'a io::Error },
}

#[derive(Clone, Copy)]
enum TerminalSink {
    Stderr,
    Stdout,
    None,
}

struct StartupLoad {
    path: PathBuf,
}

struct VerboseLogger {
    process_started_at: Instant,
    sender: SyncSender<WriterMessage>,
    dropped_records: Arc<AtomicU64>,
    frontend_ready_recorded: AtomicBool,
    startup_load: Mutex<Option<StartupLoad>>,
}

enum WriterMessage {
    Record(String),
    Shutdown(SyncSender<()>),
}

struct WriterConfig {
    directory: Option<PathBuf>,
    process_id: u32,
    process_started_at: Instant,
    terminal: TerminalSink,
    max_file_bytes: u64,
}

struct SinkState {
    file: Option<File>,
    bytes_written: u64,
    records_suppressed: bool,
    max_file_bytes: u64,
}

static LOGGER: OnceLock<VerboseLogger> = OnceLock::new();

#[cfg(test)]
struct TestSink {
    enabled: bool,
    process_started_at: Instant,
    lines: Vec<String>,
}

#[cfg(test)]
thread_local! {
    static TEST_SINK: RefCell<Option<TestSink>> = const { RefCell::new(None) };
}

pub fn initialize(config: VerboseInit) -> Option<PathBuf> {
    if !config.enabled {
        return None;
    }

    let directory = trusted_log_directory();
    let predicted_path = directory
        .as_ref()
        .map(|directory| log_file_path(directory, std::process::id(), 0));
    let terminal = select_terminal_sink(io::stderr().is_terminal(), io::stdout().is_terminal());
    let (sender, receiver) = mpsc::sync_channel(RECORD_QUEUE_CAPACITY);
    let dropped_records = Arc::new(AtomicU64::new(0));
    let worker_dropped_records = Arc::clone(&dropped_records);
    let writer_config = WriterConfig {
        directory,
        process_id: std::process::id(),
        process_started_at: config.process_started_at,
        terminal,
        max_file_bytes: VERBOSE_LOG_MAX_BYTES,
    };
    if thread::Builder::new()
        .name("chilla-verbose-log".to_string())
        .spawn(move || writer_loop(receiver, worker_dropped_records, writer_config))
        .is_err()
    {
        return None;
    }

    let logger = VerboseLogger {
        process_started_at: config.process_started_at,
        sender,
        dropped_records,
        frontend_ready_recorded: AtomicBool::new(false),
        startup_load: Mutex::new(None),
    };

    if LOGGER.set(logger).is_err() {
        return None;
    }
    predicted_path
}

/// Requests an ordered drain of queued diagnostics without waiting indefinitely
/// for a stalled filesystem or terminal.
pub fn shutdown() {
    let Some(logger) = LOGGER.get() else {
        return;
    };
    logger.shutdown(SHUTDOWN_MAX_DURATION);
}

#[must_use]
pub fn is_enabled() -> bool {
    #[cfg(test)]
    if let Some(enabled) = TEST_SINK.with(|sink| sink.borrow().as_ref().map(|sink| sink.enabled)) {
        return enabled;
    }

    LOGGER.get().is_some()
}

pub fn record_event(name: &str, outcome: &str) {
    emit_record(Record {
        name,
        outcome,
        duration: None,
        operation: None,
        path: None,
        size_bytes: None,
        error: None,
        raw_os_error: None,
    });
}

pub fn record_phase(name: &str, started_at: Instant, outcome: &str) {
    if !is_enabled() {
        return;
    }

    emit_record(Record {
        name,
        outcome,
        duration: Some(started_at.elapsed()),
        operation: None,
        path: None,
        size_bytes: None,
        error: None,
        raw_os_error: None,
    });
}

pub fn record_path_phase(name: &str, path: &Path, started_at: Instant, outcome: &str) {
    if !is_enabled() {
        return;
    }

    emit_record(Record {
        name,
        outcome,
        duration: Some(started_at.elapsed()),
        operation: None,
        path: Some(path),
        size_bytes: None,
        error: None,
        raw_os_error: None,
    });
}

pub fn record_phase_message(name: &str, started_at: Instant, outcome: &str, message: &str) {
    if !is_enabled() {
        return;
    }

    emit_record(Record {
        name,
        outcome,
        duration: Some(started_at.elapsed()),
        operation: None,
        path: None,
        size_bytes: None,
        error: Some(message),
        raw_os_error: None,
    });
}

pub fn record_app_error(name: &str, path: Option<&Path>, started_at: Instant, error: &AppError) {
    record_app_error_with(name, path, started_at, || match error {
        AppError::Io { source, .. } => (source.to_string(), source.raw_os_error()),
        _ => (error.to_string(), None),
    });
}

fn record_app_error_with(
    name: &str,
    path: Option<&Path>,
    started_at: Instant,
    error_details: impl FnOnce() -> (String, Option<i32>),
) {
    if !is_enabled() {
        return;
    }

    let (error_message, raw_os_error) = error_details();
    emit_record(Record {
        name,
        outcome: "failure",
        duration: Some(started_at.elapsed()),
        operation: None,
        path,
        size_bytes: None,
        error: Some(&error_message),
        raw_os_error,
    });
}

pub fn record_io(operation: &str, path: &Path, started_at: Instant, outcome: VerboseIoOutcome<'_>) {
    if !is_enabled() {
        return;
    }

    match outcome {
        VerboseIoOutcome::Success { size_bytes } => emit_record(Record {
            name: "file_io",
            outcome: "success",
            duration: Some(started_at.elapsed()),
            operation: Some(operation),
            path: Some(path),
            size_bytes: Some(size_bytes),
            error: None,
            raw_os_error: None,
        }),
        VerboseIoOutcome::Failure { error } => {
            let error_message = error.to_string();
            emit_record(Record {
                name: "file_io",
                outcome: "failure",
                duration: Some(started_at.elapsed()),
                operation: Some(operation),
                path: Some(path),
                size_bytes: Some(None),
                error: Some(&error_message),
                raw_os_error: error.raw_os_error(),
            });
        }
    }
}

pub fn mark_frontend_ready() {
    let Some(logger) = LOGGER.get() else {
        return;
    };

    if !mark_once(&logger.frontend_ready_recorded) {
        return;
    }

    record_phase("frontend_ready", logger.process_started_at, "success");
}

pub fn arm_startup_load(target: &StartupTarget) {
    let Some(logger) = LOGGER.get() else {
        return;
    };

    let path = startup_load_path(target).map(Path::to_path_buf);

    let Ok(mut startup_load) = logger.startup_load.lock() else {
        return;
    };
    *startup_load = path.map(|path| StartupLoad { path });
}

fn mark_once(marker: &AtomicBool) -> bool {
    !marker.swap(true, Ordering::AcqRel)
}

fn startup_load_path(target: &StartupTarget) -> Option<&Path> {
    match target {
        StartupTarget::File(path) => Some(path),
        StartupTarget::FileSet(paths) => paths.first().map(PathBuf::as_path),
        StartupTarget::CurrentDirectory(_)
        | StartupTarget::Directory(_)
        | StartupTarget::GitHubPr(_)
        | StartupTarget::GitDiff(_) => None,
    }
}

#[must_use]
pub fn startup_load_started(path: &Path) -> Option<Instant> {
    let logger = LOGGER.get()?;
    let startup_load = logger.startup_load.lock().ok()?;
    startup_load_matches(&startup_load, path).then(Instant::now)
}

pub fn complete_startup_load(path: &Path, started_at: Option<Instant>, outcome: &str) {
    let Some(started_at) = started_at else {
        return;
    };
    let Some(logger) = LOGGER.get() else {
        return;
    };

    let matched = {
        let Ok(mut startup_load) = logger.startup_load.lock() else {
            return;
        };
        consume_startup_load(&mut startup_load, path)
    };

    if matched {
        logger.enqueue_record(Record {
            name: "startup_load",
            outcome,
            duration: Some(started_at.elapsed()),
            operation: None,
            path: Some(path),
            size_bytes: None,
            error: None,
            raw_os_error: None,
        });
    }
}

fn startup_load_matches(startup_load: &Option<StartupLoad>, path: &Path) -> bool {
    startup_load
        .as_ref()
        .is_some_and(|startup_load| startup_load.path == path)
}

fn consume_startup_load(startup_load: &mut Option<StartupLoad>, path: &Path) -> bool {
    if !startup_load_matches(startup_load, path) {
        return false;
    }

    *startup_load = None;
    true
}

fn trusted_log_directory() -> Option<PathBuf> {
    trusted_log_directory_for_home(std::env::var_os("HOME").as_deref().map(Path::new))
}

fn trusted_log_directory_for_home(home: Option<&Path>) -> Option<PathBuf> {
    let home = home?;
    if !home.is_absolute() {
        return None;
    }
    Some(home.join("Library").join("Logs").join("chilla"))
}

#[cfg(test)]
fn create_log_file_for_home(
    home: Option<&Path>,
    process_id: u32,
) -> (Option<File>, Option<PathBuf>) {
    let Some(directory) = trusted_log_directory_for_home(home) else {
        return (None, None);
    };
    create_log_file_in_directory(&directory, process_id)
}

fn create_log_file_in_directory(
    directory: &Path,
    process_id: u32,
) -> (Option<File>, Option<PathBuf>) {
    if prepare_log_directory(directory).is_err() {
        return (None, None);
    }

    for attempt in 0..MAX_LOG_FILE_ATTEMPTS {
        let path = log_file_path(directory, process_id, attempt);
        match open_private_log_file(&path) {
            Ok(file) => return (Some(file), Some(path)),
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
            Err(_) => return (None, None),
        }
    }

    (None, None)
}

fn prepare_log_directory(directory: &Path) -> io::Result<()> {
    if !directory.is_absolute() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "verbose log directory is not absolute",
        ));
    }

    let logs = directory.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "verbose log directory has no parent",
        )
    })?;
    let library = logs.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "verbose Logs directory has no parent",
        )
    })?;
    let home = library.parent().ok_or_else(|| {
        io::Error::new(
            io::ErrorKind::InvalidInput,
            "verbose Library directory has no parent",
        )
    })?;
    require_physical_directory(home)?;
    for component in [library, logs, directory] {
        match fs::create_dir(component) {
            Ok(()) => {}
            Err(error) if error.kind() == io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error),
        }
        require_physical_directory(component)?;
    }

    #[cfg(unix)]
    fs::set_permissions(directory, fs::Permissions::from_mode(0o700))?;

    Ok(())
}

fn require_physical_directory(path: &Path) -> io::Result<()> {
    let metadata = fs::symlink_metadata(path)?;
    if metadata.file_type().is_symlink() || !metadata.is_dir() {
        return Err(io::Error::new(
            io::ErrorKind::InvalidInput,
            "verbose log path component is not a physical directory",
        ));
    }
    Ok(())
}

#[cfg(test)]
fn cleanup_expired_logs(directory: &Path, now: SystemTime) {
    cleanup_expired_logs_bounded(directory, now, usize::MAX, Duration::from_secs(u64::MAX));
}

fn cleanup_expired_logs_bounded(
    directory: &Path,
    now: SystemTime,
    max_entries: usize,
    max_duration: Duration,
) -> usize {
    let started_at = Instant::now();
    let Ok(entries) = fs::read_dir(directory) else {
        return 0;
    };

    let mut scanned = 0;
    for entry in entries {
        if scanned >= max_entries || started_at.elapsed() >= max_duration {
            break;
        }
        scanned += 1;
        let Ok(entry) = entry else {
            continue;
        };
        let path = entry.path();
        if !is_verbose_log_name(&entry.file_name()) {
            continue;
        }

        let Ok(metadata) = fs::symlink_metadata(&path) else {
            continue;
        };
        if !metadata.file_type().is_file() {
            continue;
        }

        let Ok(modified) = metadata.modified() else {
            continue;
        };
        let Ok(age) = now.duration_since(modified) else {
            continue;
        };
        if age > VERBOSE_LOG_RETENTION {
            remove_expired_unlocked_log(&path);
        }
    }
    scanned
}

fn remove_expired_unlocked_log(path: &Path) {
    let Ok(file) = OpenOptions::new().read(true).write(true).open(path) else {
        return;
    };
    if file.try_lock().is_err() {
        return;
    }

    let Ok(open_metadata) = file.metadata() else {
        return;
    };
    let Ok(path_metadata) = fs::symlink_metadata(path) else {
        return;
    };
    if !open_metadata.is_file()
        || !path_metadata.file_type().is_file()
        || !metadata_identifies_same_file(&open_metadata, &path_metadata)
    {
        return;
    }

    let _ = fs::remove_file(path);
}

#[cfg(unix)]
fn metadata_identifies_same_file(left: &fs::Metadata, right: &fs::Metadata) -> bool {
    left.dev() == right.dev() && left.ino() == right.ino()
}

#[cfg(not(unix))]
fn metadata_identifies_same_file(_left: &fs::Metadata, _right: &fs::Metadata) -> bool {
    true
}

fn is_verbose_log_name(file_name: &std::ffi::OsStr) -> bool {
    let Some(file_name) = file_name.to_str() else {
        return false;
    };
    let Some(identity) = file_name
        .strip_prefix("chilla-verbose-")
        .and_then(|name| name.strip_suffix(".log"))
    else {
        return false;
    };

    let mut components = identity.split('-');
    let Some(process_id) = components.next() else {
        return false;
    };
    if !is_ascii_u32(process_id) {
        return false;
    }

    match (components.next(), components.next()) {
        (None, None) => true,
        (Some(collision), None) => is_ascii_u32(collision),
        _ => false,
    }
}

fn is_ascii_u32(value: &str) -> bool {
    !value.is_empty()
        && value.bytes().all(|byte| byte.is_ascii_digit())
        && value.parse::<u32>().is_ok()
}

fn log_file_path(directory: &Path, process_id: u32, attempt: u32) -> PathBuf {
    if attempt == 0 {
        directory.join(format!("chilla-verbose-{process_id}.log"))
    } else {
        directory.join(format!("chilla-verbose-{process_id}-{attempt}.log"))
    }
}

fn open_private_log_file(path: &Path) -> io::Result<File> {
    let mut options = OpenOptions::new();
    options.write(true).create_new(true);

    #[cfg(unix)]
    options.mode(0o600);

    let file = options.open(path)?;
    if let Err(error) = file.lock() {
        drop(file);
        let _ = fs::remove_file(path);
        return Err(error);
    }

    #[cfg(unix)]
    file.set_permissions(fs::Permissions::from_mode(0o600))?;

    Ok(file)
}

fn select_terminal_sink(stderr_is_terminal: bool, stdout_is_terminal: bool) -> TerminalSink {
    if stderr_is_terminal {
        TerminalSink::Stderr
    } else if stdout_is_terminal {
        TerminalSink::Stdout
    } else {
        TerminalSink::None
    }
}

struct Record<'a> {
    name: &'a str,
    outcome: &'a str,
    duration: Option<std::time::Duration>,
    operation: Option<&'a str>,
    path: Option<&'a Path>,
    size_bytes: Option<Option<u64>>,
    error: Option<&'a str>,
    raw_os_error: Option<i32>,
}

impl VerboseLogger {
    fn enqueue_record(&self, record: Record<'_>) {
        let line = format_record(self.process_started_at, record);
        match self.sender.try_send(WriterMessage::Record(line)) {
            Ok(()) => {}
            Err(TrySendError::Full(_)) => {
                self.dropped_records.fetch_add(1, Ordering::Relaxed);
            }
            Err(TrySendError::Disconnected(_)) => {}
        }
    }

    fn shutdown(&self, max_duration: Duration) {
        let deadline = Instant::now() + max_duration;
        let (acknowledge, acknowledged) = mpsc::sync_channel(1);
        let mut message = WriterMessage::Shutdown(acknowledge);
        loop {
            match self.sender.try_send(message) {
                Ok(()) => break,
                Err(TrySendError::Full(returned)) => {
                    message = returned;
                    if Instant::now() >= deadline {
                        return;
                    }
                    thread::sleep(Duration::from_millis(1));
                }
                Err(TrySendError::Disconnected(_)) => return,
            }
        }

        let remaining = deadline.saturating_duration_since(Instant::now());
        let _ = acknowledged.recv_timeout(remaining);
    }
}

fn writer_loop(
    receiver: Receiver<WriterMessage>,
    dropped_records: Arc<AtomicU64>,
    config: WriterConfig,
) {
    let mut sink = SinkState {
        file: None,
        bytes_written: 0,
        records_suppressed: false,
        max_file_bytes: config.max_file_bytes,
    };
    let first_message = match receiver.recv() {
        Ok(message) => message,
        Err(_) => return,
    };
    match first_message {
        WriterMessage::Record(line) => {
            let mut cleanup_directory = None;
            if let Some(directory) = config.directory.as_deref() {
                (sink.file, _) = create_log_file_in_directory(directory, config.process_id);
                if sink.file.is_some() {
                    cleanup_directory = Some(directory.to_path_buf());
                }
            }
            write_dropped_marker(
                &mut sink,
                config.terminal,
                config.process_started_at,
                &dropped_records,
            );
            write_sink_line(&mut sink, config.terminal, config.process_started_at, &line);
            if let Some(directory) = cleanup_directory {
                spawn_retention_cleanup(directory);
            }
        }
        WriterMessage::Shutdown(acknowledge) => {
            write_dropped_marker(
                &mut sink,
                config.terminal,
                config.process_started_at,
                &dropped_records,
            );
            let _ = acknowledge.try_send(());
            return;
        }
    }

    while let Ok(message) = receiver.recv() {
        match message {
            WriterMessage::Record(line) => {
                write_dropped_marker(
                    &mut sink,
                    config.terminal,
                    config.process_started_at,
                    &dropped_records,
                );
                write_sink_line(&mut sink, config.terminal, config.process_started_at, &line);
            }
            WriterMessage::Shutdown(acknowledge) => {
                write_dropped_marker(
                    &mut sink,
                    config.terminal,
                    config.process_started_at,
                    &dropped_records,
                );
                let _ = acknowledge.try_send(());
                return;
            }
        }
    }
}

fn spawn_retention_cleanup(directory: PathBuf) {
    let _ = thread::Builder::new()
        .name("chilla-verbose-retention".to_string())
        .spawn(move || {
            cleanup_expired_logs_bounded(
                &directory,
                SystemTime::now(),
                RETENTION_MAX_ENTRIES,
                RETENTION_MAX_DURATION,
            );
        });
}

fn write_dropped_marker(
    sink: &mut SinkState,
    terminal: TerminalSink,
    process_started_at: Instant,
    dropped_records: &AtomicU64,
) {
    let dropped = dropped_records.swap(0, Ordering::AcqRel);
    if dropped == 0 {
        return;
    }
    let mut marker = format_record(
        process_started_at,
        Record {
            name: "verbose_log_records_dropped",
            outcome: "degraded",
            duration: None,
            operation: None,
            path: None,
            size_bytes: None,
            error: None,
            raw_os_error: None,
        },
    );
    marker.pop();
    marker.push_str(&format!(" dropped_records={dropped}\n"));
    write_sink_line(sink, terminal, process_started_at, &marker);
}

fn write_sink_line(
    sink: &mut SinkState,
    terminal: TerminalSink,
    process_started_at: Instant,
    line: &str,
) {
    if sink.records_suppressed {
        return;
    }
    if sink.file.is_some()
        && sink
            .bytes_written
            .saturating_add(line.len() as u64)
            .saturating_add(LIMIT_MARKER_RESERVED_BYTES)
            > sink.max_file_bytes
    {
        let marker = format_record(
            process_started_at,
            Record {
                name: "verbose_log_limit_reached",
                outcome: "truncated",
                duration: None,
                operation: None,
                path: None,
                size_bytes: None,
                error: None,
                raw_os_error: None,
            },
        );
        debug_assert!(marker.len() as u64 <= LIMIT_MARKER_RESERVED_BYTES);
        write_file_line(sink, &marker);
        write_terminal_line(terminal, &marker);
        sink.records_suppressed = true;
        return;
    }

    write_file_line(sink, line);
    write_terminal_line(terminal, line);
}

fn write_terminal_line(terminal: TerminalSink, line: &str) {
    match terminal {
        TerminalSink::Stderr => {
            let mut stderr = io::stderr().lock();
            let _ = stderr.write_all(line.as_bytes());
            let _ = stderr.flush();
        }
        TerminalSink::Stdout => {
            let mut stdout = io::stdout().lock();
            let _ = stdout.write_all(line.as_bytes());
            let _ = stdout.flush();
        }
        TerminalSink::None => {}
    }
}

fn write_file_line(sink: &mut SinkState, line: &str) {
    let Some(writer) = sink.file.as_mut() else {
        return;
    };

    if writer.write_all(line.as_bytes()).is_err() || writer.flush().is_err() {
        sink.file = None;
        return;
    }
    sink.bytes_written = sink.bytes_written.saturating_add(line.len() as u64);
}

fn emit_record(record: Record<'_>) {
    #[cfg(test)]
    if TEST_SINK.with(|sink| sink.borrow().is_some()) {
        TEST_SINK.with(|sink| {
            let mut sink = sink.borrow_mut();
            if let Some(sink) = sink.as_mut() {
                if sink.enabled {
                    sink.lines
                        .push(format_record(sink.process_started_at, record));
                }
            }
        });
        return;
    }

    if let Some(logger) = LOGGER.get() {
        logger.enqueue_record(record);
    }
}

#[cfg(test)]
pub(crate) fn with_test_sink<T>(operation: impl FnOnce() -> T) -> (T, Vec<String>) {
    with_configured_test_sink(true, operation)
}

#[cfg(test)]
pub(crate) fn with_disabled_test_sink<T>(operation: impl FnOnce() -> T) -> (T, Vec<String>) {
    with_configured_test_sink(false, operation)
}

#[cfg(test)]
fn with_configured_test_sink<T>(enabled: bool, operation: impl FnOnce() -> T) -> (T, Vec<String>) {
    TEST_SINK.with(|sink| {
        assert!(
            sink.borrow().is_none(),
            "test diagnostic sink already active"
        );
        *sink.borrow_mut() = Some(TestSink {
            enabled,
            process_started_at: Instant::now(),
            lines: Vec::new(),
        });
    });

    let result = operation();
    let lines = TEST_SINK.with(|sink| {
        sink.borrow_mut()
            .take()
            .map_or_else(Vec::new, |sink| sink.lines)
    });
    (result, lines)
}

fn format_record(process_started_at: Instant, record: Record<'_>) -> String {
    let timestamp_unix_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let elapsed_ms = process_started_at.elapsed().as_millis();
    let mut line = format!(
        "timestamp_unix_ms={timestamp_unix_ms} elapsed_ms={elapsed_ms} event={} outcome={}",
        quote(record.name),
        quote(record.outcome)
    );

    if let Some(duration) = record.duration {
        line.push_str(&format!(" duration_ms={}", duration.as_millis()));
    }
    if let Some(operation) = record.operation {
        line.push_str(&format!(" operation={}", quote(operation)));
    }
    if let Some(path) = record.path {
        line.push_str(&format!(" path={}", quote(&path.display().to_string())));
    }
    if let Some(size_bytes) = record.size_bytes {
        match size_bytes {
            Some(size_bytes) => line.push_str(&format!(" size_bytes={size_bytes}")),
            None => line.push_str(" size_bytes=unavailable"),
        }
    }
    if let Some(error) = record.error {
        line.push_str(&format!(" error={}", quote(error)));
    }
    if record.error.is_some() {
        match record.raw_os_error {
            Some(raw_os_error) => line.push_str(&format!(" raw_os_error={raw_os_error}")),
            None => line.push_str(" raw_os_error=unavailable"),
        }
    }
    line.push('\n');
    line
}

fn quote(value: &str) -> String {
    let mut escaped = String::with_capacity(value.len());
    for character in value.chars() {
        match character {
            '\\' => escaped.push_str("\\\\"),
            '"' => escaped.push_str("\\\""),
            character if character.is_control() => escaped.extend(character.escape_default()),
            character => escaped.push(character),
        }
    }
    format!("\"{escaped}\"")
}

#[cfg(test)]
mod tests {
    use std::{
        cell::Cell,
        fs::{self, FileTimes, OpenOptions},
        path::{Path, PathBuf},
        sync::{
            atomic::{AtomicBool, AtomicU64, Ordering},
            mpsc, Arc,
        },
        thread,
        time::{Duration, Instant, SystemTime, UNIX_EPOCH},
    };

    #[cfg(unix)]
    use std::os::unix::fs::{symlink, PermissionsExt};

    use super::{
        cleanup_expired_logs, cleanup_expired_logs_bounded, consume_startup_load,
        create_log_file_for_home, format_record, is_enabled, is_verbose_log_name, mark_once, quote,
        record_app_error_with, record_event, record_io, record_path_phase, record_phase,
        record_phase_message, select_terminal_sink, startup_load_matches, startup_load_path,
        trusted_log_directory_for_home, with_disabled_test_sink, with_test_sink, Record, SinkState,
        StartupLoad, TerminalSink, VerboseIoOutcome, WriterConfig, WriterMessage,
        LIMIT_MARKER_RESERVED_BYTES, VERBOSE_LOG_RETENTION,
    };
    use crate::cli::StartupTarget;

    #[test]
    fn record_format_includes_stable_required_fields() {
        let process_started_at = Instant::now()
            .checked_sub(Duration::from_millis(5))
            .expect("test instant");
        let line = format_record(
            process_started_at,
            Record {
                name: "file_io",
                outcome: "failure",
                duration: Some(Duration::from_millis(2)),
                operation: Some("read"),
                path: Some(Path::new("/tmp/a b.md")),
                size_bytes: Some(None),
                error: Some("not found"),
                raw_os_error: Some(2),
            },
        );

        assert!(line.contains("timestamp_unix_ms="));
        assert!(line.contains("elapsed_ms="));
        assert!(line.contains("event=\"file_io\" outcome=\"failure\""));
        assert!(line.contains("duration_ms=2"));
        assert!(line.contains("operation=\"read\""));
        assert!(line.contains("path=\"/tmp/a b.md\""));
        assert!(line.contains("size_bytes=unavailable"));
        assert!(line.contains("error=\"not found\" raw_os_error=2"));
        assert!(line.ends_with('\n'));
    }

    #[test]
    fn record_values_are_single_line_and_escaped() {
        assert_eq!(
            quote("a\\b\"\nc\r\t\u{1b}\u{7}\u{0}\u{85}"),
            "\"a\\\\b\\\"\\nc\\r\\t\\u{1b}\\u{7}\\u{0}\\u{85}\""
        );
    }

    #[test]
    fn terminal_selection_prefers_stderr_then_stdout() {
        assert!(matches!(
            select_terminal_sink(true, true),
            TerminalSink::Stderr
        ));
        assert!(matches!(
            select_terminal_sink(false, true),
            TerminalSink::Stdout
        ));
        assert!(matches!(
            select_terminal_sink(false, false),
            TerminalSink::None
        ));
    }

    #[test]
    fn disabled_logging_is_a_no_op() {
        let (_, lines) = with_disabled_test_sink(|| {
            assert!(!is_enabled());
            record_event("disabled_event", "success");
            record_phase("disabled_phase", Instant::now(), "success");
            record_path_phase(
                "disabled_path_phase",
                Path::new("/tmp/disabled.md"),
                Instant::now(),
                "success",
            );
            record_phase_message(
                "disabled_message_phase",
                Instant::now(),
                "failure",
                "disabled",
            );
            record_io(
                "read",
                Path::new("/tmp/disabled.md"),
                Instant::now(),
                VerboseIoOutcome::Success {
                    size_bytes: Some(1),
                },
            );
        });

        assert!(lines.is_empty());
    }

    #[test]
    fn disabled_app_error_recording_returns_before_formatting() {
        let formatter_called = Cell::new(false);

        let (_, lines) = with_disabled_test_sink(|| {
            record_app_error_with("cli_parse", None, Instant::now(), || {
                formatter_called.set(true);
                ("must not be formatted".to_string(), Some(2))
            });
        });

        assert!(!formatter_called.get());
        assert!(lines.is_empty());
    }

    #[test]
    fn enabled_app_error_recording_formats_error_details() {
        let formatter_called = Cell::new(false);

        let (_, lines) = with_test_sink(|| {
            record_app_error_with(
                "cli_parse",
                Some(Path::new("/tmp/missing.md")),
                Instant::now(),
                || {
                    formatter_called.set(true);
                    ("No such file or directory".to_string(), Some(2))
                },
            );
        });

        assert!(formatter_called.get());
        assert_eq!(lines.len(), 1);
        assert!(lines[0].contains("event=\"cli_parse\" outcome=\"failure\""));
        assert!(lines[0].contains("path=\"/tmp/missing.md\""));
        assert!(lines[0].contains("error=\"No such file or directory\""));
        assert!(lines[0].contains("raw_os_error=2"));
    }

    #[test]
    fn sink_creation_failure_is_non_fatal() {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let test_directory = std::env::temp_dir().join(format!(
            "chilla-verbose-sink-failure-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir_all(&test_directory).expect("create test directory");
        let blocked_home = test_directory.join("blocked-home");
        fs::write(&blocked_home, "not a directory").expect("create blocking file");

        let (file, path) = create_log_file_for_home(Some(&blocked_home), 42);

        assert!(file.is_none());
        assert!(path.is_none());
        fs::remove_dir_all(&test_directory).expect("remove test directory");
    }

    #[test]
    fn relative_home_is_rejected_before_any_mutation() {
        let relative_home = format!(
            "chilla-relative-home-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_nanos()
        );
        let relative_home = Path::new(&relative_home);
        assert!(!relative_home.exists());
        assert!(trusted_log_directory_for_home(Some(relative_home)).is_none());

        let (file, path) = create_log_file_for_home(Some(relative_home), 42);

        assert!(file.is_none());
        assert!(path.is_none());
        assert!(!relative_home.exists());
    }

    #[test]
    fn existing_pid_log_is_preserved_and_uses_collision_fallback() {
        let home = unique_test_directory("collision");
        let directory = home.join("Library").join("Logs").join("chilla");
        fs::create_dir_all(&directory).expect("create log directory");
        let existing_path = directory.join("chilla-verbose-42.log");
        fs::write(&existing_path, "existing diagnostic").expect("create colliding log");

        let (file, path) = create_log_file_for_home(Some(&home), 42);
        let path = path.expect("fallback log path");

        assert!(file.is_some());
        assert_eq!(path, directory.join("chilla-verbose-42-1.log"));
        assert_eq!(
            fs::read_to_string(existing_path).expect("read colliding log"),
            "existing diagnostic"
        );

        drop(file);
        fs::remove_dir_all(home).expect("remove test directory");
    }

    #[cfg(unix)]
    #[test]
    fn pid_log_symlink_is_not_followed_or_truncated() {
        let home = unique_test_directory("symlink");
        let directory = home.join("Library").join("Logs").join("chilla");
        fs::create_dir_all(&directory).expect("create log directory");
        let victim_path = home.join("victim.log");
        fs::write(&victim_path, "must remain intact").expect("create symlink victim");
        let base_path = directory.join("chilla-verbose-42.log");
        symlink(&victim_path, &base_path).expect("create colliding symlink");

        let (file, path) = create_log_file_for_home(Some(&home), 42);

        assert!(file.is_some());
        assert_eq!(
            path.as_deref(),
            Some(directory.join("chilla-verbose-42-1.log").as_path())
        );
        assert_eq!(
            fs::read_to_string(victim_path).expect("read symlink victim"),
            "must remain intact"
        );

        drop(file);
        fs::remove_dir_all(home).expect("remove test directory");
    }

    #[cfg(unix)]
    #[test]
    fn symlinked_home_component_cannot_redirect_log_mutations() {
        let home = unique_test_directory("component-symlink");
        let outside = unique_test_directory("component-symlink-outside");
        symlink(&outside, home.join("Library")).expect("create Library symlink");

        let (file, path) = create_log_file_for_home(Some(&home), 42);

        assert!(file.is_none());
        assert!(path.is_none());
        assert!(!outside.join("Logs").exists());

        fs::remove_dir_all(home).expect("remove test home");
        fs::remove_dir_all(outside).expect("remove outside directory");
    }

    #[cfg(unix)]
    #[test]
    fn log_directory_and_file_use_private_permissions() {
        let home = unique_test_directory("permissions");

        let (file, path) = create_log_file_for_home(Some(&home), 42);
        let path = path.expect("log path");
        let directory = path.parent().expect("log directory");

        assert!(file.is_some());
        assert_eq!(
            fs::metadata(directory)
                .expect("directory metadata")
                .permissions()
                .mode()
                & 0o777,
            0o700
        );
        assert_eq!(
            fs::metadata(&path)
                .expect("file metadata")
                .permissions()
                .mode()
                & 0o777,
            0o600
        );

        drop(file);
        fs::remove_dir_all(home).expect("remove test directory");
    }

    #[test]
    fn log_ceiling_writes_one_marker_and_suppresses_later_records() {
        let home = unique_test_directory("size-limit");
        let (file, path) = create_log_file_for_home(Some(&home), 42);
        let path = path.expect("log path");
        let max_file_bytes = 640;
        let process_started_at = Instant::now();
        let mut sink = SinkState {
            file,
            bytes_written: 0,
            records_suppressed: false,
            max_file_bytes,
        };

        for _ in 0..20 {
            let line = format_record(
                process_started_at,
                Record {
                    name: "repeated_diagnostic",
                    outcome: "success",
                    duration: None,
                    operation: None,
                    path: None,
                    size_bytes: None,
                    error: None,
                    raw_os_error: None,
                },
            );
            super::write_sink_line(&mut sink, TerminalSink::None, process_started_at, &line);
        }
        let suppressed_line = format_record(
            process_started_at,
            Record {
                name: "must_be_suppressed",
                outcome: "success",
                duration: None,
                operation: None,
                path: None,
                size_bytes: None,
                error: None,
                raw_os_error: None,
            },
        );
        super::write_sink_line(
            &mut sink,
            TerminalSink::None,
            process_started_at,
            &suppressed_line,
        );

        let contents = fs::read_to_string(&path).expect("read bounded log");
        assert!(contents.len() as u64 <= max_file_bytes);
        assert_eq!(contents.matches("verbose_log_limit_reached").count(), 1);
        assert!(!contents.contains("must_be_suppressed"));
        assert!(sink.records_suppressed);

        fs::remove_dir_all(home).expect("remove test directory");
    }

    #[test]
    fn limit_marker_reservation_covers_formatted_marker() {
        let marker = format_record(
            Instant::now(),
            Record {
                name: "verbose_log_limit_reached",
                outcome: "truncated",
                duration: None,
                operation: None,
                path: None,
                size_bytes: None,
                error: None,
                raw_os_error: None,
            },
        );

        assert!(marker.len() as u64 <= LIMIT_MARKER_RESERVED_BYTES);
    }

    #[test]
    fn retention_removes_only_expired_strict_matching_regular_files() {
        let home = unique_test_directory("retention");
        let directory = home.join("Library").join("Logs").join("chilla");
        fs::create_dir_all(&directory).expect("create log directory");
        let now = SystemTime::now();
        let old = now
            .checked_sub(VERBOSE_LOG_RETENTION + Duration::from_secs(1))
            .expect("old timestamp");

        let expired = directory.join("chilla-verbose-41.log");
        let expired_collision = directory.join("chilla-verbose-42-1.log");
        let fresh = directory.join("chilla-verbose-43.log");
        let malformed = directory.join("chilla-verbose-44-extra-part.log");
        let unrelated = directory.join("application.log");
        let matching_directory = directory.join("chilla-verbose-45.log");
        for path in [&expired, &expired_collision, &fresh, &malformed, &unrelated] {
            fs::write(path, "diagnostic").expect("create retention fixture");
        }
        fs::create_dir(&matching_directory).expect("create matching directory");
        set_modified(&expired, old);
        set_modified(&expired_collision, old);
        set_modified(&malformed, old);
        set_modified(&unrelated, old);

        cleanup_expired_logs(&directory, now);

        assert!(!expired.exists());
        assert!(!expired_collision.exists());
        assert!(fresh.exists());
        assert!(malformed.exists());
        assert!(unrelated.exists());
        assert!(matching_directory.is_dir());

        fs::remove_dir_all(home).expect("remove test directory");
    }

    #[test]
    fn retention_scan_obeys_entry_and_elapsed_bounds() {
        let home = unique_test_directory("retention-bounds");
        let directory = home.join("Library").join("Logs").join("chilla");
        fs::create_dir_all(&directory).expect("create log directory");
        let now = SystemTime::now();
        let old = now
            .checked_sub(VERBOSE_LOG_RETENTION + Duration::from_secs(1))
            .expect("old timestamp");
        for process_id in 1..=4 {
            let path = directory.join(format!("chilla-verbose-{process_id}.log"));
            fs::write(&path, "diagnostic").expect("create retention fixture");
            set_modified(&path, old);
        }

        let scanned = cleanup_expired_logs_bounded(&directory, now, 1, Duration::from_secs(1));
        assert_eq!(scanned, 1);
        assert_eq!(
            fs::read_dir(&directory)
                .expect("read retained entries")
                .count(),
            3
        );

        let scanned = cleanup_expired_logs_bounded(&directory, now, usize::MAX, Duration::ZERO);
        assert_eq!(scanned, 0);
        assert_eq!(
            fs::read_dir(&directory)
                .expect("read retained entries")
                .count(),
            3
        );

        fs::remove_dir_all(home).expect("remove test directory");
    }

    #[test]
    fn saturated_queue_is_non_blocking_and_writes_dropped_marker() {
        let home = unique_test_directory("queue-saturation");
        let directory = home.join("Library").join("Logs").join("chilla");
        let process_started_at = Instant::now();
        let dropped_records = Arc::new(AtomicU64::new(0));
        let (sender, receiver) = mpsc::sync_channel(1);
        sender
            .try_send(WriterMessage::Record("first record\n".to_string()))
            .expect("fill queue");

        let started_at = Instant::now();
        match sender.try_send(WriterMessage::Record("dropped record\n".to_string())) {
            Err(mpsc::TrySendError::Full(_)) => {
                dropped_records.fetch_add(1, Ordering::Relaxed);
            }
            _ => panic!("second record must encounter full queue"),
        }
        assert!(started_at.elapsed() < Duration::from_millis(50));

        let worker_dropped_records = Arc::clone(&dropped_records);
        let worker_directory = directory.clone();
        let worker = thread::spawn(move || {
            super::writer_loop(
                receiver,
                worker_dropped_records,
                WriterConfig {
                    directory: Some(worker_directory),
                    process_id: 42,
                    process_started_at,
                    terminal: TerminalSink::None,
                    max_file_bytes: super::VERBOSE_LOG_MAX_BYTES,
                },
            );
        });
        let (acknowledge, acknowledged) = mpsc::sync_channel(1);
        sender
            .send(WriterMessage::Shutdown(acknowledge))
            .expect("request writer shutdown");
        acknowledged
            .recv_timeout(Duration::from_secs(1))
            .expect("writer acknowledges shutdown");
        worker.join().expect("join writer");

        let contents =
            fs::read_to_string(directory.join("chilla-verbose-42.log")).expect("read log");
        assert!(contents.contains("event=\"verbose_log_records_dropped\""));
        assert!(contents.contains("dropped_records=1"));
        assert!(!contents.contains("size_bytes=1"));
        assert!(contents.contains("first record"));
        assert!(!contents.contains("dropped record"));

        fs::remove_dir_all(home).expect("remove test directory");
    }

    #[test]
    fn shutdown_wait_is_bounded_when_writer_cannot_receive() {
        let (sender, _receiver) = mpsc::sync_channel(1);
        sender
            .try_send(WriterMessage::Record("queued\n".to_string()))
            .expect("fill queue");
        let logger = super::VerboseLogger {
            process_started_at: Instant::now(),
            sender,
            dropped_records: Arc::new(AtomicU64::new(0)),
            frontend_ready_recorded: AtomicBool::new(false),
            startup_load: std::sync::Mutex::new(None),
        };

        let started_at = Instant::now();
        logger.shutdown(Duration::from_millis(10));

        assert!(started_at.elapsed() < Duration::from_millis(100));
    }

    #[test]
    fn retention_preserves_active_locked_log_until_handle_is_dropped() {
        let home = unique_test_directory("retention-active");
        let directory = home.join("Library").join("Logs").join("chilla");
        fs::create_dir_all(&directory).expect("create log directory");
        let path = directory.join("chilla-verbose-42.log");
        let active_file = super::open_private_log_file(&path).expect("create active log");
        let now = SystemTime::now();
        let old = now
            .checked_sub(VERBOSE_LOG_RETENTION + Duration::from_secs(1))
            .expect("old timestamp");
        active_file
            .set_times(FileTimes::new().set_modified(old))
            .expect("set active log timestamp");

        cleanup_expired_logs(&directory, now);
        assert!(path.exists());

        drop(active_file);
        cleanup_expired_logs(&directory, now);
        assert!(!path.exists());

        fs::remove_dir_all(home).expect("remove test directory");
    }

    #[cfg(unix)]
    #[test]
    fn retention_never_follows_or_removes_matching_symlinks() {
        let home = unique_test_directory("retention-symlink");
        let directory = home.join("Library").join("Logs").join("chilla");
        fs::create_dir_all(&directory).expect("create log directory");
        let victim = home.join("victim.log");
        fs::write(&victim, "must remain intact").expect("create symlink victim");
        let matching_symlink = directory.join("chilla-verbose-42.log");
        symlink(&victim, &matching_symlink).expect("create matching symlink");

        cleanup_expired_logs(
            &directory,
            SystemTime::now() + VERBOSE_LOG_RETENTION + Duration::from_secs(1),
        );

        assert!(fs::symlink_metadata(&matching_symlink)
            .expect("symlink metadata")
            .file_type()
            .is_symlink());
        assert_eq!(
            fs::read_to_string(victim).expect("read symlink victim"),
            "must remain intact"
        );

        fs::remove_dir_all(home).expect("remove test directory");
    }

    #[test]
    fn retention_filename_matching_is_strict() {
        for matching in [
            "chilla-verbose-0.log",
            "chilla-verbose-42.log",
            "chilla-verbose-4294967295-99.log",
        ] {
            assert!(is_verbose_log_name(matching.as_ref()), "{matching}");
        }
        for preserved in [
            "chilla-verbose-.log",
            "chilla-verbose-42-.log",
            "chilla-verbose--1.log",
            "chilla-verbose-4294967296.log",
            "chilla-verbose-42-1-extra.log",
            "chilla-verbose-42.txt",
            "other-chilla-verbose-42.log",
        ] {
            assert!(!is_verbose_log_name(preserved.as_ref()), "{preserved}");
        }
    }

    fn set_modified(path: &Path, modified: SystemTime) {
        OpenOptions::new()
            .write(true)
            .open(path)
            .expect("open retention fixture")
            .set_times(FileTimes::new().set_modified(modified))
            .expect("set retention fixture timestamp");
    }

    fn unique_test_directory(label: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        let directory = std::env::temp_dir().join(format!(
            "chilla-verbose-{label}-{}-{unique}",
            std::process::id()
        ));
        fs::create_dir(&directory).expect("create unique test home");
        directory
    }

    #[test]
    fn startup_load_path_selects_file_and_first_file_set_path() {
        let file_path = PathBuf::from("/tmp/selected.md");
        let file_target = StartupTarget::File(file_path.clone());
        assert_eq!(startup_load_path(&file_target), Some(file_path.as_path()));

        let first_path = PathBuf::from("/tmp/first.md");
        let file_set_target =
            StartupTarget::FileSet(vec![first_path.clone(), PathBuf::from("/tmp/second.md")]);
        assert_eq!(
            startup_load_path(&file_set_target),
            Some(first_path.as_path())
        );

        let directory_target = StartupTarget::Directory(PathBuf::from("/tmp"));
        assert_eq!(startup_load_path(&directory_target), None);
    }

    #[test]
    fn frontend_ready_marker_is_once_only() {
        let marker = AtomicBool::new(false);

        assert!(mark_once(&marker));
        assert!(!mark_once(&marker));
    }

    #[test]
    fn startup_load_marker_matches_exact_path_without_filesystem_resolution() {
        let path = PathBuf::from("/path/that/does/not/exist/removed.md");
        let startup_load = Some(StartupLoad { path: path.clone() });

        assert!(startup_load_matches(&startup_load, &path));
    }

    #[test]
    fn unrelated_startup_load_path_does_not_match_or_consume_marker() {
        let expected_path = PathBuf::from("/tmp/expected.md");
        let mut startup_load = Some(StartupLoad {
            path: expected_path.clone(),
        });

        assert!(!startup_load_matches(
            &startup_load,
            Path::new("/tmp/unrelated.md")
        ));
        assert!(!consume_startup_load(
            &mut startup_load,
            Path::new("/tmp/unrelated.md")
        ));
        assert!(startup_load_matches(&startup_load, &expected_path));
    }

    #[test]
    fn matching_startup_load_path_is_consumed_once() {
        let path = PathBuf::from("/tmp/startup.md");
        let mut startup_load = Some(StartupLoad { path: path.clone() });

        assert!(consume_startup_load(&mut startup_load, &path));
        assert!(!consume_startup_load(&mut startup_load, &path));
        assert!(!startup_load_matches(&startup_load, &path));
    }
}
