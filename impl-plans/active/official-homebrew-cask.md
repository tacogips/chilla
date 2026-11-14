# Official Homebrew Cask Implementation Plan

**Status**: In Progress
**Design Reference**: `design-docs/specs/design-macos-dmg-release.md#official-homebrew-cask-distribution`
**Created**: 2026-07-15
**Last Updated**: 2026-07-29

---

## Design Document Reference

**Source**: `design-docs/specs/design-macos-dmg-release.md`

### Summary

Publish `chilla` in `Homebrew/homebrew-cask` so macOS users can run
`brew install --cask chilla` without adding `tacogips/tap`.

### Scope

**Included**: Official cask eligibility checks, release artifact validation, cask
authoring and local verification, upstream pull request, merge verification, and
installation documentation migration.

**Excluded**: Artificially inflating repository popularity, bypassing Homebrew
policy, removing direct DMG distribution, and adding Intel support without an Intel
or universal release artifact.

---

## Deliverables

### 1. Release And Eligibility Evidence

**Status**: BLOCKED

Authoritative evidence:

- `tacogips/chilla` GitHub repository metrics satisfy Homebrew's self-submission
  threshold by reaching at least one of 90 forks, 90 watchers, or 225 stars.
- The stable DMG is Developer ID signed, notarized, and accepted by Gatekeeper.
- No prior refused `chilla` cask submission requires resolution.

**Checklist**:

- [ ] Homebrew self-submission notability threshold satisfied
- [x] Stable v0.1.11 DMG checksum recorded as `868f49519ebecf731a901c099adb6cb23784e765f93d2b82f79ec9f426b7a91f`
- [x] Stable v0.1.11 application verified as Developer ID signed and notarized
- [x] No prior `Homebrew/homebrew-cask` pull request or issue found for `chilla`

### 2. Official Cask Contribution

#### `Homebrew/homebrew-cask/Casks/c/chilla.rb`

**Status**: BLOCKED

The upstream cask will define version, immutable checksum, GitHub release URL,
name, description, homepage, GitHub livecheck, Apple Silicon dependency, app
artifact, and CLI binary artifact in official stanza order.

**Checklist**:

- [ ] Create the cask only after the notability gate passes
- [ ] Run `brew style --fix chilla`
- [ ] Run `brew audit --cask --new chilla`
- [ ] Verify clean install with `HOMEBREW_NO_INSTALL_FROM_API=1`
- [ ] Verify uninstall
- [ ] Open one minimal upstream pull request and disclose AI assistance
- [ ] Resolve CI and maintainer review

### 3. Tap-Free Documentation

#### `README.md`

**Status**: BLOCKED

After the official cask is merged and available through Homebrew's API, remove the
custom tap command from the primary installation flow and document
`brew install --cask chilla` as the supported Homebrew command.

**Checklist**:

- [ ] Official cask is merged and available through Homebrew's API
- [ ] Primary installation command no longer requires `tacogips/tap`
- [ ] Upgrade and uninstall guidance remains accurate
- [ ] Obsolete custom-tap caveats are removed

---

## Module Status

| Deliverable | File Path | Status | Verification |
| --- | --- | --- | --- |
| Release and eligibility evidence | GitHub and v0.1.11 DMG | BLOCKED | Metrics, `codesign`, `spctl` |
| Official cask | `Homebrew/homebrew-cask/Casks/c/chilla.rb` | BLOCKED | Audit, style, install, uninstall, upstream CI |
| Tap-free documentation | `README.md` | BLOCKED | Official API install smoke test |

## Dependencies

| Feature | Depends On | Status |
| --- | --- | --- |
| Cask submission | Homebrew self-submission notability threshold | BLOCKED: all metrics remain below threshold (0/90 forks, 0/90 watchers, 2/225 stars) |
| Documentation migration | Official cask merge and API availability | BLOCKED |

## Completion Criteria

