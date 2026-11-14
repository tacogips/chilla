use super::*;
use std::{fs, thread};
struct Fixture(PathBuf);
impl Fixture {
    fn new(bytes: &[u8]) -> Self {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let path = std::env::temp_dir().join(format!(
            "chilla-protocol-{}-{}.mp4",
            std::process::id(),
            NEXT.fetch_add(1, Ordering::Relaxed)
        ));
        fs::write(&path, bytes).expect("fixture");
        Self(path)
    }
}
impl Drop for Fixture {
    fn drop(&mut self) {
        let _ = fs::remove_file(&self.0);
    }
}
fn request(url: &str, method: Method, range: Option<&str>) -> Request<Vec<u8>> {
    let normalized = url.replace(
        "http://chilla-media.localhost/",
        "chilla-media://localhost/",
    );
    let mut builder = Request::builder().uri(normalized).method(method);
    if let Some(range) = range {
        builder = builder.header(header::RANGE, range);
    }
    builder.body(Vec::new()).expect("request")
}
#[test]
fn ranges_support_closed_open_suffix_and_reject_bad_values() {
    for (raw, expected) in [
        ("bytes=0-99", (0, 99)),
        ("bytes=100-", (100, 199)),
        ("bytes=-50", (150, 199)),
        ("bytes=-999", (0, 199)),
        ("bytes=0-999", (0, 199)),
    ] {
        assert_eq!(parse_range(Some(raw), 200), Ok(Some(expected)));
    }
    for raw in [
        "bytes=200-",
        "bytes=99-10",
        "bytes=-0",
        "bytes=0-0,2-3",
        "items=0-1",
        "bytes=+1-2",
        "bytes=1-2 ",
        "bytes=18446744073709551616-",
    ] {
        assert_eq!(parse_range(Some(raw), 200), Err(()), "{raw}");
    }
    assert_eq!(parse_range(Some("bytes=0-0"), 0), Err(()));
    assert_eq!(parse_range(None, 0), Ok(None));
}
#[test]
fn token_urls_are_exact_and_cannot_select_paths() {
    let token = "a".repeat(64);
    let url = browser_media_url(&token, false);
    assert_eq!(
        media_token(&url.parse::<Uri>().unwrap()),
        Some(token.as_str())
    );
    for invalid in [
        format!("{url}?x=y"),
        url.replace("localhost", "localhost:1"),
        url.replace("localhost", "evil.localhost"),
        url.replace("/media/", "/media/../"),
        format!("{url}/more"),
        media_url("short"),
        media_url(&"A".repeat(64)),
        url.replace("localhost", "user@localhost"),
    ] {
        assert!(
            media_token(&invalid.parse::<Uri>().unwrap()).is_none(),
            "{invalid}"
        );
    }
}
#[test]
fn registered_media_returns_metadata_ranges_and_method_errors() {
    let file = Fixture::new(b"0123456789");
    let service = MediaStreamService::new();
    let url = service
        .register_media_stream(&file.0, "audio/mpeg")
        .unwrap();
    let full = service.handle_request(&request(&url, Method::GET, None));
    assert_eq!(full.status(), StatusCode::OK);
    assert_eq!(full.body(), b"0123456789");
    assert_eq!(full.headers()[header::CONTENT_TYPE], "audio/mpeg");
    assert!(!full
        .headers()
        .contains_key(header::ACCESS_CONTROL_ALLOW_ORIGIN));
    for (range, body, content_range) in [
        ("bytes=2-5", &b"2345"[..], "bytes 2-5/10"),
        ("bytes=7-", &b"789"[..], "bytes 7-9/10"),
        ("bytes=-3", &b"789"[..], "bytes 7-9/10"),
    ] {
        let response = service.handle_request(&request(&url, Method::GET, Some(range)));
        assert_eq!(response.status(), StatusCode::PARTIAL_CONTENT);
        assert_eq!(response.body(), body);
        assert_eq!(response.headers()[header::CONTENT_RANGE], content_range);
        assert_eq!(
            response.headers()[header::CONTENT_LENGTH],
            body.len().to_string()
        );
    }
    let head = service.handle_request(&request(&url, Method::HEAD, None));
    assert!(head.body().is_empty());
    assert_eq!(head.headers()[header::CONTENT_LENGTH], "10");
    for range in ["bytes=3-5", "bytes=999-", "malformed"] {
        let head = service.handle_request(&request(&url, Method::HEAD, Some(range)));
        assert_eq!(head.status(), StatusCode::OK);
        assert!(head.body().is_empty());
        assert_eq!(head.headers()[header::CONTENT_LENGTH], "10");
        assert!(!head.headers().contains_key(header::CONTENT_RANGE));
    }
    let bad = service.handle_request(&request(&url, Method::GET, Some("bytes=10-")));
    assert_eq!(bad.status(), StatusCode::RANGE_NOT_SATISFIABLE);
    assert_eq!(bad.headers()[header::CONTENT_RANGE], "bytes */10");
    let post = service.handle_request(&request(&url, Method::POST, None));
    assert_eq!(post.status(), StatusCode::METHOD_NOT_ALLOWED);
    assert_eq!(post.headers()[header::ALLOW], "GET, HEAD");
    let mut duplicate = request(&url, Method::GET, Some("bytes=0-1"));
    duplicate
        .headers_mut()
        .append(header::RANGE, header::HeaderValue::from_static("bytes=2-3"));
    assert_eq!(
        service.handle_request(&duplicate).status(),
        StatusCode::RANGE_NOT_SATISFIABLE
    );
}
#[test]
fn large_responses_are_capped_with_accurate_partial_metadata() {
    let file = Fixture::new(&vec![42; MAX_RESPONSE_BYTES as usize + 10]);
    let service = MediaStreamService::new();
    let url = service
        .register_media_stream(&file.0, "video/webm")
        .unwrap();
    assert_eq!(
        service
            .handle_request(&request(&url, Method::GET, None))
            .status(),
        StatusCode::PAYLOAD_TOO_LARGE
    );
    let partial = service.handle_request(&request(&url, Method::GET, Some("bytes=0-")));
    assert_eq!(partial.body().len(), MAX_RESPONSE_BYTES as usize);
    assert_eq!(
        partial.headers()[header::CONTENT_RANGE],
        format!(
            "bytes 0-{}/{}",
            MAX_RESPONSE_BYTES - 1,
            MAX_RESPONSE_BYTES + 10
        )
    );
    let head = service.handle_request(&request(&url, Method::HEAD, None));
    assert_eq!(head.status(), StatusCode::OK);
    assert_eq!(
        head.headers()[header::CONTENT_LENGTH],
        (MAX_RESPONSE_BYTES + 10).to_string()
    );
    assert!(head.body().is_empty());
}
#[test]
fn empty_missing_and_invalidated_files_are_safe() {
    let file = Fixture::new(b"");
    let service = MediaStreamService::new();
    let old = service
        .register_media_stream(&file.0, "audio/mpeg")
        .unwrap();
    assert_eq!(
        service
            .handle_request(&request(&old, Method::GET, None))
            .status(),
        StatusCode::OK
    );
    assert_eq!(
        service
            .handle_request(&request(&old, Method::GET, Some("bytes=0-")))
            .status(),
        StatusCode::RANGE_NOT_SATISFIABLE
    );
    let new = service
        .register_media_stream(&file.0, "audio/mpeg")
        .unwrap();
    assert_ne!(old, new);
    assert_eq!(
        service
            .handle_request(&request(&old, Method::GET, None))
            .status(),
        StatusCode::NOT_FOUND
    );
    fs::remove_file(&file.0).unwrap();
    let missing = service.handle_request(&request(&new, Method::GET, None));
    assert_eq!(missing.status(), StatusCode::NOT_FOUND);
    assert!(missing.body().is_empty());
}
#[test]
fn job_permits_bound_admission_and_release_on_drop() {
    let service = MediaStreamService::new();
    let permits: Vec<_> = (0..MAX_READ_JOBS)
        .map(|_| service.acquire_read().unwrap())
        .collect();
    assert!(service.acquire_read().is_none());
    drop(permits);
    assert!(service.acquire_read().is_some());
}
fn layout_overhead() -> usize {
    std::mem::size_of::<VirtualSegment>() + std::mem::size_of::<FaststartLayout>()
}
fn layout(bytes: usize) -> FaststartLayout {
    FaststartLayout {
        segments: vec![VirtualSegment::Memory {
            data: vec![0; bytes].into(),
            length: bytes as u64,
        }],
        total_size: bytes as u64,
    }
}
#[test]
fn retained_layout_budget_lives_until_active_entry_is_dropped() {
    let service = MediaStreamService::new();
    let retained = service
        .retain_layout(layout(MAX_LAYOUT_BYTES - layout_overhead()))
        .unwrap();
    let entry = Arc::new(MediaStreamEntry {
        path: PathBuf::new(),
        mime_type: "video/mp4".into(),
        layout: Some(retained),
    });
    let in_flight = Arc::clone(&entry);
    drop(entry);
    assert!(service.retain_layout(layout(1)).is_none());
    drop(in_flight);
    assert_eq!(service.retained_bytes.load(Ordering::Acquire), 0);
    assert!(service.retain_layout(layout(1)).is_some());
    assert!(service
        .retain_layout(layout(MAX_LAYOUT_BYTES + 1))
        .is_none());
}
#[test]
fn concurrent_budget_reservations_never_exceed_limit() {
    let service = MediaStreamService::new();
    let handles: Vec<_> = (0..12)
        .map(|_| {
            let service = service.clone();
            thread::spawn(move || {
                service.retain_layout(layout(MAX_LAYOUT_BYTES / 4 - layout_overhead()))
            })
        })
        .collect();
    let reservations: Vec<_> = handles
        .into_iter()
        .filter_map(|handle| handle.join().unwrap())
        .collect();
    assert_eq!(reservations.len(), 4);
    assert_eq!(
        service.retained_bytes.load(Ordering::Acquire),
        MAX_LAYOUT_BYTES
    );
    drop(reservations);
    assert_eq!(service.retained_bytes.load(Ordering::Acquire), 0);
}
#[test]
fn virtual_reads_cross_memory_file_boundaries_and_reject_truncation() {
    let file = Fixture::new(b"abcdef");
    let layout = FaststartLayout {
        segments: vec![
            VirtualSegment::File {
                file_offset: 0,
                length: 2,
            },
            VirtualSegment::Memory {
                data: Arc::from(&b"XY"[..]),
                length: 2,
            },
            VirtualSegment::File {
                file_offset: 4,
                length: 2,
            },
        ],
        total_size: 6,
    };
    let mut source = File::open(&file.0).unwrap();
    assert_eq!(read_virtual(&mut source, &layout, 1, 4).unwrap(), b"bXYe");
    fs::write(&file.0, b"a").unwrap();
    assert_eq!(
        read_virtual(&mut source, &layout, 0, 6).unwrap_err().kind(),
        io::ErrorKind::UnexpectedEof
    );
    let entry = MediaStreamEntry {
        path: file.0.clone(),
        mime_type: "video/mp4".into(),
        layout: Some(MediaStreamService::new().retain_layout(layout).unwrap()),
    };
    assert!(serve_entry(
        &entry,
        &request(&media_url(&"a".repeat(64)), Method::GET, Some("bytes=0-5"))
    )
    .is_err());
}
#[test]
fn registry_capacity_and_concurrent_refresh_are_bounded() {
    let file = Fixture::new(b"media");
    let service = MediaStreamService::new();
    let handles: Vec<_> = (0..12)
        .map(|_| {
            let service = service.clone();
            let path = file.0.clone();
            thread::spawn(move || service.register_media_stream(&path, "audio/mpeg").unwrap())
        })
        .collect();
    let urls: Vec<_> = handles
        .into_iter()
        .map(|handle| handle.join().unwrap())
        .collect();
    assert_eq!(service.entries.read().unwrap().len(), 1);
    assert_eq!(
        urls.iter()
            .filter(|url| service
                .handle_request(&request(url, Method::HEAD, None))
                .status()
                == StatusCode::OK)
            .count(),
        1
    );
    let mut files = Vec::new();
    for _ in 0..MAX_MEDIA_STREAM_ENTRIES + 5 {
        let file = Fixture::new(b"a");
        service
            .register_media_stream(&file.0, "audio/mpeg")
            .unwrap();
        files.push(file);
    }
    assert_eq!(
        service.entries.read().unwrap().len(),
        MAX_MEDIA_STREAM_ENTRIES
    );
}
#[test]
fn faststart_representation_is_pinned_before_token_is_published() {
    // Guaranteed moov relocation: mdat then moov containing a free box.
    let fixture = Fixture::new(&[
        0, 0, 0, 12, b'm', b'd', b'a', b't', 1, 2, 3, 4, 0, 0, 0, 20, b'm', b'o', b'o', b'v', 0, 0,
        0, 12, b'f', b'r', b'e', b'e', 0, 0, 0, 0,
    ]);
    let service = MediaStreamService::new();
    let url = service
        .register_media_stream(&fixture.0, "video/mp4")
        .unwrap()
        .replace(
            "http://chilla-media.localhost/",
            "chilla-media://localhost/",
        );
    let token = media_token(&url.parse::<Uri>().unwrap())
        .unwrap()
        .to_owned();
    let entry = service
        .entries
        .read()
        .unwrap()
        .get(&token)
        .cloned()
        .unwrap();
    let first = service.handle_request(&request(&url, Method::GET, Some("bytes=0-255")));
    let second = service.handle_request(&request(&url, Method::GET, Some("bytes=0-255")));
    assert_eq!(first.body(), second.body());
    assert!(entry.layout.is_some(), "fixture is a non-faststart MP4");
}

#[test]
fn browser_mapping_and_normalized_handler_authority_are_distinct() {
    let token = "a".repeat(64);
    assert_eq!(
        browser_media_url(&token, true),
        format!("http://chilla-media.localhost/media/{token}")
    );
    assert_eq!(
        browser_media_url(&token, false),
        format!("chilla-media://localhost/media/{token}")
    );
    assert!(media_token(&browser_media_url(&token, true).parse::<Uri>().unwrap()).is_none());
    assert!(media_token(&browser_media_url(&token, false).parse::<Uri>().unwrap()).is_some());
}
