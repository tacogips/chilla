use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::Path,
    sync::Arc,
};

/// Maximum moov box size we are willing to load into memory (100 MB).
const MAX_MOOV_SIZE: u64 = 100 * 1024 * 1024;

/// A segment of the virtual file layout.
#[derive(Clone)]
pub(crate) enum VirtualSegment {
    /// Read from the original file at the given offset.
    File { file_offset: u64, length: u64 },
    /// Read from an in-memory buffer.
    Memory { data: Arc<[u8]>, length: u64 },
}

/// Virtual faststart layout for an MP4 file.
///
/// When a non-faststart MP4 file has its moov atom after the mdat atom,
/// this structure describes how to serve the file as if moov came first.
#[derive(Clone)]
pub(crate) struct FaststartLayout {
    /// Ordered segments that compose the virtual file.
    pub segments: Vec<VirtualSegment>,
    /// Total virtual file size (same as original).
    pub total_size: u64,
}

/// Top-level MP4 box descriptor.
struct BoxInfo {
    box_type: [u8; 4],
    /// Absolute offset of the first byte of this box in the file.
    offset: u64,
    /// Total size of this box including its header.
    total_size: u64,
}

/// Parse all top-level boxes in an open MP4 file.
///
/// Returns `None` if the file is too small to contain even one box header.
fn parse_top_level_boxes(file: &mut File, file_size: u64) -> Option<Vec<BoxInfo>> {
    if file_size < 8 {
        return None;
    }

    let mut boxes = Vec::new();
    let mut pos: u64 = 0;

    while pos + 8 <= file_size {
        file.seek(SeekFrom::Start(pos)).ok()?;

        let mut header = [0u8; 8];
        file.read_exact(&mut header).ok()?;

        let size_field = u32::from_be_bytes([header[0], header[1], header[2], header[3]]);
        let box_type = [header[4], header[5], header[6], header[7]];

        let total_size: u64 = match size_field {
            0 => {
                // Box extends to end of file.
                file_size - pos
            }
            1 => {
                // Extended 64-bit size follows the type field.
                if pos + 16 > file_size {
                    break;
                }
                let mut ext = [0u8; 8];
                file.read_exact(&mut ext).ok()?;
                u64::from_be_bytes(ext)
            }
            n => u64::from(n),
        };

        if total_size < 8 || pos + total_size > file_size {
            // Malformed or truncated box -- stop parsing.
            break;
        }

        boxes.push(BoxInfo {
            box_type,
            offset: pos,
            total_size,
        });

        pos += total_size;
    }

    if boxes.is_empty() {
        None
    } else {
        Some(boxes)
    }
}