- [ ] `brew info --cask chilla` resolves to `Homebrew/homebrew-cask`
- [ ] `brew install --cask chilla` succeeds without a custom tap
- [ ] Installed `chilla.app` passes Gatekeeper assessment
- [ ] The CLI binary artifact is available after installation
- [ ] `brew uninstall --cask chilla` succeeds
- [ ] Repository documentation describes the tap-free installation path accurately

## Progress Log

### Session: 2026-07-15

**Tasks Completed**: Confirmed the official eligibility rules; checked current
repository metrics and prior submissions; downloaded v0.1.11; recorded its SHA-256;
verified Developer ID signature, stapled notarization ticket, and Gatekeeper
acceptance; documented the official-cask design and plan; prepared a temporary
official-layout candidate that passes `brew style`; ran the online new-cask audit,
which downloaded the release successfully and reported only the notability failure.

**Tasks In Progress**: Waiting for objective upstream eligibility evidence.

**Blockers**: Homebrew rejects an owner-submitted cask while all repository metrics
remain below 90 forks, 90 watchers, and 225 stars. Current metrics are 0 forks, 0
watchers, and 2 stars; reaching any one threshold clears the automated gate.

**Notes**: Do not open a knowingly noncompliant upstream pull request or change the
README to claim tap-free installation before the official cask is merged.

### Session: 2026-07-15 (Eligibility Semantics Audit)

**Tasks Completed**: Inspected Homebrew's installed `SharedAudits.github` source and
executed the self-submission audit path directly against `tacogips/chilla`.

**Tasks In Progress**: Waiting for one objective notability metric to satisfy the
self-submission audit.

**Blockers**: The direct audit reports `Self-submitted GitHub repository not notable
enough (<90 forks, <90 watchers and <225 stars)`. Its source combines the three
comparisons with logical AND, so reaching any one threshold clears this gate.

**Notes**: Corrected the earlier cumulative interpretation. The most realistic
eligibility route is 225 stars; artificial popularity or submission through an
unrelated account is out of scope and contrary to the policy's intent.

### Session: 2026-07-15 (Third Blocker Audit)

**Tasks Completed**: Rechecked GitHub metrics, searched the official cask repository
and pull requests, queried Homebrew's cask index, and reran the direct
self-submission notability audit.

**Tasks In Progress**: None; safe in-scope work is exhausted until external
eligibility changes.

**Blockers**: Unchanged for three consecutive goal turns: 0 forks, 0 watchers, and
2 stars; no official cask or pull request; direct audit failure remains
`Self-submitted GitHub repository not notable enough (<90 forks, <90 watchers and
<225 stars)`.

**Notes**: Resume the plan when any one threshold is reached or Homebrew grants a
documented exception. Then regenerate the cask for the latest stable release before
opening the upstream pull request.

### Session: 2026-07-29 (Continuation Blocker Audit)

**Tasks Completed**: Rechecked the repository through the authenticated GitHub API;
confirmed v0.1.11 remains the latest stable release; searched the official cask
repository and its pull requests; queried Homebrew's cask API; and inspected the
current Homebrew 6.0.13 audit implementation and owner-submission multiplier.

**Tasks In Progress**: None; the upstream eligibility gate still prevents a
policy-compliant cask contribution.

**Blockers**: Unchanged: `tacogips/chilla` has 0 forks, 0 watchers, and 2 stars,
below all owner-submission thresholds of 90 forks, 90 watchers, or 225 stars.
There is no official `chilla` cask, upstream pull request, or documented exception.

**Notes**: The direct `SharedAudits.github` invocation could not authenticate because
Homebrew read a stale GitHub credential from the macOS keychain. No credential was
modified. The authenticated GitHub API metrics and current Homebrew source are
sufficient to prove the notability condition fails. Resume after an objective
eligibility change, then regenerate and validate the cask against the latest stable
release before submission.

## Related Plans

- **Previous**: `impl-plans/completed/macos-dmg-local-signing-release.md`
- **Next**: None
- **Depends On**: `impl-plans/completed/macos-dmg-release.md`, `impl-plans/completed/macos-dmg-local-signing-release.md`
