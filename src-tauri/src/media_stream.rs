use std::{
    collections::HashMap,
    fs::File,
    io::{self, BufRead, BufReader, Read, Seek, SeekFrom, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, RwLock,
    },
    thread,
    time::{SystemTime, UNIX_EPOCH},
};

use crate::error::{AppError, AppResult};
use crate::mp4_faststart::{FaststartLayout, VirtualSegment};

const STREAM_HOST: &str = "127.0.0.1";
const CORS_ALLOW_ORIGIN: &str = "*";

#[derive(Clone)]
pub struct MediaStreamService {
    port: u16,
    entries: Arc<RwLock<HashMap<String, MediaStreamEntry>>>,
    token_seed: Arc<str>,
    token_counter: Arc<AtomicU64>,
}

#[derive(Clone)]
struct MediaStreamEntry {
    path: PathBuf,
    mime_type: String,
    faststart: Arc<RwLock<FaststartStatus>>,
}

#[derive(Clone)]
enum FaststartStatus {
    Unsupported,
    Pending,
    Ready(Arc<FaststartLayout>),
    Unavailable,
}

impl MediaStreamService {
    pub fn new() -> AppResult<Self> {
        let listener = TcpListener::bind((STREAM_HOST, 0)).map_err(|source| {
            AppError::State(format!("failed to bind media stream server: {source}"))
        })?;
        let port = listener
            .local_addr()
            .map_err(|source| {
                AppError::State(format!(
                    "failed to inspect media stream server address: {source}"
                ))
            })?
            .port();
        let entries = Arc::new(RwLock::new(HashMap::new()));
        let thread_entries = Arc::clone(&entries);
        let token_seed: Arc<str> = Arc::from(new_token_seed());

        thread::Builder::new()
            .name("chilla-media-stream".to_string())
            .spawn(move || {
                run_media_stream_server(listener, thread_entries);
            })
            .map_err(|source| {
                AppError::State(format!(
                    "failed to start media stream server thread: {source}"
                ))
            })?;

        Ok(Self {
            port,
            entries,
            token_seed,
            token_counter: Arc::new(AtomicU64::new(0)),
        })
    }

    pub fn register_media_stream(&self, path: &Path, mime_type: &str) -> AppResult<String> {
        let canonical_path = std::fs::canonicalize(path)
            .map_err(|source| AppError::io("canonicalize media stream path", path, source))?;
        let token = self.new_entry_token(&canonical_path);
        let canonical_path_display = canonical_path.display().to_string();
        let faststart = prepare_faststart_state(canonical_path.clone(), mime_type);

        let entry = MediaStreamEntry {
            path: canonical_path,
            mime_type: mime_type.to_string(),
            faststart,
        };

        self.entries
            .write()
            .map_err(|_| {
                AppError::State("failed to lock media stream registry for write".to_string())
            })?
            .insert(token.clone(), entry);

        eprintln!(
            "[media-stream] register path={} mime_type={} token={} url=http://{STREAM_HOST}:{}/media/{token}",
            canonical_path_display,
            mime_type,
            token,
            self.port
        );

        Ok(format!("http://{STREAM_HOST}:{}/media/{token}", self.port))
    }

    fn new_entry_token(&self, path: &Path) -> String {
        let counter = self.token_counter.fetch_add(1, Ordering::Relaxed);
        let input = format!("{}:{}:{}", self.token_seed, path.display(), counter);
        blake3::hash(input.as_bytes()).to_hex().to_string()
    }
}

fn new_token_seed() -> String {
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_nanos();
    format!("{}:{now}", std::process::id())
}

fn prepare_faststart_state(path: PathBuf, mime_type: &str) -> Arc<RwLock<FaststartStatus>> {
    let should_analyze = should_prepare_faststart(&path, mime_type);
    let initial_status = if should_analyze {
        FaststartStatus::Pending
    } else {
        FaststartStatus::Unsupported
    };
    let status = Arc::new(RwLock::new(initial_status));

    if !should_analyze {
        return status;
    }

    let analysis_status = Arc::clone(&status);
    let path_for_thread = path.clone();
    if thread::Builder::new()
        .name("chilla-media-faststart".to_string())
        .spawn(move || {
            let next_status = match crate::mp4_faststart::analyze_mp4(&path_for_thread) {
                Some(layout) => {
                    eprintln!(
                        "[media-stream] faststart layout ready for path={}",
                        path_for_thread.display()
                    );
                    FaststartStatus::Ready(Arc::new(layout))
                }
                None => FaststartStatus::Unavailable,
            };

            if let Ok(mut guard) = analysis_status.write() {
                *guard = next_status;
            }
        })
        .is_err()
    {
        if let Ok(mut guard) = status.write() {
            *guard = FaststartStatus::Unavailable;
        }
    }

    status
}

