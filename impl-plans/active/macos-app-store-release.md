# macOS App Store Release Implementation Plan

**Status**: In Progress
**Design Reference**: `design-docs/specs/design-macos-dmg-release.md#mac-app-store-distribution`
**Created**: 2026-09-09
**Last Updated**: 2026-10-01

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
- [x] sandbox, user-selected file, outbound-network, and media-server entitlements are present
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
- [x] review contact and notes are complete
- [x] app record uses the exact bundle identifier and product identity
- [x] one to ten compliant 16:10 macOS screenshots are uploaded
- [x] privacy and encryption answers match shipped behavior

### TASK-004: Upload, Processing, And Submission

**Status**: In Progress
**Parallelizable**: No (depends on TASK-002 and TASK-003)
**Deliverables**: uploaded 0.2.0 build and App Review submission evidence

**Completion Criteria**:

- [x] package validation and upload succeed
- [x] build finishes processing without blocking issues
- [x] processed build is attached to the 0.2.0 macOS version
- [x] final metadata validation passes
- [x] version is submitted with the owner-selected release mode

## Module Status

### TASK-005: Resolve Launch Crash And Resubmit 0.3.4

**Status**: Completed
**Parallelizable**: No
**Design Reference**: `design-docs/specs/design-macos-dmg-release.md#mac-app-store-distribution`
**Deliverables**: `src-tauri/Entitlements.appstore.plist.in`,
`src-tauri/tauri.appstore.conf.json`, `scripts/release-macos-app-store-local.sh`,
`src/features/workspace/WorkspaceShell.tsx`, focused frontend regression coverage,
`release/README.md`, a corrected signed replacement build, and App Review resubmission evidence.

**Completion Criteria**:

- [x] Read both Apple crash logs and reproduce the submitted package's startup failure
- [x] Confirm the unchanged executable launches under App Sandbox with the server entitlement
- [x] Require the server entitlement for the existing loopback media listener
- [x] Fall back to a selected-file workspace when Powerbox does not grant parent directory access
- [x] Build the replacement from the submitted source revision plus only the review corrections
- [x] Verify signed entitlements, installer signature, startup, file picker, and media preview
- [x] Upload build 4, wait for valid processing, and attach it to macOS version 0.3.4
- [x] Reply with the correction and observed verification, then resubmit to App Review
- [x] Independently verify the replacement build and submission state through the API

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
| Final submission | processed build and owner decisions | Submitted 0.3.4 build 4; waiting for Apple review |

## Completion Criteria

- [ ] repository verification passes
- [ ] no secret/profile material appears in Git history or release logs
- [x] signed sandboxed 0.2.0 app and package pass local validation
- [x] App Store Connect accepts and processes the build
- [x] macOS version is submitted to App Review

## Progress Log

### Session: 2026-10-01 (0.3.4 Build 4 Resubmitted)

**Tasks Completed**: Apple archive validation and upload both succeeded with no
errors. Build 4 processed to `VALID` and was attached to macOS version 0.3.4.
Sent the App Review reply explaining the reproduced startup crash, missing server
entitlement, selected-file Powerbox correction, and actual macOS 26.5.2 runtime
verification. The posted reply appeared as the second review message.
Marked the rejected item resolved through the documented App Store Connect API
and resubmitted the existing submission.

**Independent Verification**: A fresh read-only API request after submission
confirmed version 0.3.4 is `WAITING_FOR_REVIEW`, attached build 4 is `VALID`, and
the review submission is also `WAITING_FOR_REVIEW`.

**Remaining Work**: Apple approval is pending. Manual release remains configured;
this resubmission does not publish the app. Historical broader release QA items
remain tracked separately. No unrelated worktree changes were shipped.

### Session: 2026-10-01 (Final Build 4 Runtime And Package Verification)

**Tasks Completed**: Built the final signed 0.3.4 build 4 from revision `dcc7de4`
plus only the review corrections, including the final request race guard.
Verified the packaged executable is identical to the signed source bundle and
contains the current frontend assets. App signature, Apple-issued installer
signature, embedded profile, arm64 architecture, build number, and required
sandbox entitlements were checked. Apple archive validation succeeded with no errors.

