# Apple Developer And App Store Connect Release

Use this reference only for a requested Apple or Mac App Store release. Treat
Apple Developer registration, package delivery, App Store Connect metadata, and
App Review submission as one release workflow rather than ending at upload.

## Release Sequence

1. Confirm the version, bundle identifier, product name, platform, architecture,
   pricing, territories, release timing, copyright, and review contact.
2. Verify or create the explicit App ID and a Mac App Store provisioning profile
   matching the bundle identifier and installed Apple Distribution identity.
3. Build and validate the sandboxed package with:

   ```bash
   kinko exec --env APPLE_TEAM_ID -- env \
     CHILLA_APP_STORE_PROFILE=/absolute/path/to/chilla.provisionprofile \
     mise run release-macos-app-store-local -- build
   ```

4. Verify the app signature, installer signature, embedded profile, effective
   sandbox entitlements, version, architecture, and absence of secret material.
5. Create or update the App Store Connect macOS app and version record. Use the
   exact shipped bundle identifier and version; do not create duplicate records
   to work around a metadata error.
6. Populate product metadata, support/privacy URLs, category, copyright, pricing,
   availability, release mode, content rights, age rating, privacy, encryption,
   and App Review contact/notes. Do not invent legal or business answers.
7. Upload the validated package with:

   ```bash
   kinko exec --env APPLE_TEAM_ID,APPLE_ID,APPLE_PASSWORD -- env \
     CHILLA_APP_STORE_PROFILE=/absolute/path/to/chilla.provisionprofile \
     mise run release-macos-app-store-local -- upload
   ```

8. Wait for processing to finish, inspect any warnings, attach the processed
   build to the version, and verify the extracted app icon and build metadata.
9. Capture the real Chilla UI for macOS screenshots. Use a size accepted by App
   Store Connect: 1280 by 800, 1440 by 900, 2560 by 1600, or 2880 by 1800 pixels.
   Visually inspect every capture, reject captures containing unrelated windows
   or private data, and upload distinct representative views.
10. Run final metadata validation. Resolve actionable errors, add the version for
    review, and submit it when the user's Apple release request includes
    submission and all owner-controlled answers are available.
11. Verify the resulting App Store Connect state and record non-sensitive release
    evidence in the active implementation plan or release log.

## Authorization Boundaries

- Never accept a new or updated Apple legal agreement without explicit
  action-time authorization from the Account Holder. Explain that acceptance
  legally binds the developer account.
- Do not infer content-rights, privacy, encryption, age-rating, regulated-content,
  trader-status, pricing, territory, copyright, or release-timing answers when
  the correct value depends on the owner. Ask only for missing decisions that
  materially block progress.
- An explicit request to release/register the app with Apple covers routine App
  Store Connect mutations and App Review submission, but not acceptance of new
  legal terms, paid contracts, tax/banking enrollment, or unrelated account
  changes.
- Keep review contact details, Apple IDs, passwords, team identifiers, private
  keys, certificates, profiles, and API credentials out of Git, logs, screenshots,
  and final responses. Redact identifiers when evidence does not require them.
- Run secret-dependent commands through `kinko exec`. Provisioning profiles and
  generated entitlements must remain outside Git and in protected temporary
  storage where practical.

## UI And Verification

Prefer App Store Connect APIs or purpose-built release commands when they cover
the operation. Use the macOS Computer Use workflow for authenticated web UI
steps, screenshot capture, or visual verification that APIs cannot provide.

After upload, do not report completion until the requested terminal state is
observed. Distinguish these states in status reports:

- package validation succeeded
- package upload was accepted
- Apple processing completed
- build attached to the version
- metadata validation passed
- version added for review
- version submitted to App Review
- version approved
- manually released or automatically published

For manual release, approval is not publication. Report that the Account Holder
must explicitly release the approved version, or perform that final release only
when it is part of the user's current instruction.