fn should_prepare_faststart(path: &Path, mime_type: &str) -> bool {
    if !mime_type.starts_with("video/") {
        return false;
    }

    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| {
            matches!(
                extension.to_ascii_lowercase().as_str(),
                "mp4" | "m4v" | "mov"
            )
        })
        .unwrap_or(false)
}

fn ready_faststart_layout(entry: &MediaStreamEntry) -> Option<Arc<FaststartLayout>> {
    entry
        .faststart
        .read()
        .ok()
        .and_then(|status| match &*status {
            FaststartStatus::Ready(layout) => Some(Arc::clone(layout)),
            FaststartStatus::Unsupported
            | FaststartStatus::Pending
            | FaststartStatus::Unavailable => None,
        })
}

fn run_media_stream_server(
    listener: TcpListener,
    entries: Arc<RwLock<HashMap<String, MediaStreamEntry>>>,
) {
    for connection in listener.incoming() {
        let Ok(stream) = connection else {
            continue;
        };
        let entries = Arc::clone(&entries);
        let _ = thread::Builder::new()
            .name("chilla-media-stream-client".to_string())
            .spawn(move || {
                let _ = handle_connection(stream, entries);
            });
    }
}

fn handle_connection(
    stream: TcpStream,
    entries: Arc<RwLock<HashMap<String, MediaStreamEntry>>>,
) -> io::Result<()> {
    stream.set_read_timeout(Some(std::time::Duration::from_secs(30)))?;
    let mut writer = stream.try_clone()?;
    let mut reader = BufReader::new(stream);

    loop {
        let mut request_line = String::new();
        match reader.read_line(&mut request_line) {
            Ok(0) => return Ok(()), // EOF: client closed connection
            Err(e)
                if e.kind() == io::ErrorKind::TimedOut || e.kind() == io::ErrorKind::WouldBlock =>
            {
                return Ok(()); // idle timeout
            }
            Err(e) => return Err(e),
            Ok(_) => {}
        }

        let request_line_trimmed = request_line.trim_end().to_string();
        let mut request_parts = request_line_trimmed.split_whitespace();
        let method = request_parts.next().unwrap_or_default().to_string();
        let target = request_parts.next().unwrap_or_default().to_string();

        let mut range_header: Option<String> = None;
        let mut connection_close = false;
        loop {
            let mut line = String::new();
            if reader.read_line(&mut line)? == 0 {
                break;
            }
            let trimmed = line.trim_end();
            if trimmed.is_empty() {
                break;
            }
            if let Some((name, value)) = trimmed.split_once(':') {
                if name.eq_ignore_ascii_case("range") {
                    range_header = Some(value.trim().to_string());
                } else if name.eq_ignore_ascii_case("connection")
                    && value.trim().eq_ignore_ascii_case("close")
                {
                    connection_close = true;
                }
            }
        }

        let keep_alive = !connection_close;

        eprintln!(
            "[media-stream] request method={} target={} range={} keep_alive={}",
            method,
            target,
            range_header.as_deref().unwrap_or("-"),
            keep_alive
        );

        if method != "GET" && method != "HEAD" {
            write_logged_empty_response(
                &mut writer,
                "405 Method Not Allowed",
                &target,
                &[("method", &method), ("target", &target)],
                &[("Allow", "GET, HEAD"), ("Content-Length", "0")],
                false,
            )?;
            return Ok(());
        }

        let Some(token) = media_token_from_target(&target) else {
            write_logged_empty_response(
                &mut writer,
                "404 Not Found",
                &target,
                &[("method", &method), ("target", &target)],
                &[("Content-Length", "0")],
                false,
            )?;
            return Ok(());
        };

        let Some(entry) = entries
            .read()
            .ok()
            .and_then(|registry| registry.get(token).cloned())
        else {
            write_logged_empty_response(
                &mut writer,
                "404 Not Found",
                &target,
                &[("method", &method), ("token", token)],
                &[("Content-Length", "0")],
                false,
            )?;
            return Ok(());
        };

        serve_file(
            &mut writer,
            method == "HEAD",
            &entry,
            range_header.as_deref(),
            keep_alive,
        )?;

        if !keep_alive {
            return Ok(());
        }
    }
}

