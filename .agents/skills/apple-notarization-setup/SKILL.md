---
name: apple-notarization-setup
description: Use when setting up or verifying Apple Developer ID signing credentials, Apple app-specific passwords, kinko secret storage, or local macOS notarization readiness for chilla without recording credential values.
---

# Apple Notarization Setup

Use this for chilla macOS signing/notarization setup before local deploys or release builds. Keep all credential values out of logs, skill files, commits, and final responses.

## Credential Safety

- Never print, paste, commit, or summarize actual Apple passwords, app-specific passwords, certificate passwords, private keys, `.p12` contents, or kinko secret values.
- It is acceptable to mention secret key names such as `APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID`, and `APPLE_SIGNING_IDENTITY`.
- When a private login, passkey, or 2FA step is needed, use Computer Use to navigate to the prompt, then ask the user to enter it directly in the browser or system dialog.
- Use `kinko exec --env ...` for commands that need secrets. Do not use commands that echo exported secret values.

## Required Local Inputs

The local notarization path expects:

- A valid Developer ID Application certificate imported into the macOS login keychain.
- `APPLE_SIGNING_IDENTITY` stored in kinko.
- `APPLE_ID` stored in kinko.
- `APPLE_TEAM_ID` stored in kinko.
- `APPLE_PASSWORD` stored in kinko as an Apple app-specific password.

Check presence only:

```bash
kinko exec --env APPLE_SIGNING_IDENTITY,APPLE_ID,APPLE_PASSWORD,APPLE_TEAM_ID -- bash -lc '
for key in APPLE_SIGNING_IDENTITY APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID; do
  if [ -n "${!key:-}" ]; then echo "$key=present"; else echo "$key=missing"; fi
done
'
```

Check the local certificate:

```bash
security find-identity -v -p codesigning
```

Expect a valid `Developer ID Application` identity matching `APPLE_SIGNING_IDENTITY`.

## App-Specific Password Flow

Use Computer Use for browser navigation when requested.

1. Open `https://account.apple.com/account/manage`.
2. Ask the user to complete Apple Account login, passkey, and 2FA directly in Safari.
3. Open `Sign-In and Security`.
4. Open `App-Specific Passwords`.
5. Generate a password with a label such as `Chilla`.
6. Store it in kinko as `APPLE_PASSWORD`.
7. Do not include the generated password in chat, commits, or files.

Use kinko storage:

```bash
kinko set-key APPLE_PASSWORD --value '<app-specific-password>'
```

After storage, avoid showing the value again. If the browser dialog is still open, close it after confirming the password is stored.

## Local Build And Notarization

Prefer the existing macOS release skill and tasks for actual packaging. The common local command is:

```bash
kinko exec --env APPLE_SIGNING_IDENTITY,APPLE_ID,APPLE_PASSWORD,APPLE_TEAM_ID -- task bundle-macos-dmg
```

This builds:

- `target/release/bundle/macos/chilla.app`
- `target/release/bundle/dmg/*.dmg` after notarization and DMG packaging complete

Cargo commands must use `CARGO_TERM_QUIET=true` when invoked directly.

## Nix Environment Notarytool Workaround

In this repository's Nix shell, `xcrun` may point at the Nix Apple SDK and fail with:

```text
tool 'notarytool' not found
```

Do not replace the whole build environment with the system Xcode `DEVELOPER_DIR`; that can break Nix SDK linking. Instead, create a temporary `notarytool` wrapper and keep the Nix build environment intact:

```bash
tmp_notary_dir=/tmp/chilla-notarytool-wrapper
mkdir -p "$tmp_notary_dir"
printf '%s\n' \
  '#!/usr/bin/env bash' \
  'exec /Applications/Xcode.app/Contents/Developer/usr/bin/notarytool "$@"' \
  > "$tmp_notary_dir/notarytool"
chmod 700 "$tmp_notary_dir/notarytool"

kinko exec --env APPLE_SIGNING_IDENTITY,APPLE_ID,APPLE_PASSWORD,APPLE_TEAM_ID -- bash -lc '
  export PATH="/tmp/chilla-notarytool-wrapper:$PATH"
  task bundle-macos-dmg
'
```

If `/Applications/Xcode.app/Contents/Developer/usr/bin/notarytool` is unavailable, check:

```bash
/usr/bin/mdfind 'kMDItemFSName == "notarytool"'
```

## Notarization Status

When Tauri submits notarization, record only the submission ID and status. To check status:

```bash
kinko exec --env APPLE_ID,APPLE_PASSWORD,APPLE_TEAM_ID -- bash -lc '
/Applications/Xcode.app/Contents/Developer/usr/bin/notarytool info <submission-id> \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID"
'
```

Look for:

```text
status: Accepted
```

Recent submissions:

```bash
kinko exec --env APPLE_ID,APPLE_PASSWORD,APPLE_TEAM_ID -- bash -lc '
/Applications/Xcode.app/Contents/Developer/usr/bin/notarytool history \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_PASSWORD" \
  --team-id "$APPLE_TEAM_ID"
'
```

If a submission stays `In Progress`, do not claim deployment is complete. Report that Apple has not returned a decision yet.

## Validation After Acceptance

After notarization is accepted and artifacts exist:

```bash
codesign --verify --deep --strict --verbose=2 target/release/bundle/macos/chilla.app
xcrun stapler validate target/release/bundle/macos/chilla.app
xcrun stapler validate target/release/bundle/dmg/*.dmg
spctl --assess --type execute --verbose=4 target/release/bundle/macos/chilla.app
spctl --assess --type open --context context:primary-signature --verbose=4 target/release/bundle/dmg/*.dmg
```

If `xcrun stapler` cannot find tools due to the Nix SDK, call the Xcode tool directly when appropriate:

```bash
/Applications/Xcode.app/Contents/Developer/usr/bin/stapler validate target/release/bundle/macos/chilla.app
```

## Completion Criteria

Local Apple setup is complete when:

- kinko has all required Apple secret keys present.
- `security find-identity` reports a valid Developer ID Application identity.
- `task bundle-macos-dmg` or the wrapper-based equivalent signs the app.
- Notarization reaches `Accepted`.
- Stapler and Gatekeeper validation pass for the app and DMG.
