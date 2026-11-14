---
name: chilla-post-edit-launch
description: Use when code changes in this repository should be validated by actually launching the local chilla app. After modifying runtime-affecting code, rebuild the debug app when needed and launch `target/debug/chilla` yourself instead of telling the user to run it.
allowed-tools: Read, Grep, Bash
---

# Chilla Post-Edit Launch

Use this skill after code changes that affect the `chilla` app runtime, especially UI, startup, file browsing, Tauri wiring, or preview behavior.

## Core Rule

Do not ask the user to run `chilla` manually when you can do it locally.

After relevant code changes:

1. Rebuild the local debug app when the binary may be stale.
2. Launch `target/debug/chilla` yourself.
3. Reuse the user's repro arguments when they provided them.
4. Report the exact command and log path back to the user.

## When To Launch

Launch the app yourself when:
- frontend UI or interaction code changed under `src/`
- Tauri/backend runtime code changed under `src-tauri/`
- startup, navigation, preview, dialog, or window behavior changed
- the user asks you to verify runtime behavior

You can skip launching when:
- only docs, plans, or comments changed
- the user explicitly says not to run the app

## Build And Launch Workflow

### 1. Rebuild when needed

Prefer the repository debug build:

```bash
bun run tauri build --debug --no-bundle
```

Use this when Rust, Tauri config, or bundled frontend assets changed, or when you are unsure whether `target/debug/chilla` is current.

### 2. Launch the local binary yourself

No args:

```bash
nohup /absolute/path/to/repo/target/debug/chilla >/tmp/chilla-launch.log 2>&1 &
```

With repro args:

```bash
nohup /absolute/path/to/repo/target/debug/chilla <args...> >/tmp/chilla-launch.log 2>&1 &
```

Use an explicit log file under `/tmp/` and tell the user where it is.

### 3. Prefer the user’s reproduction command

If the user gave a concrete launch command or sample-file path, reuse it with the rebuilt binary rather than inventing a different startup path.

## Response Contract

After launching, tell the user:
- whether you rebuilt
- the exact launch command you executed
- the log file path

Do not push the launch step back to the user unless local execution is genuinely blocked.