fn media_token_from_target(target: &str) -> Option<&str> {
    let path = target.split('?').next()?;
    path.strip_prefix("/media/")
        .filter(|value| !value.is_empty())
}

fn serve_file(
    stream: &mut TcpStream,
    is_head: bool,
    entry: &MediaStreamEntry,
    range_header: Option<&str>,
    keep_alive: bool,
) -> io::Result<()> {
    if let Some(layout) = ready_faststart_layout(entry) {
        return serve_virtual_file(stream, is_head, entry, &layout, range_header, keep_alive);
    }

    let mut file = File::open(&entry.path)?;
    let metadata = file.metadata()?;
    let file_len = metadata.len();

    let (status, start, end) = match parse_range(range_header, file_len) {
        Ok(Some((start, end))) => ("206 Partial Content", start, end),
        Ok(None) => ("200 OK", 0, file_len.saturating_sub(1)),
        Err(()) => {
            let content_range = format!("bytes */{file_len}");
            write_logged_empty_response(
                stream,
                "416 Range Not Satisfiable",
                &entry.path.display().to_string(),
                &[("range", range_header.unwrap_or("-"))],
                &[
                    ("Accept-Ranges", "bytes"),
                    ("Content-Range", &content_range),
                    ("Content-Length", "0"),
                ],
                false,
            )?;
            return Ok(());
        }
    };

    let content_length = if file_len == 0 { 0 } else { end - start + 1 };
    let content_length_header = content_length.to_string();
    let content_range_header = if status == "206 Partial Content" {
        Some(format!("bytes {start}-{end}/{file_len}"))
    } else {
        None
    };

    let mut headers = vec![
        ("Accept-Ranges", "bytes".to_string()),
        ("Access-Control-Allow-Origin", CORS_ALLOW_ORIGIN.to_string()),
        ("Content-Type", entry.mime_type.clone()),
        ("Content-Length", content_length_header),
    ];

    if let Some(content_range_header) = content_range_header {
        headers.push(("Content-Range", content_range_header));
    }

    let header_refs = headers
        .iter()
        .map(|(name, value)| (*name, value.as_str()))
        .collect::<Vec<_>>();

    if is_head || content_length == 0 {
        eprintln!(
            "[media-stream] response status={} path={} range={} head={}",
            status,
            entry.path.display(),
            range_header.unwrap_or("-"),
            is_head
        );
        write_response(stream, status, &header_refs, None, keep_alive)?;
        return Ok(());
    }

    file.seek(SeekFrom::Start(start))?;
    eprintln!(
        "[media-stream] response status={} path={} range={} head={} bytes={}-{}",
        status,
        entry.path.display(),
        range_header.unwrap_or("-"),
        is_head,
        start,
        end
    );
    write_response_head(stream, status, &header_refs, keep_alive)?;
    copy_n_bytes(&mut file, stream, content_length)
}

