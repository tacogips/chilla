---
name: riela-workflow-checkout
description: Use when installing a riela workflow bundle from a public GitHub directory URL with workflow checkout. Covers project/user scope destinations, duplicate handling, overwrite behavior, registry metadata, validation, and checkout troubleshooting.
metadata:
  short-description: Checkout GitHub workflow bundles
---

# Riela Workflow Checkout

Use this skill when the user wants to install, import, check out, replace, or troubleshoot a riela workflow bundle from GitHub with `workflow checkout`.

When the target is a registry package id rather than a raw GitHub workflow
directory URL, prefer the package lifecycle commands:

```bash
riela package install <package-id>
riela package list
riela package remove <workflow-name-or-package-id>
```

Use `package list --output json` to show installed package versions, package
hashes/checksums, install ids, workflow destinations, and installed skill
metadata. Use `package remove --install-id <install-id>` when multiple package
records may match the same package or workflow name; removal deletes the
recorded workflow install plus managed/projected package skills.

For running, listing, validating, inspecting, or monitoring existing workflows, use `riela-workflow-run` instead.

## Command

Inside this repository, prefer:

```bash
riela workflow checkout <github-directory-url>
```

When riela is installed, prefer:

```bash
riela workflow checkout <github-directory-url>
```

Supported URL shape:

```text
https://github.com/<owner>/<repo>/tree/<ref>/<workflow-directory-path>
```

Common source layout:

```text
https://github.com/<owner>/<repo>/tree/<ref>/.riela/workflows/<workflow-name>
```

## Behavior

- The source must be a public `https://github.com` directory URL.
- The final URL path segment becomes the workflow name and must pass the normal safe workflow-name rule.
- Branch or tag refs containing slashes are supported only when the GitHub directory can be resolved unambiguously. If multiple ref/path splits resolve, checkout fails with `AMBIGUOUS_GITHUB_DIRECTORY_URL`.
- Checkout fetches the remote directory into temporary staging, then validates it as a workflow bundle before writing the destination.
- Project scope is the default destination:

```text
<project-root>/.riela/workflows/<workflow-name>
```

- If no project `.riela` exists, project-scope checkout creates:

```text
<cwd>/.riela/workflows/<workflow-name>
```

- `--project-root <path>` or `RIEL_PROJECT_ROOT` can make the project scope explicit.
- Add `--scope user` to install under:

```text
<user-root>/workflows/<workflow-name>
```

- `--user-root <path>` or `RIEL_USER_ROOT` can override the user root. The checkout registry is always written under the resolved user root, including project-scope checkouts.
- Add `--workflow-definition-dir <path>` to bypass scoped workflow catalogs and install directly under:

```text
<path>/<workflow-name>
```

The registry record is still written under the resolved user root.

- Duplicate checkouts fail when the destination directory or registry record already exists.
- Add `--overwrite` only when the user explicitly wants replacement. The implementation validates the newly staged bundle before replacing the existing destination.
- Each successful checkout writes provenance under:

```text
<user-root>/workflow-registry/checkouts/<scope>-<workflow-name>.json
```

The registry record includes the workflow name, source URL, scope, checkout time, and destination directory.

Text output prints the checked-out workflow name, scope, destination, and registry path. `--output json` returns `workflowName`, `sourceUrl`, `scope`, `destinationDirectory`, `registryPath`, `validationStatus`, and `overwritten`.

## Standard Workflow

1. Confirm the source URL points to a single workflow directory containing `workflow.json`.
2. Choose scope:
   - Default to project scope unless the user asks for user-wide installation.
   - Use `--scope user` for user-wide installation.
   - Use `--project-root` or `--user-root` only when the destination root must be explicit.
   - Use `--workflow-definition-dir` only when the user wants a direct workflow definition directory destination.
3. Reject or remove conflicting remote-control options before running checkout:
   - Do not run against `--endpoint`.
4. For duplicates, run without `--overwrite` first unless the user explicitly requested replacement.
5. Use `--output json` when the result will be parsed or saved.
6. After checkout, optionally validate or list from scoped catalog lookup:

```bash
riela workflow validate <workflow-name>
riela workflow list
```

## Examples

Project-scope checkout:

```bash
riela workflow checkout \
  https://github.com/<owner>/<repo>/tree/<ref>/.riela/workflows/<workflow-name>
```

User-scope checkout:

```bash
riela workflow checkout \
  https://github.com/<owner>/<repo>/tree/<ref>/.riela/workflows/<workflow-name> \
  --scope user
```

Replace an existing checkout after staged validation succeeds:

```bash
riela workflow checkout \
  https://github.com/<owner>/<repo>/tree/<ref>/.riela/workflows/<workflow-name> \
  --overwrite
```

Machine-readable result:

```bash
riela workflow checkout \
  https://github.com/<owner>/<repo>/tree/<ref>/.riela/workflows/<workflow-name> \
  --output json
```

Explicit project root:

```bash
riela workflow checkout \
  https://github.com/<owner>/<repo>/tree/<ref>/.riela/workflows/<workflow-name> \
  --project-root /path/to/project/.riela
```

Direct workflow definition directory:

```bash
riela workflow checkout \
  https://github.com/<owner>/<repo>/tree/<ref>/.riela/workflows/<workflow-name> \
  --workflow-definition-dir /path/to/workflow-definitions
```

## Guardrails

- Use `--workflow-definition-dir` only for a direct local workflow definition directory; it writes to `<path>/<workflow-name>` instead of a scoped catalog.
- Do not combine checkout with `--endpoint`; checkout is local-only.
- Do not use checkout for arbitrary filesystem copies or non-GitHub sources.
- Do not assume a slash-containing branch or tag name is safe if checkout reports an ambiguous URL; ask the user for a less ambiguous ref or directory path.
- Do not add backend-specific checkout behavior for Codex, Claude, Cursor, OpenAI, or Anthropic. Backends are validated through the normal workflow bundle validation path after checkout.
- Do not use `--overwrite` unless the user asked to replace the existing checkout or approved the duplicate replacement.

## Troubleshooting

- `UNSUPPORTED_SOURCE_URL`: use a public `https://github.com` directory URL.
- `INVALID_SOURCE_URL`: ensure the URL includes `/tree/<ref>/<workflow-directory-path>`.
- `AMBIGUOUS_GITHUB_DIRECTORY_URL`: the URL could resolve through multiple ref/path splits; use a less ambiguous ref or path.
- `INVALID_REMOTE_DIRECTORY`: confirm the URL resolves to a directory rather than a file and that the selected directory exists for the ref.
- `INVALID_WORKFLOW_NAME`: rename the remote workflow directory to a safe workflow name.
- `DUPLICATE_CHECKOUT`: rerun with `--overwrite` only if replacement is intended.
- `USAGE`: remove unsupported checkout options such as `--endpoint`.
- `VALIDATION`: inspect the remote bundle for invalid `workflow.json`, missing node payloads, missing prompt files, invalid step/node references, or unsafe workflow-local file paths.
- `FETCH_FAILED`: confirm the repository, ref, directory path, and network access.
