# Internal Media Protocol Implementation Plan

**Status**: Completed
**Design Reference**: design-docs/specs/design-media-protocol.md#technical-details
**Created**: 2026-10-01
**Last Updated**: 2026-10-01

## Scope

Replace socket media delivery with a Tauri protocol; preserve media preview contract,
MP4 faststart, seeking and selected-file sandbox access. Do not change App Store
submission or publish a new release as part of local implementation/testing.
Preserve all pre-existing Rust/TypeScript edits in this dirty worktree.

## Modules and Deliverables

1. `src-tauri/src/media_stream.rs`: socket-free registry, bounded request handler,
   URI generation, range/file/virtual reads and unit tests.
2. `src-tauri/src/lib.rs`: asynchronous protocol registration and infallible
   transport initialization; existing AppState wiring remains coherent.
3. `src/features/preview/MediaFilePreviewPane.vitest.tsx`: internal protocol
   source/playback/seek/refresh regression coverage; production contract unchanged.
4. `src-tauri/tauri.conf.json`, App Store entitlements and release script:
   protocol CSP and rejection of accidental network.server entitlement.
5. Current design/release/README documentation and verification evidence.

## Tasks

### TASK-001: Design And Review
**Status**: Completed
**Parallelizable**: No
**Completion Criteria**:
- [x] Document transport, scope, resource bounds and stable faststart behavior
- [x] Independent design/plan review accepted after explicit response/metadata bounds and stable registration representation corrections

### TASK-002: Rust Protocol And Tests
**Status**: Completed
**Parallelizable**: Yes, after TASK-001 (disjoint frontend ownership)
**Completion Criteria**:
- [x] No media TCP listener or bind at startup
- [x] Token-only protocol GET/HEAD with range/status/error/resource tests
- [x] Stable virtual MP4 byte representation and segment tests
- [x] Tauri protocol wiring compiles; affected Rust tests pass

### TASK-003: Frontend And Packaging
**Status**: Completed
**Parallelizable**: Yes, after TASK-001
**Completion Criteria**:
- [x] Custom protocol media sources, seeking and refresh covered by frontend tests
- [x] Protocol CSP replaces loopback allowances
- [x] App Store entitlement/script enforce absence of server permission
- [x] Relevant docs updated without rewriting historical review evidence

### TASK-004: Independent Verification And Runtime
**Status**: Completed
**Parallelizable**: No, after TASK-002/TASK-003
**Completion Criteria**:
- [x] Independent implementation review and automatic check/test agent complete
- [x] Rust/frontend checks pass; relevant issues fixed
- [x] Debug app visibly plays/seeks/refreshes media and has no listener
- [x] Sandbox app plays selected media without network.server
- [x] Record commands, results and platform limits; archive completed plan

## Progress Log

### Session: 2026-10-01
Created design and plan after inspecting the existing listener, range parser,
MP4 virtual layout and Tauri streaming reference. Installed Riela workflow 0.3.1
fails validation (missing agentSandbox and output schemas); not executed. Use the
repository-required specialized coding and independent verification agents.
No commit/push or new Apple upload is authorized by this design/implementation task.

Design review required and incorporated: 2 MiB body cap, 8 read jobs, large native
range negotiation, synchronous representation pinning, 16 MiB retained metadata
budget with serialized bounded analysis, and exact platform URL mapping.

### Session: 2026-10-01 (Implementation And Native Verification)

Rust implements a socket-free token registry and asynchronous `chilla-media`
handler. The browser URL maps to `http://chilla-media.localhost` on Windows/Android;
Wry normalizes it back to the custom scheme before the Rust handler. Reads have
2 MiB bodies and 8 permits acquired before scheduling. HEAD ignores Range and
returns full metadata. Serialized analysis pins the representation before token
publication, with a 16 MiB RAII retained budget including virtual-layout metadata.
The existing MP4 analyzer now bounds top-level box metadata and checks offsets.
No dependencies were added. Frontend media URL contract remains unchanged; keyboard follow-up is recorded below.

Independent checks passed: frontend typecheck, media DOM 16/16, cargo check,
media protocol 12/12, MP4 faststart 9/9, document command 1/1, all-target Clippy,
release script syntax and entitlement validation. An initial test wrongly assumed
the existing MP4 fixture needed faststart; replaced it with a deterministic
nonfaststart `.mp4` fixture. The final rerun passed.

Final build command: `env` with Apple signing/notarization variables removed,
`CARGO_TERM_QUIET=true mise exec -- bun run tauri build --debug --no-bundle`.
The initial bundled debug build unexpectedly inherited Apple credentials and was
Developer ID signed/notarized automatically. No App Store Connect record was
changed; final testing used locally ad hoc signed copies of the final executable.

