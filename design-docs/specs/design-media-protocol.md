# Internal Media Protocol

## Overview

Replace Chilla's startup TCP/HTTP media server with a Tauri asynchronous URI
scheme handler. Opening the application must not bind any port. Audio and video
continue to use native WebView media controls, playback, seeking and refresh.
This supersedes the loopback transport and its App Store server entitlement.

## Technical Details

### Data flow

`open_file_preview` registers a canonical file under an opaque, application-local
token. Its existing `stream_url` field holds a `chilla-media` protocol URL.
The WebView requests that URL; Tauri routes the request directly to Rust. A
bounded background task resolves the token, reads the requested bytes and returns
a protocol response. No socket, external process or network server is involved.
Windows/Android use `http://chilla-media.localhost/media/<token>`; macOS/Linux
use `chilla-media://localhost/media/<token>`. Wry reverses the Windows host mapping before invoking the handler, so validate
the canonical `chilla-media://localhost` request authority there; inspect other
adapter normalization and test browser-to-handler mapping separately.
Construct URLs consistently for each platform and restrict CSP media-src
to the scheme and mapped host. Remove obsolete loopback permissions from CSP.

### Access and lifecycle

Only registered tokens can select a file; never accept arbitrary filesystem paths
from a protocol URL. Preserve bounded registry capacity, refreshed-token invalidation
and canonical paths granted by the native picker. Reject unexpected authorities,
paths, query/fragment content and unsupported methods. GET and HEAD are supported.
Registration/initialization must not start a listener or fail for a denied bind.
Handle missing files and internal errors with empty protocol responses, without
exposing filesystem paths. Limit concurrent reads and memory consumed per response.

### Byte ranges and MP4

Preserve byte-range semantics: closed, open-ended and suffix single ranges yield
206 with accurate Content-Range/Content-Length and Accept-Ranges. Invalid or
unsatisfiable ranges produce 416; unsupported methods produce 405. HEAD returns
metadata without reading a body. Preserve empty-file handling and checked offsets.
Reject multi-range requests with 416. Limit bodies to 2 MiB and concurrent reads
to 8 jobs, acquired before scheduling. Range responses cap the returned endpoint
and advertise the exact returned Content-Range. No-range GET returns full 200
only when logical size is at most 2 MiB; otherwise return empty 413. HEAD always
reports the full logical file length without a body. Tauri owns response buffers;
large native WebKit playback/seek/refresh must prove range negotiation. If that
check fails, revise the transport before declaring completion; do not silently
truncate 200 responses or remove the memory cap.

Reuse MP4 faststart virtual segments and adjusted moov data. Analyze synchronously
in a blocking registration task and pin one immutable representation before
publishing a token. Fall back to the original file if analysis is unavailable.
Retained virtual-layout memory has a 16 MiB aggregate budget per service. Serialize
analysis with a shared permit/mutex so at most one existing bounded analyzer
(100 MiB moov maximum) runs at a time, and account retained layout bytes atomically
with insertion/removal/eviction. Reject over-budget layouts and use original bytes.
Concurrent registration must not bypass these limits. Test reads crossing memory/file segment boundaries and source
truncation. Bound MP4 top-level metadata and recursive container depth; check
extended box sizes and chunk-offset arithmetic. Malformed or over-limit metadata
falls back to original file bytes without panicking or exhausting the worker stack. Do not add a dependency solely to parse ranges or construct responses;
use Tauri's reexported HTTP types and existing code where practical.

### Frontend and packaging

Keep Audio/Video `stream_url` contract shape. Frontend tests use custom protocol
URLs and verify playback, seeking, source renewal and error states. Preserve
Linux's existing external-player behavior. Remove network.server from App Store
entitlements and make packaging reject its accidental reintroduction; retain
network.client for existing GitHub/network features. Update current release docs;
preserve historical build-4 review records as historical evidence.

## Verification

Unit tests exercise status codes, range boundaries, malformed tokens, registration
invalidation, bounded responses/jobs, HEAD and virtual faststart reads. Frontend
typechecks and media DOM regressions cover the unchanged preview contract.
Build and launch the actual debug application, observe MP4/audio playback (including playable files larger than 2 MiB) and
seeking/refresh via Computer Use, and verify the process has no TCP listeners.
Run an ad hoc App Sandbox runtime copy with network.server absent and native
Powerbox selection to verify startup/media playback. macOS is available locally;
report Windows/Linux verification limits accurately.

## References

See [reference index](../references/README.md). Tauri's streaming example is an
API pattern reference, not a production implementation to copy verbatim.

## Media Keyboard Follow-up

Remove the inline Video/Audio keyboard usage text from the preview header.
Media shortcuts must work after clicking the player or its native controls: Space
toggles play/pause and Ctrl-D/Ctrl-U seek 15 seconds. Resolve focused native
controls in the capture phase without double playback or seeking. Preserve
editable fields and shortcut-help handling, existing file-tree J/K navigation
and inactive document isolation. In workspace context route large seeking through
the configured scroll actions; fixed Ctrl-D/U fallback applies only to standalone
media previews. Honor configured noop, remapped and unbound keys. Add focused-target regressions and verify
these interactions in the native macOS WebView.
