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

**Status**: Completed
**Parallelizable**: No
**Deliverables**: `src-tauri/tauri.appstore.conf.json`,
`src-tauri/Entitlements.appstore.plist.in`, `src-tauri/Info.plist`,
`scripts/release-macos-app-store-local.sh`, `mise.toml`, `release/README.md`

**Completion Criteria**:

- [x] App Store configuration is isolated from Developer ID packaging
- [x] sandbox, user-selected file, and outbound-network entitlements are present
- [x] provisioning and team values are supplied ephemerally and never committed
- [x] readiness failures identify missing certificate/profile/metadata gates
- [x] the task builds an Apple Silicon `.app` and installer-signed `.pkg`

### TASK-002: Sandboxed Runtime Verification

**Status**: In Progress
**Parallelizable**: No (depends on TASK-001)
**Deliverables**: packaged application and redacted release evidence

**Completion Criteria**:

- [x] signed app passes strict code-signature validation
- [x] embedded profile and effective entitlements match the application
- [ ] packaged app launches under App Sandbox
- [ ] in-app picker opens a directory and file preview
- [ ] GitHub diff retrieval works with outbound-network entitlement
- [ ] CLI path limitation is reflected in listing/review notes

### TASK-003: App Store Connect Record And Metadata

**Status**: In Progress
**Parallelizable**: Yes
**Deliverables**: `com.tacogips.chilla` identifier, App Store Connect macOS app
record, listing metadata, privacy answers, screenshots, review information

**Completion Criteria**:

- [x] owner decisions recorded for price, availability, and release timing
- [ ] review contact and notes are complete
- [x] app record uses the exact bundle identifier and product identity
- [ ] one to ten compliant 16:10 macOS screenshots are uploaded
- [ ] privacy and encryption answers match shipped behavior

### TASK-004: Upload, Processing, And Submission

**Status**: In Progress
**Parallelizable**: No (depends on TASK-002 and TASK-003)
**Deliverables**: uploaded 0.2.0 build and App Review submission evidence

**Completion Criteria**:

- [x] package validation and upload succeed
- [x] build finishes processing without blocking issues
- [x] processed build is attached to the 0.2.0 macOS version
- [ ] final metadata validation passes
- [ ] version is submitted with the owner-selected release mode

## Module Status

| Module | File Path / Service | Status | Tests |
| --- | --- | --- | --- |
| Release safety gates | Tauri config, script, mise | COMPLETED | Shell/config checks |
| Sandboxed runtime | packaged chilla app | IN_PROGRESS | Signature and UI QA |
| Store record | Apple Developer / App Store Connect | IN_PROGRESS | Metadata validation |
| Upload and review | App Store Connect | IN_PROGRESS | Processing evidence |

## Dependencies

| Feature | Depends On | Status |
| --- | --- | --- |
| Signed app | Mac App Store profile and Apple Distribution identity | Available |
| Signed package | Mac Installer Distribution identity | Available and Keychain-authorized |
| App record | registered bundle identifier and owner metadata | Free, worldwide, manual release, and copyright configured; review metadata remains |
| Final submission | processed build and owner decisions | Blocked by screenshots, review/compliance metadata, and Apple agreement |

## Completion Criteria

- [ ] repository verification passes
- [ ] no secret/profile material appears in Git history or release logs
- [x] signed sandboxed 0.2.0 app and package pass local validation
- [x] App Store Connect accepts and processes the build
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

**Blockers**: No chilla Mac App Store provisioning profile, no App Store Connect
app record, and owner decisions for price/availability/release timing/review
contact are not yet recorded.

**Notes**: The App Store Connect individual key can read application records but
cannot authenticate the Certificates, Identifiers & Profiles API. Xcode can issue
the missing installer certificate after action-time confirmation.

### Session: 2026-09-09 (Registration Execution)

**Tasks Completed**: Created and installed the Mac Installer Distribution
certificate through the signed-in Xcode Admin account, then verified its local
keychain identity by status only. Corrected the release script to query installer
identities with the keychain `basic` policy.

**Tasks In Progress**: TASK-003 bundle-identifier/profile registration.

**Blockers**: Apple Developer portal authentication is waiting for local passkey
biometric approval. Price, availability, release timing, and review contact
remain required before submission.

**Notes**: No certificate, account, team, or private-key values are recorded.

### Session: 2026-09-09 (App Store Connect Upload)

**Tasks Completed**: Registered the explicit chilla bundle identifier and Mac App
Store provisioning profile, created the macOS App Store Connect record as
`Chilla Viewer`, saved the `Lightweight, keyboard-first` subtitle, selected the
Utilities category, populated version 0.2.0 listing copy and project URLs,
validated and uploaded build 1, confirmed processing completed, and attached the
processed build to version 0.2.0. App Store Connect extracted the embedded app
icon from the build.

**Tasks In Progress**: TASK-002 runtime QA, TASK-003 owner metadata and
screenshots, and TASK-004 final validation/submission.

**Blockers**: The Account Holder must accept the updated Apple Developer Program
License Agreement. Owner decisions remain required for price, territories,
release timing, content rights, copyright holder, review contact, and compliance
answers. Compliant 16:10 screenshots are not yet uploaded.

**Notes**: Apple validation initially rejected the embedded provisioning profile
because it retained owner-only file permissions. The release script now embeds
the profile read-only for all users, after which validation and upload succeeded
without errors. A distribution-signed App Store bundle cannot be launched
directly outside the Store installation path; strict code-signature and
entitlement checks pass, while installed-build runtime QA remains pending.

### Session: 2026-09-09 (Commercial Availability)

**Tasks Completed**: Configured version 0.2.0 as a free app, made it available in
all 175 App Store countries or regions, selected manual release after App Review,
and saved `2026 tacogips` as the copyright notice.

**Tasks In Progress**: TASK-002 runtime QA, TASK-003 screenshots, review contact,
content-rights/privacy/compliance metadata, and TASK-004 final validation and
submission.

**Blockers**: The Account Holder must explicitly authorize acceptance of the
updated Apple Developer Program License Agreement because it legally binds the
developer account. App Review contact details, content-rights/compliance answers,
and compliant 16:10 screenshots remain required.

**Notes**: Release remains manual, so approval by App Review will not publish the
app until the Account Holder explicitly releases it.