**Runtime Verification**: On macOS 26.5.2, a local ad hoc runtime copy preserving
App Sandbox and file/network entitlements launched successfully. Native Powerbox
selection opened the exact MP4 in `src-tauri/tests/fixtures`, played real video,
and refreshed without a denied parent-directory error. Selecting the repository
README rendered Markdown successfully. Relative sibling images remained inaccessible
under the selected-file-only grant, as expected. No macOS 27.0 runtime test is claimed.

**Artifact**: `target/app-store/review-final/chilla-0.3.4-macos-aarch64.pkg`,
SHA-256 `3ac75aefadc54b28eb1980302f6db5a012552d456878ba41cddd98f7bd3ec0bc`.

**Tasks In Progress**: Apple accepted the upload with no errors. Processing, attachment, reviewer response, and resubmission remain pending.

### Session: 2026-10-01 (Powerbox Picker Correction)

**Tasks Completed**: Installer signing completed after owner Keychain approval.
The first signing task then failed because its shell script was edited while
running; rerunning the unchanged script produced a signature-valid package.
Runtime testing of that package exposed a separate single-file picker failure:
Powerbox granted the file but not its parent directory, and directory listing
prevented preview. Added a selected-file-set fallback while preserving normal
directory browsing, file/preview error reporting, and cancellation behavior.
Independent review identified and corrected a superseded-request race; request
ownership checks now prevent a delayed rejection from replacing a newer selection.

**Verification**: Both worktree and clean release-source typechecks passed.
Workspace DOM tests passed 53/53 in the worktree and 44/44 in the release clone;
open-file helper tests passed 7/7. Four new regressions cover denied parent
access, selected-file and preview failures, refresh, and obsolete request failure.
Independent verification rechecked typecheck, all 44 release workspace tests,
and the request ownership guards. The test environment uses
`NODE_OPTIONS=--no-experimental-webstorage` to avoid Node's experimental global
localStorage interfering with existing tests.

**Tasks In Progress**: Build the final signed package from submitted source
revision `dcc7de4` plus the sandbox and picker corrections. Unrelated existing
worktree changes are excluded. Final runtime verification, upload, processing,
reviewer response, and resubmission remain pending.

**Notes**: A compilation started before the final race correction embedded an
older frontend asset. Its package was not uploaded; the final build is being
rebuilt to include the independently reviewed assets. This is verified by
checking the current frontend asset path in the packaged executable.

### Session: 2026-10-01 (Launch Crash Reproduced And Corrected)

**Tasks Completed**: Read Apple's Guideline 2.1(a) rejection and both crash logs.
Both report `SIGABRT` through Tauri/Tao's launch callback. Expanded the submitted
0.3.4 package and reproduced the abort on macOS 26.5.2 using an ad hoc runtime
copy with App Sandbox retained. The startup log identifies the media server's
socket bind failing with `Operation not permitted`. Adding
`com.apple.security.network.server` to that runtime copy allowed the unchanged
executable to launch and display the file viewer. The listener remains bound to
`127.0.0.1` in existing Rust code.

Updated the entitlement template, build number to 4, release design and runbook,
and packaging task. The task can reuse a verified same-version signed app for
packaging corrections, checks unsigned executable equality, and now requires
the server entitlement. Shell syntax, plist values, source signature, unsigned
executable equality, and build 4's signed app/entitlements passed validation.

**Tasks In Progress**: Installer signing is live in the release task; runtime
picker/media verification, package upload/processing, attachment, reviewer reply,
and resubmission remain pending.

**Blockers**: `productbuild` is waiting for Keychain private-key authorization.
Computer Use explicitly denies access to Apple's SecurityAgent, so the owner
must approve the local prompt. The packaging process has not been canceled or
restarted. The packaged implementation workflow was attempted but fails schema
validation; package update reports its installed version is current.

