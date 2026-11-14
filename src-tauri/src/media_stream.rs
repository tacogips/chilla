use crate::{
    error::{AppError, AppResult},
    mp4_faststart::{FaststartLayout, VirtualSegment},
};
use std::{
    collections::HashMap,
    fs::File,
    io::{self, Read, Seek, SeekFrom},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, AtomicUsize, Ordering},
        Arc, Mutex, RwLock,
    },
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::http::{header, Method, Request, Response, StatusCode, Uri};

const MAX_MEDIA_STREAM_ENTRIES: usize = 256;
const MAX_READ_JOBS: usize = 8;
const MAX_RESPONSE_BYTES: u64 = 2 * 1024 * 1024;
const MAX_LAYOUT_BYTES: usize = 16 * 1024 * 1024;

/// Application-local media registry. Construction never starts a network listener.
#[derive(Clone)]
pub struct MediaStreamService {
    entries: Arc<RwLock<HashMap<String, Arc<MediaStreamEntry>>>>,
    analyzer: Arc<Mutex<()>>,
    retained_bytes: Arc<AtomicUsize>,
    read_jobs: Arc<AtomicUsize>,
    token_seed: Arc<str>,
    token_counter: Arc<AtomicU64>,
}
struct MediaStreamEntry {
    path: PathBuf,
    mime_type: String,
    layout: Option<RetainedLayout>,
}
struct RetainedLayout {
    layout: FaststartLayout,
    bytes: usize,
    budget: Arc<AtomicUsize>,
}
impl Drop for RetainedLayout {
    fn drop(&mut self) {
        self.budget.fetch_sub(self.bytes, Ordering::AcqRel);
    }
}
struct ReadPermit(Arc<AtomicUsize>);
impl Drop for ReadPermit {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::AcqRel);
    }
}
impl Default for MediaStreamService {
    fn default() -> Self {
        Self::new()
    }
}
impl MediaStreamService {
    /// Create an infallible, socket-free media transport.
    pub fn new() -> Self {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_nanos();
        Self {
            entries: Arc::new(RwLock::new(HashMap::new())),
            analyzer: Arc::new(Mutex::new(())),
            retained_bytes: Arc::new(AtomicUsize::new(0)),
            read_jobs: Arc::new(AtomicUsize::new(0)),
            token_seed: Arc::from(format!("{}:{now}", std::process::id())),
            token_counter: Arc::new(AtomicU64::new(0)),
        }
    }
    /// Register on a blocking worker; pin the representation before publishing its token.
    pub fn register_media_stream(&self, path: &Path, mime_type: &str) -> AppResult<String> {
        let path = std::fs::canonicalize(path)
            .map_err(|source| AppError::io("canonicalize media stream path", path, source))?;
        // Keep this guard until the candidate is admitted/dropped, bounding concurrent analyzers.
        let _analysis_guard = self
            .analyzer
            .lock()
            .map_err(|_| AppError::State("media analysis lock unavailable".into()))?;
        let candidate = if should_prepare_faststart(&path, mime_type) {
            crate::mp4_faststart::analyze_mp4(&path)
        } else {
            None
        };
        let counter = self.token_counter.fetch_add(1, Ordering::Relaxed);
        let token =
            blake3::hash(format!("{}:{}:{counter}", self.token_seed, path.display()).as_bytes())
                .to_hex()
                .to_string();
        let mut registry = self
            .entries
            .write()
            .map_err(|_| AppError::State("media registry unavailable".into()))?;
        registry.retain(|_, entry| entry.path != path);
        while registry.len() >= MAX_MEDIA_STREAM_ENTRIES {
            if let Some(key) = registry.keys().next().cloned() {
                registry.remove(&key);
            } else {
                break;
            }
        }
        let layout = candidate.and_then(|layout| self.retain_layout(layout));
        registry.insert(
            token.clone(),
            Arc::new(MediaStreamEntry {
                path,
                mime_type: mime_type.into(),
                layout,
            }),
        );
        Ok(media_url(&token))
    }
    fn retain_layout(&self, layout: FaststartLayout) -> Option<RetainedLayout> {
        let metadata_bytes = layout
            .segments
            .capacity()
            .checked_mul(std::mem::size_of::<VirtualSegment>())?
            .checked_add(std::mem::size_of::<FaststartLayout>())?;
        let bytes = layout
            .segments
            .iter()
            .try_fold(metadata_bytes, |sum, segment| {
                sum.checked_add(match segment {
                    VirtualSegment::Memory { data, .. } => data.len(),
                    _ => 0,
                })
            })?;
        self.retained_bytes
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |used| {
                used.checked_add(bytes)
                    .filter(|total| *total <= MAX_LAYOUT_BYTES)
            })
            .ok()?;
        Some(RetainedLayout {
            layout,
            bytes,
            budget: Arc::clone(&self.retained_bytes),
        })
    }
    fn acquire_read(&self) -> Option<ReadPermit> {
        self.read_jobs
            .fetch_update(Ordering::AcqRel, Ordering::Acquire, |count| {
                (count < MAX_READ_JOBS).then_some(count + 1)
            })
            .ok()?;
        Some(ReadPermit(Arc::clone(&self.read_jobs)))
    }
    /// Admit before scheduling: rejected requests never fill the blocking task queue.
    pub fn dispatch(&self, request: Request<Vec<u8>>, responder: tauri::UriSchemeResponder) {
        let Some(permit) = self.acquire_read() else {
            responder.respond(empty_response(StatusCode::SERVICE_UNAVAILABLE));
            return;
        };
        let service = self.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let _permit = permit;
            responder.respond(service.handle_request(&request));
        });
    }
    fn handle_request(&self, request: &Request<Vec<u8>>) -> Response<Vec<u8>> {
        if request.method() != Method::GET && request.method() != Method::HEAD {
            let mut response = empty_response(StatusCode::METHOD_NOT_ALLOWED);
            response
                .headers_mut()
                .insert(header::ALLOW, header::HeaderValue::from_static("GET, HEAD"));
            return response;
        }
        let Some(token) = media_token(request.uri()) else {
            return empty_response(StatusCode::NOT_FOUND);
        };
        let entry = match self.entries.read() {
            Ok(registry) => registry.get(token).cloned(),
            Err(_) => return empty_response(StatusCode::INTERNAL_SERVER_ERROR),
        };
        let Some(entry) = entry else {
            return empty_response(StatusCode::NOT_FOUND);
        };
        match serve_entry(&entry, request) {
            Ok(response) => response,
            Err(error) => empty_response(if error.kind() == io::ErrorKind::NotFound {
                StatusCode::NOT_FOUND
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            }),
        }
    }
}
fn media_url(token: &str) -> String {
    browser_media_url(
        token,
        cfg!(any(target_os = "windows", target_os = "android")),
    )
}
fn browser_media_url(token: &str, mapped: bool) -> String {
    if mapped {
        format!("http://chilla-media.localhost/media/{token}")
    } else {
        format!("chilla-media://localhost/media/{token}")
    }
}
fn media_token(uri: &Uri) -> Option<&str> {
    // Wry normalizes Windows/Android's mapped browser URLs before invoking Rust.
    if uri.scheme_str()? != "chilla-media"
        || uri.authority()?.as_str() != "localhost"
        || uri.query().is_some()
    {
        return None;
    }
    let token = uri.path().strip_prefix("/media/")?;
    (token.len() == 64
        && token
            .bytes()
            .all(|byte| byte.is_ascii_digit() || (b'a'..=b'f').contains(&byte)))
    .then_some(token)
}
fn should_prepare_faststart(path: &Path, mime_type: &str) -> bool {
    mime_type.starts_with("video/")
        && path
            .extension()
            .and_then(|extension| extension.to_str())
            .is_some_and(|extension| {
                matches!(
                    extension.to_ascii_lowercase().as_str(),
                    "mp4" | "m4v" | "mov"
                )
            })
}
fn empty_response(status: StatusCode) -> Response<Vec<u8>> {
    let mut response = Response::new(Vec::new());
    *response.status_mut() = status;
    response.headers_mut().insert(
        header::CONTENT_LENGTH,
        header::HeaderValue::from_static("0"),
    );
    response
}
fn serve_entry(
    entry: &MediaStreamEntry,
    request: &Request<Vec<u8>>,
) -> io::Result<Response<Vec<u8>>> {
    let mut file = File::open(&entry.path)?;
    let source_len = file.metadata()?.len();
    let file_len = entry
        .layout
        .as_ref()
        .map_or(source_len, |value| value.layout.total_size);
    let range_values = request.headers().get_all(header::RANGE);
    let mut values = range_values.iter();
    let raw_range = values.next();
    let range = if request.method() == Method::HEAD {
        Ok(None)
    } else if values.next().is_some() {
        Err(())
    } else {
        raw_range
            .map(|value| value.to_str().map_err(|_| ()))
            .transpose()
            .and_then(|value| parse_range(value, file_len))
    };
    let range = match range {
        Ok(range) => range,
        Err(()) => {
            let mut response = empty_response(StatusCode::RANGE_NOT_SATISFIABLE);
            insert_header(
                &mut response,
                header::CONTENT_RANGE,
                &format!("bytes */{file_len}"),
            )?;
            insert_header(&mut response, header::ACCEPT_RANGES, "bytes")?;
            return Ok(response);
        }
    };
    let is_head = request.method() == Method::HEAD;
    let (start, length, status) = match range {
        Some((start, end)) => (
            start,
            (end - start + 1).min(MAX_RESPONSE_BYTES),
            StatusCode::PARTIAL_CONTENT,
        ),
        None if !is_head && file_len > MAX_RESPONSE_BYTES => {
            return Ok(empty_response(StatusCode::PAYLOAD_TOO_LARGE))
        }
        None => (0, file_len, StatusCode::OK),
    };
    let body = if is_head || length == 0 {
        Vec::new()
    } else {
        match &entry.layout {
            Some(value) => read_virtual(&mut file, &value.layout, start, length)?,
            None => {
                file.seek(SeekFrom::Start(start))?;
                let mut body = vec![0; length as usize];
                file.read_exact(&mut body)?;
                body
            }
        }
    };
    let mut response = Response::new(body);
    *response.status_mut() = status;
    insert_header(&mut response, header::CONTENT_TYPE, &entry.mime_type)?;
    insert_header(&mut response, header::CONTENT_LENGTH, &length.to_string())?;
    insert_header(&mut response, header::ACCEPT_RANGES, "bytes")?;
    insert_header(&mut response, header::CACHE_CONTROL, "no-store")?;
    if range.is_some() {
        insert_header(
            &mut response,
            header::CONTENT_RANGE,
            &format!("bytes {start}-{}/{file_len}", start + length - 1),
        )?;
    }
    Ok(response)
}
fn insert_header(
    response: &mut Response<Vec<u8>>,
    name: header::HeaderName,
    value: &str,
) -> io::Result<()> {
    response.headers_mut().insert(
        name,
        header::HeaderValue::from_str(value).map_err(io::Error::other)?,
    );
    Ok(())
}
fn read_virtual(
    file: &mut File,
    layout: &FaststartLayout,
    start: u64,
    length: u64,
) -> io::Result<Vec<u8>> {
    let invalid = || {
        io::Error::new(
            io::ErrorKind::UnexpectedEof,
            "incomplete media representation",
        )
    };
    let end = start.checked_add(length).ok_or_else(invalid)?;
    let mut result = Vec::with_capacity(length as usize);
    let mut segment_start = 0u64;
    for segment in &layout.segments {
        let segment_len = match segment {
            VirtualSegment::File { length, .. } | VirtualSegment::Memory { length, .. } => *length,
        };
        let segment_end = segment_start.checked_add(segment_len).ok_or_else(invalid)?;
        let overlap_start = start.max(segment_start);
        let overlap_end = end.min(segment_end);
        if overlap_start < overlap_end {
            let offset = overlap_start - segment_start;
            let count = usize::try_from(overlap_end - overlap_start).map_err(|_| invalid())?;
            match segment {
                VirtualSegment::File { file_offset, .. } => {
                    file.seek(SeekFrom::Start(
                        file_offset.checked_add(offset).ok_or_else(invalid)?,
                    ))?;
                    let previous = result.len();
                    result.resize(previous + count, 0);
                    file.read_exact(&mut result[previous..])?;
                }
                VirtualSegment::Memory { data, .. } => {
                    let offset = usize::try_from(offset).map_err(|_| invalid())?;
                    let slice = data
                        .get(offset..offset.checked_add(count).ok_or_else(invalid)?)
                        .ok_or_else(invalid)?;
                    result.extend_from_slice(slice);
                }
            }
        }
        segment_start = segment_end;
        if segment_start >= end {
            break;
        }
    }
    if result.len() as u64 != length {
        return Err(invalid());
    }
    Ok(result)
}
fn parse_range(header: Option<&str>, length: u64) -> Result<Option<(u64, u64)>, ()> {
    let Some(value) = header else {
        return Ok(None);
    };
    if length == 0 {
        return Err(());
    }
    let spec = value.strip_prefix("bytes=").ok_or(())?;
    let (first, last) = spec.split_once('-').ok_or(())?;
    let decimal = |value: &str| -> Result<u64, ()> {
        if value.is_empty() || !value.bytes().all(|byte| byte.is_ascii_digit()) {
            return Err(());
        }
        value.parse().map_err(|_| ())
    };
    if first.is_empty() {
        let suffix = decimal(last)?;
        return if suffix == 0 {
            Err(())
        } else {
            Ok(Some((length.saturating_sub(suffix), length - 1)))
        };
    }
    let start = decimal(first)?;
    let end = if last.is_empty() {
        length - 1
    } else {
        decimal(last)?.min(length - 1)
    };
    if start >= length || end < start {
        return Err(());
    }
    Ok(Some((start, end)))
}
#[cfg(test)]
mod tests;
