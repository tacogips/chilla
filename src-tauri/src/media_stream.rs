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

use crate::{
    error::{AppError, AppResult},
};

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
}

impl MediaStreamService {
    pub fn new() -> AppResult<Self> {
        let listener = TcpListener::bind((STREAM_HOST, 0))
            .map_err(|source| AppError::State(format!("failed to bind media stream server: {source}")))?;
        let port = listener
            .local_addr()
            .map_err(|source| AppError::State(format!("failed to inspect media stream server address: {source}")))?
            .port();
        let entries = Arc::new(RwLock::new(HashMap::new()));
        let thread_entries = Arc::clone(&entries);
        let token_seed: Arc<str> = Arc::from(new_token_seed());

        thread::Builder::new()
            .name("chilla-media-stream".to_string())
            .spawn(move || {
                run_media_stream_server(listener, thread_entries);
            })
            .map_err(|source| AppError::State(format!("failed to start media stream server thread: {source}")))?;

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
        let entry = MediaStreamEntry {
            path: canonical_path,
            mime_type: mime_type.to_string(),
        };

        self.entries
            .write()
            .map_err(|_| AppError::State("failed to lock media stream registry for write".to_string()))?
            .insert(token.clone(), entry);

        Ok(format!("http://{STREAM_HOST}:{}/media/{token}", self.port))
    }

    fn new_entry_token(&self, path: &Path) -> String {
        let counter = self.token_counter.fetch_add(1, Ordering::Relaxed);
        let input = format!(
            "{}:{}:{}",
            self.token_seed,
            path.display(),
            counter
        );
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
    mut stream: TcpStream,
    entries: Arc<RwLock<HashMap<String, MediaStreamEntry>>>,
) -> io::Result<()> {
    let mut reader = BufReader::new(stream.try_clone()?);
    let mut request_line = String::new();
    if reader.read_line(&mut request_line)? == 0 {
        return Ok(());
    }

    let request_line = request_line.trim_end();
    let mut request_parts = request_line.split_whitespace();
    let method = request_parts.next().unwrap_or_default();
    let target = request_parts.next().unwrap_or_default();

    let mut range_header: Option<String> = None;
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
            }
        }
    }

    if method != "GET" && method != "HEAD" {
        write_response(
            &mut stream,
            "405 Method Not Allowed",
            &[("Allow", "GET, HEAD"), ("Content-Length", "0")],
            None,
        )?;
        return Ok(());
    }

    let Some(token) = media_token_from_target(target) else {
        write_response(
            &mut stream,
            "404 Not Found",
            &[("Content-Length", "0")],
            None,
        )?;
        return Ok(());
    };

    let Some(entry) = entries
        .read()
        .ok()
        .and_then(|registry| registry.get(token).cloned())
    else {
        write_response(
            &mut stream,
            "404 Not Found",
            &[("Content-Length", "0")],
            None,
        )?;
        return Ok(());
    };

    serve_file(&mut stream, method == "HEAD", &entry, range_header.as_deref())
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
) -> io::Result<()> {
    let mut file = File::open(&entry.path)?;
    let metadata = file.metadata()?;
    let file_len = metadata.len();

    let (status, start, end) = match parse_range(range_header, file_len) {
        Ok(Some((start, end))) => ("206 Partial Content", start, end),
        Ok(None) => ("200 OK", 0, file_len.saturating_sub(1)),
        Err(()) => {
            let content_range = format!("bytes */{file_len}");
            write_response(
                stream,
                "416 Range Not Satisfiable",
                &[
                    ("Accept-Ranges", "bytes"),
                    ("Content-Range", &content_range),
                    ("Content-Length", "0"),
                ],
                None,
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
        write_response(stream, status, &header_refs, None)?;
        return Ok(());
    }

    file.seek(SeekFrom::Start(start))?;
    write_response_head(stream, status, &header_refs)?;
    copy_n_bytes(&mut file, stream, content_length)
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

fn write_response(
    stream: &mut TcpStream,
    status: &str,
    headers: &[(&str, &str)],
    body: Option<&[u8]>,
) -> io::Result<()> {
    write_response_head(stream, status, headers)?;
    if let Some(body) = body {
        stream.write_all(body)?;
    }
    stream.flush()
}

fn write_response_head(
    stream: &mut TcpStream,
    status: &str,
    headers: &[(&str, &str)],
) -> io::Result<()> {
    write!(stream, "HTTP/1.1 {status}\r\n")?;
    for (name, value) in headers {
        write!(stream, "{name}: {value}\r\n")?;
    }
    write!(stream, "Connection: close\r\n\r\n")
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
    use std::io::Cursor;

    use super::{copy_n_bytes, parse_range};

    #[test]
    fn parse_range_supports_open_and_suffix_ranges() {
        assert_eq!(parse_range(Some("bytes=0-99"), 200), Ok(Some((0, 99))));
        assert_eq!(parse_range(Some("bytes=100-"), 200), Ok(Some((100, 199))));
        assert_eq!(parse_range(Some("bytes=-50"), 200), Ok(Some((150, 199))));
    }

    #[test]
    fn parse_range_rejects_invalid_ranges() {
        assert_eq!(parse_range(Some("bytes=200-300"), 200), Err(()));
        assert_eq!(parse_range(Some("items=0-10"), 200), Err(()));
        assert_eq!(parse_range(Some("bytes=99-10"), 200), Err(()));
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
}
