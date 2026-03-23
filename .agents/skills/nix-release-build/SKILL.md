---
name: nix-release-build
description: Use when building and publishing release artifacts for this repository with `nix build`, especially for Darwin Tauri releases. Covers flake target selection, artifact packaging, GitHub release creation, and validation of downloaded release binaries.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob
user-invocable: true
---

# Nix Release Build Skill

This skill provides the repository-specific workflow for producing release artifacts with `nix build` and publishing them as GitHub releases.

## When to Apply

Apply this skill when:
- Building a release artifact with `nix build`
- Creating a Darwin release for this Tauri application
- Packaging Nix build outputs into a distributable archive
- Publishing or verifying GitHub releases for this repository

## Repository Facts

- The flake defines the release package as `.#chilla`.
- `README.md` documents `task nix-build` as `nix build .#chilla`.
- `src-tauri/tauri.conf.json` currently sets `"bundle": { "active": false }`.
- The release output is therefore the flake package layout, not a `.app` bundle or `.dmg`.

On Darwin, the current package layout is:

```text
result/
├── bin/chilla
└── lib/
```

## Build Workflow

### 1. Confirm the target

Check the local architecture first:

```bash
uname -sm
```

Use the native flake package unless the user explicitly requests another system:

```bash
nix build .#chilla
```

If the task is to inspect outputs before building, use:

```bash
nix flake show --json .
```

### 2. Verify the Nix output

After the build:

```bash
ls -la result
find -L result -maxdepth 4 | sort
file result/bin/chilla
otool -L result/bin/chilla | sed -n '1,40p'
```

Confirm that:
- `result` points to the built store path
- `result/bin/chilla` exists
- the binary matches the intended Darwin architecture

### 3. Package a release artifact

The preferred release artifact is a versioned tarball copied out of the Nix store:

```bash
mkdir -p release
cp -RL result release/chilla-v<version>-aarch64-darwin
tar -C release -czf release/chilla-v<version>-aarch64-darwin.tar.gz chilla-v<version>-aarch64-darwin
shasum -a 256 release/chilla-v<version>-aarch64-darwin.tar.gz
shasum -a 256 release/chilla-v<version>-aarch64-darwin/bin/chilla > release/chilla-v<version>-aarch64-darwin.sha256
```

Adjust the architecture suffix if the build target is not `aarch64-darwin`.

## GitHub Release Workflow

### Preconditions

Before creating the release:
- ensure `git status --short --branch` is understood
- identify the target commit with `git rev-parse HEAD`
- check existing tags with `git tag --sort=-creatordate`
- verify `gh auth status`

### Release creation

Use a semver tag unless the user specifies a different versioning scheme.

1. Create and push the tag:

```bash
git tag -a v<version> <commit> -m "Release v<version>"
git push origin refs/tags/v<version>
```

2. Create the GitHub release and upload assets:

```bash
gh release create v<version> \
  --repo tacogips/chilla \
  --target <commit> \
  --title "chilla v<version>" \
  --notes-file /tmp/chilla-release-notes.md \
  release/chilla-v<version>-<target>.tar.gz \
  release/chilla-v<version>-<target>.sha256
```

3. Verify the release:

```bash
gh release view v<version> --repo tacogips/chilla --json url,isDraft,assets
```

If `gh release create` partially succeeds or leaves a draft in an odd state, inspect the release with `gh api repos/tacogips/chilla/releases` and repair it before reporting success.

## Download-and-Run Verification

When asked to verify the published artifact:

1. Download into `/tmp`
2. Verify the tarball checksum
3. Extract the archive
4. Launch the downloaded binary from the extracted directory
5. Confirm the process stays alive for a short interval

Representative commands:

```bash
mkdir -p /tmp/chilla-release-check
curl -L -o /tmp/chilla-release-check/chilla-v<version>-<target>.tar.gz \
  https://github.com/tacogips/chilla/releases/download/v<version>/chilla-v<version>-<target>.tar.gz
shasum -a 256 /tmp/chilla-release-check/chilla-v<version>-<target>.tar.gz
tar -xzf /tmp/chilla-release-check/chilla-v<version>-<target>.tar.gz -C /tmp/chilla-release-check
cd /tmp/chilla-release-check/chilla-v<version>-<target> && ./bin/chilla
```

Useful checks:

```bash
ps -p <pid> -o pid=,stat=,etime=,command=
osascript -e 'tell application "System Events" to get name of every process whose name contains "chilla"'
```

## Important Caveat

The current Darwin release artifact is not fully self-contained for non-Nix systems.

`otool -L result/bin/chilla` may show dependencies from `/nix/store`, for example `libiconv`. When this is true:
- report that the release was validated on a Nix-enabled Darwin machine
- do not describe the artifact as a universal standalone macOS distribution
- call out that `.app` or `.dmg` packaging would require additional packaging work beyond the current `nix build .#chilla` path

## Reporting Requirements

When finishing a release task, report:
- the exact `nix build` target used
- the target commit and tag
- the release URL
- the artifact filenames
- the checksum you verified
- whether the downloaded binary was launched successfully
- whether the artifact is Nix-dependent or self-contained