/// Analyze an MP4 file. If moov comes after mdat, return a [`FaststartLayout`]
/// that presents moov before mdat with patched chunk offsets.
/// If the file is already faststart, is not MP4, or is otherwise unsuitable, return `None`.
pub(crate) fn analyze_mp4(path: &Path) -> Option<FaststartLayout> {
    let mut file = File::open(path).ok()?;
    let file_size = file.metadata().ok()?.len();

    let boxes = parse_top_level_boxes(&mut file, file_size)?;

    // Find moov and mdat.
    let moov = boxes.iter().find(|b| &b.box_type == b"moov")?;
    let mdat = boxes.iter().find(|b| &b.box_type == b"mdat")?;

    // If moov is already before mdat, file is already faststart.
    if moov.offset <= mdat.offset {
        return None;
    }

    let mdat_offset = mdat.offset;
    let moov_offset = moov.offset;
    let moov_size = moov.total_size;

    // Guard against huge moov boxes.
    if moov_size > MAX_MOOV_SIZE {
        eprintln!(
            "[mp4-faststart] moov box too large ({moov_size} bytes, limit {MAX_MOOV_SIZE}), skipping faststart"
        );
        return None;
    }

    // Read the entire moov box into memory.
    file.seek(SeekFrom::Start(moov_offset)).ok()?;
    let mut moov_buf = vec![0u8; moov_size as usize];
    file.read_exact(&mut moov_buf).ok()?;

    // In the virtual file layout:
    //   [A: 0..mdat_offset]  [moov' (patched)]  [B: mdat_offset..moov_offset]  [D: moov_offset+moov_size..file_size]
    //
    // Region B now starts at mdat_offset + moov_size in the virtual file instead of
    // mdat_offset in the original file.  Everything in B (including mdat's payload)
    // is shifted right by moov_size bytes, so we must add +moov_size to all stco/co64
    // chunk offset entries.
    let delta = moov_size as i64;

    // Patch stco/co64 in the in-memory moov buffer.
    // The moov buffer includes the box header (8 or 16 bytes).  The payload
    // (children) starts at the header size.
    let payload_start =
        if u32::from_be_bytes([moov_buf[0], moov_buf[1], moov_buf[2], moov_buf[3]]) == 1 {
            16usize
        } else {
            8usize
        };

    if payload_start >= moov_buf.len() {
        return None;
    }

    if !patch_moov_offsets(&mut moov_buf[payload_start..], delta) {
        eprintln!("[mp4-faststart] chunk offset patching failed, skipping faststart");
        return None;
    }

    // Build virtual segments.
    let prefix_len = mdat_offset; // region A
    let middle_len = moov_offset - mdat_offset; // region B (mdat + any boxes between mdat and moov)
    let suffix_start = moov_offset + moov_size;
    let suffix_len = file_size.saturating_sub(suffix_start); // region D

    let moov_data: Arc<[u8]> = Arc::from(moov_buf.into_boxed_slice());

    let mut segments: Vec<VirtualSegment> = Vec::new();

    if prefix_len > 0 {
        segments.push(VirtualSegment::File {
            file_offset: 0,
            length: prefix_len,
        });
    }

    segments.push(VirtualSegment::Memory {
        length: moov_size,
        data: Arc::clone(&moov_data),
    });

    if middle_len > 0 {
        segments.push(VirtualSegment::File {
            file_offset: mdat_offset,
            length: middle_len,
        });
    }

    if suffix_len > 0 {
        segments.push(VirtualSegment::File {
            file_offset: suffix_start,
            length: suffix_len,
        });
    }

    let total_size = prefix_len + moov_size + middle_len + suffix_len;

    eprintln!(
        "[mp4-faststart] applying virtual faststart layout: mdat_offset={mdat_offset} moov_offset={moov_offset} moov_size={moov_size} total_size={total_size}"
    );

    Some(FaststartLayout {
        segments,
        total_size,
    })
}

/// Container box types whose children should be recursed into.
const CONTAINER_BOXES: &[[u8; 4]] = &[
    *b"moov", *b"trak", *b"mdia", *b"minf", *b"stbl", *b"edts", *b"udta", *b"meta",
];