Launched `target/debug/chilla` with a generated 7,922,445-byte MP4. Computer Use
selected a different existing app by name, so final visible verification used
unique-identifier local bundles built from the final debug executable. Normal
and App Sandbox bundles both played the 2:32 video, sought to 2:18, resumed and
refreshed to a new custom-protocol token. The sandbox copy opened the file through
Powerbox; MP3 playback progressed, sought to 0:51, and refreshed successfully.
Signed sandbox entitlements included App Sandbox/user-selected read-write/client
but omitted network.server. `lsof` confirmed no TCP LISTEN sockets for both live
app processes. Final executable postdates every touched production Rust file.

Logs and disposable local QA bundles: `/tmp/chilla-media-protocol-evidence/`.
Normal launch: `normal-runtime.app/Contents/MacOS/chilla large-video.mp4`;
sandbox launch: `sandbox-runtime.app/Contents/MacOS/chilla` then native selection.
Local OS: macOS 26.5.2. Windows mapping is unit/static verified; Windows/Linux
native playback is not claimed. This change has not replaced submitted build 4.

### TASK-005: Media Keyboard Follow-up
**Status**: Completed
**Parallelizable**: No
**Design Reference**: design-docs/specs/design-media-protocol.md#media-keyboard-follow-up
**Deliverables**: media preview keyboard handling/header, related regression tests
**Completion Criteria**:
- [x] Remove inline keyboard usage hint
- [x] Focused player shortcuts work without native/default double handling
- [x] Editable fields, inactive panes, help and file-tree shortcuts retain behavior
- [x] Independent frontend checks and native keyboard verification pass

### Session: 2026-10-01 (Final Parser Review And Keyboard Follow-up)

Independent final review accepted after bounding MP4 recursive depth and checking
unsigned chunk-offset/extended-size arithmetic. MP4 suite now passes 12/12, media
protocol 12/12, Cargo check and strict all-target Clippy. Rebuilt debug executable
and sandbox copy visibly played/refreshed the 7.9 MB MP4 and resumed at 2:20 after
a native timeline seek; both processes had no TCP listener.

User requested removal of inline keyboard instructions and reported broken video
shortcuts. Native reproduction confirmed Ctrl-D did not seek after overlay Play,
while Space paused and J sought 5 seconds with the tree hidden. Inspection found
workspace capture consumes Ctrl-D/U but its scroll action ignores media, and the
media listener skips focused player targets. TASK-005 added for this correction.

### Session: 2026-10-01 (Keyboard Completion Verification)

Removed inline Video/Audio usage hint. Media capture handles focused native
controls and guards consumed events, exact modifiers, editable fields, help,
hidden previews and composing/repeat events. Workspace configured scroll actions
seek active media by 15 seconds; standalone fallback does not override workspace
noop/remapped/unbound keys. J/K behavior remains 5 seconds when the tree is hidden.
Independent review accepted; six relevant DOM suites pass 153/153 and independent
media/workspace/keymap pass 115/115. Typecheck passes after two strict TypeScript
test/predicate errors were corrected.

Rebuilt and directly launched the executable with the test video:

```sh
/Users/taco/gits/tacogips/chilla/target/debug/chilla /tmp/chilla-media-protocol-evidence/large-video.mp4
```

Direct log:
`/tmp/chilla-media-protocol-evidence/debug-keyboard-direct-launch.log`.
Final native normal copy: focused Space pause/resume, Ctrl-D 3→18, Ctrl-U 18→3,
J 3→8, K 8→3. Final sandbox copy: same Space/Ctrl behavior, keyboard seek to
2:03/resume, new-token refresh/playback. Header visibly contains only Video.
Latest sandbox effective entitlements omit server; both PIDs have no TCP listener.
Evidence: `/tmp/chilla-media-protocol-evidence/verification-summary.json`.

Updated shortcut help to “Play / pause the active media preview,” rebuilt once
more, stopped only the temporary QA process copies and relaunched the current
repository debug executable with the same test MP4. Latest launch log:
`/tmp/chilla-media-protocol-evidence/completed-debug-launch.log`; latest build:
`/tmp/chilla-media-protocol-evidence/debug-build-completed.log`.

Final help-only edit independently verified: typecheck passes and focused
workspace shortcut/help/Space tests pass 59/59 (one unrelated test skipped).
All completion criteria satisfied; archived as completed. Windows/Linux native
verification and a new Apple submission are outside this local task.
