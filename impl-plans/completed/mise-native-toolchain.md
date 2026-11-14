# Mise Native Toolchain Migration

**Status**: Completed
**Design Reference**: ../../design-docs/specs/architecture.md#mise-native-toolchain
**Created**: 2026-09-09
**Last Updated**: 2026-09-09

## Scope and Deliverables

Follow ign-template cd4284b7c942f3b1bc38b81212525830e6c99bb8 (tauri-v1),
retaining chilla-specific tests, E2E and signed macOS release tasks.
No remote release, installer execution into user profiles, or commit/push.

| Task | Deliverables | Status | Dependencies |
| --- | --- | --- | --- |
| 1 | mise.toml tasks/tool setup; native CI and macOS validation workflow | Completed | Template/reference review |
| 2 | Native tarball packaging, OS prerequisites, remove active Nix files/hints | Completed | Task 1 build contract |
| 3 | README/release/agent guidance; independent checks, build/package/launch | Completed | Tasks 1 and 2 |

## Completion Criteria

- [x] Development/CI/build/E2E tasks use mise without Nix.
- [x] Rust components and native Linux/macOS dependencies explicit.
- [x] Full Bun/DOM/Rust checks retained; workflow actions SHA-pinned and least privilege.
- [x] Native tarball task preserves installer filenames/layout/checksums, rejects Nix-linked binaries and avoids overwriting artifacts.
- [x] Obsolete bun.nix and active Nix release guidance removed; historical published-artifact caveats accurate.
- [x] Configuration/scripts validate, local mixed checks pass, native artifact and launch verified; Linux-only checks reported honestly.

## Progress Log

### 2026-09-09
Latest upstream tauri-v1 confirms mise tools/tasks with OS libraries installed
separately. Current repository has no flake.nix but CI still invokes Nix;
bun.nix is orphaned. Preserve preexisting website and macOS release changes.

Migration implemented and independently checked. `mise run check`, `lint-rust`,
`fmt-check`, and `test` passed: 39 Bun tests, 283 DOM tests, and 195 Rust tests.
App-scoped Biome passed (79 files); repository-wide lint remains affected by
unrelated website formatting. Shell syntax, packaging ShellCheck, workflow YAML
and pinned-action checks passed, including packaging refusal-path tests.

Built the native aarch64-darwin v0.1.19 tarball in a temporary output directory.
Checksum, archive layout, architecture, extracted version and system-only
linkage passed; the extracted application launched and remained running.
Linux CI/E2E was configured but not executed on this Mac. No release publication,
commit or push was performed. The skill quick-validator could not run because
the local Python environment lacks PyYAML; skill frontmatter was inspected.