/// Serve an MP4 file using a virtual faststart layout.
///
/// This function handles range requests over the virtual byte stream described by
/// `layout`, composing responses from a mix of in-memory moov data and on-disk
/// file regions without ever loading the full file into memory.
fn serve_virtual_file(
    stream: &mut TcpStream,
    is_head: bool,
    entry: &MediaStreamEntry,
    layout: &FaststartLayout,
    range_header: Option<&str>,
    keep_alive: bool,
) -> io::Result<()> {
    let file_len = layout.total_size;

    let (status, start, end) = match parse_range(range_header, file_len) {
        Ok(Some((s, e))) => ("206 Partial Content", s, e),
        Ok(None) => ("200 OK", 0, file_len.saturating_sub(1)),
        Err(()) => {
            let content_range = format!("bytes */{file_len}");
            write_logged_empty_response(
                stream,
                "416 Range Not Satisfiable",
                &entry.path.display().to_string(),
                &[("range", range_header.unwrap_or("-"))],
                &[
                    ("Accept-Ranges", "bytes"),
                    ("Content-Range", &content_range),
                    ("Content-Length", "0"),
                ],
                false,
            )?;
            return Ok(());
        }
    };

    let content_length = if file_len == 0 { 0 } else { end - start + 1 };
    let content_length_header = content_length.to_string();
    let content_range_header = if status == "206 Partial Content" {
        Some(format!("bytes {start}-{end}/{file_len}"))
    } else {
        None
    };

    let mut headers = vec![
        ("Accept-Ranges", "bytes".to_string()),
        ("Access-Control-Allow-Origin", CORS_ALLOW_ORIGIN.to_string()),
        ("Content-Type", entry.mime_type.clone()),
        ("Content-Length", content_length_header),
    ];

    if let Some(cr) = content_range_header {
        headers.push(("Content-Range", cr));
    }

    let header_refs = headers
        .iter()
        .map(|(name, value)| (*name, value.as_str()))
        .collect::<Vec<_>>();

    if is_head || content_length == 0 {
        eprintln!(
            "[media-stream] response status={} path={} range={} head={} (virtual faststart)",
            status,
            entry.path.display(),
            range_header.unwrap_or("-"),
            is_head
        );
        write_response(stream, status, &header_refs, None, keep_alive)?;
        return Ok(());
    }

    eprintln!(
        "[media-stream] response status={} path={} range={} head={} bytes={}-{} (virtual faststart)",
        status,
        entry.path.display(),
        range_header.unwrap_or("-"),
        is_head,
        start,
        end
    );

    write_response_head(stream, status, &header_refs, keep_alive)?;

    // Walk segments and write the bytes that overlap [start, end].
    let mut seg_start: u64 = 0; // virtual offset of the first byte in this segment
    for segment in &layout.segments {
        let seg_len = match segment {
            VirtualSegment::File { length, .. } => *length,
            VirtualSegment::Memory { length, .. } => *length,
        };
        let seg_end = seg_start + seg_len; // exclusive

        // Does this segment overlap the requested range?
        let overlap_start = start.max(seg_start);
        let overlap_end = (end + 1).min(seg_end); // exclusive

        if overlap_start < overlap_end {
            let overlap_len = overlap_end - overlap_start;
            let offset_within_seg = overlap_start - seg_start;

            match segment {
                VirtualSegment::File { file_offset, .. } => {
                    let mut file = File::open(&entry.path)?;
                    file.seek(SeekFrom::Start(file_offset + offset_within_seg))?;
                    copy_n_bytes(&mut file, stream, overlap_len)?;
                }
                VirtualSegment::Memory { data, .. } => {
                    let slice_start = offset_within_seg as usize;
                    let slice_end = (offset_within_seg + overlap_len) as usize;
                    stream.write_all(&data[slice_start..slice_end])?;
                }
            }
        }

        seg_start = seg_end;
        if seg_start > end {
            break;
        }
    }

    stream.flush()
}

fn parse_range(range_header: Option<&str>, file_len: u64) -> Result<Option<(u64, u64)>, ()> {
    let Some(range_header) = range_header else {
        return Ok(None);
    };

    if file_len == 0 {
        return Err(());
    }

    let value = range_header.trim();
    let Some(range_spec) = value.strip_prefix("bytes=") else {
        return Err(());
    };
    let Some((start_part, end_part)) = range_spec.split_once('-') else {
        return Err(());
    };

    if start_part.is_empty() {
        let suffix_len = end_part.parse::<u64>().map_err(|_| ())?;
        if suffix_len == 0 {
            return Err(());
        }
        let start = file_len.saturating_sub(suffix_len);
        return Ok(Some((start, file_len - 1)));
    }

    let start = start_part.parse::<u64>().map_err(|_| ())?;
    if start >= file_len {
        return Err(());
    }

    let end = if end_part.is_empty() {
        file_len - 1
    } else {
        let parsed_end = end_part.parse::<u64>().map_err(|_| ())?;
        parsed_end.min(file_len - 1)
    };

    if end < start {
        return Err(());
    }

    Ok(Some((start, end)))
}

fn write_logged_empty_response(
    stream: &mut TcpStream,
    status: &str,
    path: &str,
    details: &[(&str, &str)],
    headers: &[(&str, &str)],
    keep_alive: bool,
) -> io::Result<()> {
    let mut detail_parts = String::new();

    for (index, (name, value)) in details.iter().enumerate() {
        if index > 0 {
            detail_parts.push(' ');
        }
        detail_parts.push_str(name);
        detail_parts.push('=');
        detail_parts.push_str(value);
    }

    eprintln!(
        "[media-stream] response status={} path={} {}",
        status, path, detail_parts
    );

    write_response(stream, status, headers, None, keep_alive)
}

