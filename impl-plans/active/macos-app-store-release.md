# macOS App Store Release Implementation Plan

**Status**: In Progress
**Design Reference**: `design-docs/specs/design-macos-dmg-release.md#mac-app-store-distribution`
**Created**: 2026-09-09
**Last Updated**: 2026-09-09

## Design Document Reference

Prepare, build, validate, upload, and submit an Apple Silicon-only Mac App Store
variant of chilla 0.2.0 using the local Konjac release discipline as the evidence
model.

Included: sandboxed Tauri configuration, ephemeral secret/profile handling,
signed `.app` and `.pkg` validation, App Store Connect record/build readiness,
macOS listing assets, upload, processing, and final submission.

Excluded: iOS/iPadOS targets, weakening the Developer ID DMG, committing Apple
credentials or provisioning artifacts, and inferring commercial/review choices.

## Modules

### TASK-001: Release Configuration And Safety Gates

**Status**: In Progress
**Parallelizable**: No
**Deliverables**: `src-tauri/tauri.appstore.conf.json`,
`src-tauri/Entitlements.appstore.plist.in`, `src-tauri/Info.plist`,
`scripts/release-macos-app-store-local.sh`, `mise.toml`, `release/README.md`

**Completion Criteria**:

- [x] App Store configuration is isolated from Developer ID packaging
- [x] sandbox, user-selected file, and outbound-network entitlements are present
- [x] provisioning and team values are supplied ephemerally and never committed
- [x] readiness failures identify missing certificate/profile/metadata gates
- [ ] the task builds an Apple Silicon `.app` and installer-signed `.pkg`

### TASK-002: Sandboxed Runtime Verification

**Status**: Not Started
**Parallelizable**: No (depends on TASK-001)
**Deliverables**: packaged application and redacted release evidence

**Completion Criteria**:

- [ ] signed app passes strict code-signature validation
- [ ] embedded profile and effective entitlements match the application
- [ ] packaged app launches under App Sandbox
- [ ] in-app picker opens a directory and file preview
- [ ] GitHub diff retrieval works with outbound-network entitlement
- [ ] CLI path limitation is reflected in listing/review notes

### TASK-003: App Store Connect Record And Metadata

**Status**: Blocked
**Parallelizable**: Yes
**Deliverables**: `com.tacogips.chilla` identifier, App Store Connect macOS app
record, listing metadata, privacy answers, screenshots, review information

**Completion Criteria**:

- [ ] owner decisions recorded for price, availability, and release timing
- [ ] review contact and notes are complete
- [ ] app record uses the exact bundle identifier and product identity
- [ ] one to ten compliant 16:10 macOS screenshots are uploaded
- [ ] privacy and encryption answers match shipped behavior

### TASK-004: Upload, Processing, And Submission

**Status**: Blocked
**Parallelizable**: No (depends on TASK-002 and TASK-003)
**Deliverables**: uploaded 0.2.0 build and App Review submission evidence

**Completion Criteria**:

- [ ] package validation and upload succeed
- [ ] build finishes processing without blocking issues
- [ ] processed build is attached to the 0.2.0 macOS version
- [ ] final metadata validation passes
- [ ] version is submitted with the owner-selected release mode

## Module Status

| Module | File Path / Service | Status | Tests |
| --- | --- | --- | --- |
| Release safety gates | Tauri config, script, mise | IN_PROGRESS | Shell/config checks |
| Sandboxed runtime | packaged chilla app | NOT_STARTED | Signature and UI QA |
| Store record | Apple Developer / App Store Connect | BLOCKED | Metadata validation |
| Upload and review | App Store Connect | BLOCKED | Processing evidence |

## Dependencies

| Feature | Depends On | Status |
| --- | --- | --- |
| Signed app | Mac App Store profile and Apple Distribution identity | Profile missing |
| Signed package | Mac Installer Distribution identity | Missing |
| App record | registered bundle identifier and owner metadata | Missing |
| Final submission | processed build and owner decisions | Blocked |

## Completion Criteria

- [ ] repository verification passes
- [ ] no secret/profile material appears in Git history or release logs
- [ ] signed sandboxed 0.2.0 app and package pass local validation
- [ ] App Store Connect accepts and processes the build
- [ ] macOS version is submitted to App Review

## Progress Log

### Session: 2026-09-09

**Tasks Completed**: Read the Konjac release contract and official Tauri/Apple
requirements; confirmed an Apple Silicon-only target, existing Apple Distribution
identity, App Store Connect credentials, and Xcode Admin session. Added isolated
Tauri configuration, ephemeral entitlements/profile handling, exact certificate
and profile validation, package staging, upload authentication isolation, mise
automation, and release documentation. Full repository verification passes.

**Tasks In Progress**: TASK-001.

**Blockers**: No chilla Mac App Store provisioning profile, no Mac Installer
Distribution identity, no App Store Connect app record, and owner decisions for
price/availability/release timing/review contact are not yet recorded.

**Notes**: The App Store Connect individual key can read application records but
cannot authenticate the Certificates, Identifiers & Profiles API. Xcode can issue
the missing installer certificate after action-time confirmation.