/// Recursively scan `buffer` (the payload of a container box) and patch all
/// `stco` and `co64` chunk offset entries by adding `delta`.
///
/// Returns `false` if a patching error occurs (e.g. u32 overflow for stco).
fn patch_moov_offsets(buffer: &mut [u8], delta: i64) -> bool {
    let mut pos = 0usize;

    while pos + 8 <= buffer.len() {
        let size_field = u32::from_be_bytes([
            buffer[pos],
            buffer[pos + 1],
            buffer[pos + 2],
            buffer[pos + 3],
        ]);
        let box_type = [
            buffer[pos + 4],
            buffer[pos + 5],
            buffer[pos + 6],
            buffer[pos + 7],
        ];

        let (header_size, box_total_size): (usize, usize) = match size_field {
            0 => {
                // Extends to end of buffer -- treat as rest of buffer.
                (8, buffer.len() - pos)
            }
            1 => {
                // Extended 64-bit size.
                if pos + 16 > buffer.len() {
                    break;
                }
                let ext = u64::from_be_bytes([
                    buffer[pos + 8],
                    buffer[pos + 9],
                    buffer[pos + 10],
                    buffer[pos + 11],
                    buffer[pos + 12],
                    buffer[pos + 13],
                    buffer[pos + 14],
                    buffer[pos + 15],
                ]);
                let total = usize::try_from(ext).unwrap_or(usize::MAX);
                (16, total)
            }
            n => (8, n as usize),
        };

        if box_total_size < header_size || pos + box_total_size > buffer.len() {
            break;
        }

        let payload_start = pos + header_size;
        let payload_end = pos + box_total_size;

        if &box_type == b"stco" {
            // FullBox: 1 byte version + 3 bytes flags = 4 bytes before entry_count.
            if payload_end < payload_start + 8 {
                return false;
            }
            let entry_count = u32::from_be_bytes([
                buffer[payload_start + 4],
                buffer[payload_start + 5],
                buffer[payload_start + 6],
                buffer[payload_start + 7],
            ]) as usize;

            let data_start = payload_start + 8;
            if data_start + entry_count * 4 > payload_end {
                return false;
            }

            for i in 0..entry_count {
                let off = data_start + i * 4;
                let old = u32::from_be_bytes([
                    buffer[off],
                    buffer[off + 1],
                    buffer[off + 2],
                    buffer[off + 3],
                ]);
                let new_val = i64::from(old) + delta;
                if new_val < 0 || new_val > i64::from(u32::MAX) {
                    eprintln!("[mp4-faststart] stco overflow: old={old} delta={delta}");
                    return false;
                }
                let new_u32 = new_val as u32;
                buffer[off..off + 4].copy_from_slice(&new_u32.to_be_bytes());
            }
        } else if &box_type == b"co64" {
            // FullBox: 4 bytes version+flags, then entry_count u32, then entries u64.
            if payload_end < payload_start + 8 {
                return false;
            }
            let entry_count = u32::from_be_bytes([
                buffer[payload_start + 4],
                buffer[payload_start + 5],
                buffer[payload_start + 6],
                buffer[payload_start + 7],
            ]) as usize;

            let data_start = payload_start + 8;
            if data_start + entry_count * 8 > payload_end {
                return false;
            }

            for i in 0..entry_count {
                let off = data_start + i * 8;
                let old = u64::from_be_bytes([
                    buffer[off],
                    buffer[off + 1],
                    buffer[off + 2],
                    buffer[off + 3],
                    buffer[off + 4],
                    buffer[off + 5],
                    buffer[off + 6],
                    buffer[off + 7],
                ]);
                let new_val = (old as i64) + delta;
                if new_val < 0 {
                    eprintln!("[mp4-faststart] co64 underflow: old={old} delta={delta}");
                    return false;
                }
                buffer[off..off + 8].copy_from_slice(&(new_val as u64).to_be_bytes());
            }
        } else if CONTAINER_BOXES.contains(&box_type) {
            // Recurse into container.  For `meta`, it is a FullBox with 4 bytes of
            // version+flags before its children.
            let child_payload_start = if &box_type == b"meta" {
                // meta is a FullBox: skip 4 bytes version+flags.
                payload_start + 4
            } else {
                payload_start
            };

            if child_payload_start < payload_end
                && !patch_moov_offsets(&mut buffer[child_payload_start..payload_end], delta)
            {
                return false;
            }
        }

        pos += box_total_size;
    }

    true
}