fn write_response(
    stream: &mut TcpStream,
    status: &str,
    headers: &[(&str, &str)],
    body: Option<&[u8]>,
    keep_alive: bool,
) -> io::Result<()> {
    write_response_head(stream, status, headers, keep_alive)?;
    if let Some(body) = body {
        stream.write_all(body)?;
    }
    stream.flush()
}

fn write_response_head(
    stream: &mut TcpStream,
    status: &str,
    headers: &[(&str, &str)],
    keep_alive: bool,
) -> io::Result<()> {
    write!(stream, "HTTP/1.1 {status}\r\n")?;
    for (name, value) in headers {
        write!(stream, "{name}: {value}\r\n")?;
    }
    if keep_alive {
        write!(stream, "Connection: keep-alive\r\n\r\n")
    } else {
        write!(stream, "Connection: close\r\n\r\n")
    }
}

fn copy_n_bytes<R: Read, W: Write>(reader: &mut R, writer: &mut W, len: u64) -> io::Result<()> {
    const COPY_BUFFER_LEN: usize = 64 * 1024;

    let mut remaining = len;
    let mut buffer = [0_u8; COPY_BUFFER_LEN];

    while remaining > 0 {
        let bytes_to_read = remaining.min(COPY_BUFFER_LEN as u64) as usize;
        let read_len = reader.read(&mut buffer[..bytes_to_read])?;

        if read_len == 0 {
            return Err(io::Error::new(
                io::ErrorKind::UnexpectedEof,
                "media stream source ended before the declared content length",
            ));
        }

        writer.write_all(&buffer[..read_len])?;
        remaining -= read_len as u64;
    }

    writer.flush()
}

#[cfg(test)]
mod tests {
    use std::{
        io::Cursor,
        path::Path,
        sync::{Arc, RwLock},
    };

    use super::{
        copy_n_bytes, parse_range, ready_faststart_layout, should_prepare_faststart,
        FaststartStatus,
    };

    #[test]
    fn parse_range_supports_open_and_suffix_ranges() {
        assert_eq!(parse_range(Some("bytes=0-99"), 200), Ok(Some((0, 99))));
        assert_eq!(parse_range(Some("bytes=100-"), 200), Ok(Some((100, 199))));
        assert_eq!(parse_range(Some("bytes=-50"), 200), Ok(Some((150, 199))));
        assert_eq!(parse_range(Some("bytes=-999"), 200), Ok(Some((0, 199))));
    }

    #[test]
    fn parse_range_rejects_invalid_ranges() {
        assert_eq!(parse_range(Some("bytes=200-300"), 200), Err(()));
        assert_eq!(parse_range(Some("items=0-10"), 200), Err(()));
        assert_eq!(parse_range(Some("bytes=99-10"), 200), Err(()));
        assert_eq!(parse_range(Some("bytes=0-0"), 0), Err(()));
    }

    #[test]
    fn copy_n_bytes_streams_large_payloads_without_truncation() {
        let source = (0..150_000)
            .map(|value| (value % 251) as u8)
            .collect::<Vec<_>>();
        let mut reader = Cursor::new(source.clone());
        let mut writer = Vec::new();

        copy_n_bytes(&mut reader, &mut writer, source.len() as u64).unwrap();

        assert_eq!(writer, source);
    }

    #[test]
    fn should_prepare_faststart_only_for_mp4_family_videos() {
        assert!(should_prepare_faststart(
            Path::new("/tmp/demo.MP4"),
            "video/mp4"
        ));
        assert!(should_prepare_faststart(
            Path::new("/tmp/demo.mov"),
            "video/quicktime"
        ));
        assert!(!should_prepare_faststart(
            Path::new("/tmp/demo.webm"),
            "video/webm"
        ));
        assert!(!should_prepare_faststart(
            Path::new("/tmp/demo.mp4"),
            "audio/mp4"
        ));
    }

    #[test]
    fn ready_faststart_layout_is_absent_until_background_analysis_finishes() {
        let entry = super::MediaStreamEntry {
            path: Path::new("/tmp/demo.mp4").to_path_buf(),
            mime_type: "video/mp4".to_string(),
            faststart: Arc::new(RwLock::new(FaststartStatus::Pending)),
        };

        assert!(ready_faststart_layout(&entry).is_none());
    }
}