**Notes**: Runtime-copy verification preserves App Sandbox and removes only
distribution-only signing identifiers/profile for local ad hoc execution. It
does not claim Store-installed validation or macOS 27.0 device testing. Crash
logs, signed apps, and diagnostic output are protected outside Git under
`/tmp/chilla-apple-review-evidence`. Unrelated development is excluded from the
replacement executable. No reviewer reply or resubmission has been sent yet.

### Session: 2026-10-01 (App Review Rejection Triage)

**Tasks Completed**: Queried the live App Store Connect API and confirmed macOS
version 0.3.4 is `REJECTED`, its attached build 3 remains `VALID`, and the review
submission is `UNRESOLVED_ISSUES` with a rejected version item. Attempted to read
the reviewer correspondence through Spaceship; Apple rejects the obsolete
`v1/resolutionCenterThreads` endpoint. Opened App Store Connect in Brave and
completed saved-credential sign-in up to Apple's two-factor verification screen.

**Tasks In Progress**: Obtain the actual rejection message, resolve each cited
issue, and resubmit for App Review.

**Blockers**: Reading reviewer correspondence requires the owner to complete
two-factor authentication in the open Brave tab. The API status alone does not
establish the rejection reason or justify a replacement build.

**Notes**: No resubmission has been performed. Existing unrelated worktree
changes were preserved. No credentials or personal contact details are recorded.

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

### Session: 2026-09-09 (Agreement And Content Rights)

**Tasks Completed**: Accepted the updated Apple Developer Program License
Agreement with explicit Account Holder authorization and saved confirmation that
Chilla has the necessary rights to display third-party content.

**Tasks In Progress**: TASK-002 runtime QA, TASK-003 privacy/compliance metadata,
and TASK-004 final validation and submission.

**Blockers**: Remaining privacy/compliance answers are required.

**Notes**: App Review contact information is complete in App Store Connect.
Personal review-contact values are intentionally not recorded in the repository.

### Session: 2026-09-09 (Mac Screenshots)

**Tasks Completed**: Captured and visually verified three truthful macOS
screenshots showing the rendered README, local Git diff review, and video
preview. Uploaded all three to the Mac screenshot set in App Store Connect at the
accepted 2560 by 1600 pixel size.

**Tasks In Progress**: TASK-002 installed-build runtime QA, TASK-003
privacy/compliance metadata, and TASK-004 final validation and submission.

**Blockers**: Remaining privacy/compliance answers are required before final
submission validation.

**Notes**: Screenshot source files remain local in Downloads and are not tracked
in Git. A temporary capture that exposed unrelated desktop windows was deleted
before upload; only Chilla-only captures were retained and uploaded.

### Session: 2026-09-26 (0.3.4 Submission Attempt)

**Tasks Completed**: Confirmed App Store Connect has macOS version 0.3.4 in
Prepare for Submission, with processed build 3 marked valid and attached.
Verified the listing has three desktop screenshots, description, support URL,
and review contact fields. Confirmed build 3 has no outstanding export compliance
declaration. Committed and pushed the matching App Store bundle version.

**Tasks In Progress**: TASK-003 App Privacy disclosure and TASK-004 review
submission.

**Blockers**: Apple rejected the review submission because answers about data
collection and use have not been published. The owner must provide the accurate
App Privacy declaration. Brave computer control is unavailable in this session,
so the required App Store Connect form cannot yet be completed through Brave.

**Notes**: The redundant local package rebuild reached successful app signing
but stalled during installer package creation and was stopped. The already
processed App Store build 3 remains valid and attached; no new upload is needed.

### Session: 2026-09-26 (0.3.4 Submitted For Review)

**Tasks Completed**: Published the owner-approved `Data Not Collected` App
Privacy response. Submitted macOS version 0.3.4 with valid build 3 to App Review
and independently verified both the version and review submission are in
`WAITING_FOR_REVIEW`.

**Tasks In Progress**: TASK-002 installed-build runtime QA and monitoring the
App Review result.

**Blockers**: App Store publication now depends on Apple review approval. The
configured release mode remains manual release after approval.

**Notes**: No additional package upload was needed. The App Store Connect API
confirmed build 3 remains valid and attached to version 0.3.4.