// ---------------------------------------------------------------------------
// Unit tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        io::Write,
        sync::atomic::{AtomicU64, Ordering},
    };

    static TEST_FILE_COUNTER: AtomicU64 = AtomicU64::new(0);

    /// Write `data` to a uniquely-named temporary file and return its path.
    /// The file is created in the system temp directory.
    fn write_temp_file(data: &[u8]) -> std::path::PathBuf {
        let id = TEST_FILE_COUNTER.fetch_add(1, Ordering::Relaxed);
        let pid = std::process::id();
        let path = std::env::temp_dir().join(format!("mp4_faststart_test_{pid}_{id}.mp4"));
        let mut f = File::create(&path).expect("create temp file");
        f.write_all(data).expect("write temp file");
        f.flush().expect("flush temp file");
        path
    }

    /// Remove a temp file, ignoring errors (best-effort cleanup).
    fn remove_temp_file(path: &std::path::Path) {
        let _ = std::fs::remove_file(path);
    }

    // -----------------------------------------------------------------------
    // Helper: write a 4-byte big-endian u32
    // -----------------------------------------------------------------------
    fn write_u32_be(buf: &mut Vec<u8>, v: u32) {
        buf.extend_from_slice(&v.to_be_bytes());
    }

    fn write_u64_be(buf: &mut Vec<u8>, v: u64) {
        buf.extend_from_slice(&v.to_be_bytes());
    }

    /// Build a minimal MP4-like binary with the given boxes in order.
    /// Each entry is (type_4cc, payload).
    fn build_mp4(boxes: &[(&[u8; 4], &[u8])]) -> Vec<u8> {
        let mut out = Vec::new();
        for (box_type, payload) in boxes {
            let total = 8u32 + payload.len() as u32;
            write_u32_be(&mut out, total);
            out.extend_from_slice(*box_type);
            out.extend_from_slice(payload);
        }
        out
    }

    /// Build a minimal `stco` FullBox payload (version=0, flags=0, then entries).
    fn build_stco(entries: &[u32]) -> Vec<u8> {
        let mut buf = Vec::new();
        // version (1 byte) + flags (3 bytes)
        buf.extend_from_slice(&[0u8, 0, 0, 0]);
        write_u32_be(&mut buf, entries.len() as u32);
        for &e in entries {
            write_u32_be(&mut buf, e);
        }
        buf
    }

    /// Build a minimal `co64` FullBox payload.
    fn build_co64(entries: &[u64]) -> Vec<u8> {
        let mut buf = Vec::new();
        buf.extend_from_slice(&[0u8, 0, 0, 0]); // version + flags
        write_u32_be(&mut buf, entries.len() as u32);
        for &e in entries {
            write_u64_be(&mut buf, e);
        }
        buf
    }

    /// Wrap a payload inside a named box.
    fn wrap_box(box_type: &[u8; 4], payload: &[u8]) -> Vec<u8> {
        let total = 8u32 + payload.len() as u32;
        let mut out = Vec::new();
        write_u32_be(&mut out, total);
        out.extend_from_slice(box_type);
        out.extend_from_slice(payload);
        out
    }

    // -----------------------------------------------------------------------
    // Tests for analyze_mp4
    // -----------------------------------------------------------------------

    #[test]
    fn analyze_mp4_returns_none_for_empty_file() {
        let path = write_temp_file(b"");
        assert!(analyze_mp4(&path).is_none());
        remove_temp_file(&path);
    }

    #[test]
    fn analyze_mp4_returns_none_for_non_mp4() {
        let path = write_temp_file(b"This is definitely not an MP4 file at all");
        // No moov box -> None
        assert!(analyze_mp4(&path).is_none());
        remove_temp_file(&path);
    }

    #[test]
    fn analyze_mp4_returns_none_when_already_faststart() {
        // moov before mdat -> already faststart
        let data = build_mp4(&[
            (b"ftyp", b"mp42\x00\x00\x00\x00"),
            (b"moov", b"\x00\x00\x00\x00"), // minimal moov payload
            (b"mdat", b"\x01\x02\x03\x04"),
        ]);
        let path = write_temp_file(&data);
        assert!(analyze_mp4(&path).is_none());
        remove_temp_file(&path);
    }

    #[test]
    fn analyze_mp4_returns_layout_when_moov_after_mdat() {
        // Build: ftyp + mdat + moov (non-faststart order)
        // moov contains a stbl > stco with a known offset that should be patched.

        let stco_payload = build_stco(&[1000u32]); // one chunk offset entry
        let stco_box = wrap_box(b"stco", &stco_payload);
        let stbl_box = wrap_box(b"stbl", &stco_box);
        let minf_box = wrap_box(b"minf", &stbl_box);
        let mdia_box = wrap_box(b"mdia", &minf_box);
        let trak_box = wrap_box(b"trak", &mdia_box);
        // moov payload = trak box
        let moov_box = wrap_box(b"moov", &trak_box);

        let ftyp_payload = b"mp42\x00\x00\x00\x00";
        let mdat_payload = b"\xDE\xAD\xBE\xEF";

        let ftyp_box = wrap_box(b"ftyp", ftyp_payload);
        let mdat_box = wrap_box(b"mdat", mdat_payload);

        let mut data = Vec::new();
        data.extend_from_slice(&ftyp_box);
        data.extend_from_slice(&mdat_box);
        data.extend_from_slice(&moov_box);

        let path = write_temp_file(&data);
        let layout = analyze_mp4(&path).expect("should return Some for non-faststart MP4");
        remove_temp_file(&path);

        assert_eq!(layout.total_size, data.len() as u64);

        // The virtual layout should have at least a Memory segment (the patched moov)
        let has_memory = layout
            .segments
            .iter()
            .any(|s| matches!(s, VirtualSegment::Memory { .. }));
        assert!(has_memory, "expected a Memory segment for the patched moov");
    }

    // -----------------------------------------------------------------------
    // Tests for stco/co64 patching
    // -----------------------------------------------------------------------

    #[test]
    fn patch_moov_offsets_adjusts_stco_entries() {
        let stco_payload = build_stco(&[100u32, 200u32, 300u32]);
        // Wrap in stbl > minf > mdia > trak so the container recursion is exercised.
        let stco_box = wrap_box(b"stco", &stco_payload);
        let stbl_box = wrap_box(b"stbl", &stco_box);
        let minf_box = wrap_box(b"minf", &stbl_box);
        let mdia_box = wrap_box(b"mdia", &minf_box);
        let trak_box = wrap_box(b"trak", &mdia_box);

        // The buffer passed to patch_moov_offsets is the moov *payload* (children),
        // so just use trak_box bytes directly.
        let mut buf = trak_box;
        assert!(patch_moov_offsets(&mut buf, 50));

        // Extract the patched stco entries.
        // Locate stco within buf by parsing manually.
        let patched_entries = extract_stco_entries(&buf);
        assert_eq!(patched_entries, vec![150u32, 250u32, 350u32]);
    }

    #[test]
    fn patch_moov_offsets_adjusts_co64_entries() {
        let co64_payload = build_co64(&[1_000_000u64, 2_000_000u64]);
        let co64_box = wrap_box(b"co64", &co64_payload);
        let stbl_box = wrap_box(b"stbl", &co64_box);

        let mut buf = stbl_box;
        assert!(patch_moov_offsets(&mut buf, 99));

        let patched = extract_co64_entries(&buf);
        assert_eq!(patched, vec![1_000_099u64, 2_000_099u64]);
    }

    #[test]
    fn patch_moov_offsets_returns_false_on_stco_overflow() {
        // Entry at u32::MAX; adding 1 should overflow.
        let stco_payload = build_stco(&[u32::MAX]);
        let stco_box = wrap_box(b"stco", &stco_payload);
        let stbl_box = wrap_box(b"stbl", &stco_box);
        let mut buf = stbl_box;
        assert!(!patch_moov_offsets(&mut buf, 1));
    }

    // -----------------------------------------------------------------------
    // Virtual segment range mapping smoke test
    // -----------------------------------------------------------------------

    #[test]
    fn virtual_segment_lengths_sum_to_total_size() {
        // Build a non-faststart MP4 and verify segment lengths == total_size.
        let moov_payload = wrap_box(b"trak", b"\x00\x00\x00\x00");
        let moov_box = wrap_box(b"moov", &moov_payload);
        let mdat_box = wrap_box(b"mdat", b"\x01\x02\x03\x04\x05\x06\x07\x08");

        let mut data = Vec::new();
        data.extend_from_slice(&mdat_box);
        data.extend_from_slice(&moov_box);

        let path = write_temp_file(&data);
        let layout = analyze_mp4(&path).expect("should produce layout");
        remove_temp_file(&path);

        let segments_total: u64 = layout
            .segments
            .iter()
            .map(|s| match s {
                VirtualSegment::File { length, .. } => *length,
                VirtualSegment::Memory { length, .. } => *length,
            })
            .sum();

        assert_eq!(
            segments_total, layout.total_size,
            "segment lengths must sum to total_size"
        );
        assert_eq!(
            layout.total_size,
            data.len() as u64,
            "total_size must equal original file size"
        );
    }

    // -----------------------------------------------------------------------
    // Helpers for extracting patched values from a byte buffer
    // -----------------------------------------------------------------------

    /// Walk a box buffer recursively to find and extract stco entries.
    fn extract_stco_entries(buf: &[u8]) -> Vec<u32> {
        let mut pos = 0usize;
        while pos + 8 <= buf.len() {
            let size_field =
                u32::from_be_bytes([buf[pos], buf[pos + 1], buf[pos + 2], buf[pos + 3]]);
            let box_type = [buf[pos + 4], buf[pos + 5], buf[pos + 6], buf[pos + 7]];
            let total = if size_field == 0 {
                buf.len() - pos
            } else {
                size_field as usize
            };
            if total < 8 || pos + total > buf.len() {
                break;
            }
            let payload_start = pos + 8;
            let payload_end = pos + total;

            if &box_type == b"stco" {
                let entry_count = u32::from_be_bytes([
                    buf[payload_start + 4],
                    buf[payload_start + 5],
                    buf[payload_start + 6],
                    buf[payload_start + 7],
                ]) as usize;
                let data_start = payload_start + 8;
                let mut entries = Vec::new();
                for i in 0..entry_count {
                    let off = data_start + i * 4;
                    entries.push(u32::from_be_bytes([
                        buf[off],
                        buf[off + 1],
                        buf[off + 2],
                        buf[off + 3],
                    ]));
                }
                return entries;
            } else if CONTAINER_BOXES.contains(&box_type) {
                let sub = extract_stco_entries(&buf[payload_start..payload_end]);
                if !sub.is_empty() {
                    return sub;
                }
            }
            pos += total;
        }
        vec![]
    }

    /// Walk a box buffer recursively to find and extract co64 entries.
    fn extract_co64_entries(buf: &[u8]) -> Vec<u64> {
        let mut pos = 0usize;
        while pos + 8 <= buf.len() {
            let size_field =
                u32::from_be_bytes([buf[pos], buf[pos + 1], buf[pos + 2], buf[pos + 3]]);
            let box_type = [buf[pos + 4], buf[pos + 5], buf[pos + 6], buf[pos + 7]];
            let total = if size_field == 0 {
                buf.len() - pos
            } else {
                size_field as usize
            };
            if total < 8 || pos + total > buf.len() {
                break;
            }
            let payload_start = pos + 8;
            let payload_end = pos + total;

            if &box_type == b"co64" {
                let entry_count = u32::from_be_bytes([
                    buf[payload_start + 4],
                    buf[payload_start + 5],
                    buf[payload_start + 6],
                    buf[payload_start + 7],
                ]) as usize;
                let data_start = payload_start + 8;
                let mut entries = Vec::new();
                for i in 0..entry_count {
                    let off = data_start + i * 8;
                    entries.push(u64::from_be_bytes([
                        buf[off],
                        buf[off + 1],
                        buf[off + 2],
                        buf[off + 3],
                        buf[off + 4],
                        buf[off + 5],
                        buf[off + 6],
                        buf[off + 7],
                    ]));
                }
                return entries;
            } else if CONTAINER_BOXES.contains(&box_type) {
                let sub = extract_co64_entries(&buf[payload_start..payload_end]);
                if !sub.is_empty() {
                    return sub;
                }
            }
            pos += total;
        }
        vec![]
    }
}
