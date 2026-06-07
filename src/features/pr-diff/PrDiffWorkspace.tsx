import {
  For,
  Show,
  createMemo,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
} from "solid-js";
import { openUrl } from "@tauri-apps/plugin-opener";
import { isEditableKeyboardTarget } from "../../lib/keyboard";
import type {
  DiffWorkspaceTarget,
  GitHubDiffSource,
  PrDiffChange,
  PrDiffChunk,
  PrDiffFile,
  PrDiffFileText,
  PrDiffSnapshot,
} from "../../lib/tauri/document";
import {
  loadGitDiff,
  loadPrDiff,
  loadPrDiffFileText,
  PrFileStatus,
} from "../../lib/tauri/document";

type DiffViewMode = "left_right" | "full_file" | "stack";
type SyntaxKind =
  | "plain"
  | "javascript"
  | "rust"
  | "shell"
  | "json"
  | "markdown"
  | "css"
  | "toml"
  | "yaml";
interface SyntaxSegment {
  readonly kind:
    | "plain"
    | "keyword"
    | "string"
    | "comment"
    | "number"
    | "punctuation"
    | "markup";
  readonly text: string;
}
type BrowserEntry =
  | {
      readonly kind: "directory";
      readonly name: string;
      readonly path: string;
      readonly fileCount: number;
      readonly additions: number;
      readonly deletions: number;
    }
  | {
      readonly kind: "file";
      readonly name: string;
      readonly path: string;
      readonly file: PrDiffFile;
    };

interface PrDiffWorkspaceProps {
  readonly target: DiffWorkspaceTarget;
}

interface LazyFileTextState {
  readonly loading: boolean;
  readonly text: PrDiffFileText | null;
  readonly error: string | null;
}

const MIN_DIFF_PAGE_SCROLL_PX = 80;
const DIFF_PAGE_SCROLL_RATIO = 0.45;

type FullFileLineKind = "context" | "add" | "modify";
type FullFileRow =
  | {
      readonly kind: "line";
      readonly lineKind: FullFileLineKind;
      readonly lineNumber: number;
      readonly content: string;
    }
  | {
      readonly kind: "deletion-marker";
      readonly position: number;
      readonly deletedCount: number;
    };

function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function basename(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? path : path.slice(index + 1);
}

function parentDir(path: string): string | null {
  if (path.length === 0) {
    return null;
  }

  return dirname(path);
}

function matchesCtrlShortcut(event: KeyboardEvent, key: "d" | "u"): boolean {
  const shortcutCode = `Key${key.toUpperCase()}`;

  return (
    (event.key.toLowerCase() === key || event.code === shortcutCode) &&
    event.ctrlKey &&
    !event.metaKey &&
    !event.altKey &&
    !event.shiftKey
  );
}

function scrollDiffPane(
  body: HTMLElement | undefined,
  direction: 1 | -1,
): void {
  if (body === undefined) {
    return;
  }

  const delta =
    Math.max(
      MIN_DIFF_PAGE_SCROLL_PX,
      Math.floor(body.clientHeight * DIFF_PAGE_SCROLL_RATIO),
    ) * direction;
  body.scrollTop += delta;
}

function statusLabel(file: PrDiffFile): string {
  switch (file.status) {
    case PrFileStatus.Added:
      return "A";
    case PrFileStatus.Deleted:
      return "D";
    case PrFileStatus.Renamed:
      return "R";
    case PrFileStatus.Copied:
      return "C";
    case PrFileStatus.Modified:
      return "M";
    default:
      return "?";
  }
}

function syntaxKindForPath(path: string): SyntaxKind {
  const name = basename(path).toLowerCase();
  const extension = name.includes(".") ? name.split(".").pop() : "";

  if (
    ["js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts"].includes(
      extension ?? "",
    )
  ) {
    return "javascript";
  }

  if (extension === "rs") {
    return "rust";
  }

  if (
    ["sh", "bash", "zsh", "ksh", "env"].includes(extension ?? "") ||
    [".bashrc", ".zshrc", ".profile", "bash", "sh", "zsh"].includes(name)
  ) {
    return "shell";
  }

  if (["json", "jsonc"].includes(extension ?? "")) {
    return "json";
  }

  if (["md", "markdown"].includes(extension ?? "")) {
    return "markdown";
  }

  if (["css", "scss", "sass"].includes(extension ?? "")) {
    return "css";
  }

  if (extension === "toml") {
    return "toml";
  }

  if (["yaml", "yml"].includes(extension ?? "")) {
    return "yaml";
  }

  return "plain";
}

function keywordSetForSyntax(syntaxKind: SyntaxKind): ReadonlySet<string> {
  switch (syntaxKind) {
    case "javascript":
      return new Set([
        "async",
        "await",
        "break",
        "case",
        "catch",
        "class",
        "const",
        "continue",
        "default",
        "else",
        "export",
        "extends",
        "false",
        "finally",
        "for",
        "from",
        "function",
        "if",
        "import",
        "in",
        "interface",
        "let",
        "new",
        "null",
        "return",
        "throw",
        "true",
        "try",
        "type",
        "undefined",
        "while",
      ]);
    case "rust":
      return new Set([
        "as",
        "async",
        "await",
        "break",
        "const",
        "crate",
        "else",
        "enum",
        "false",
        "fn",
        "for",
        "if",
        "impl",
        "let",
        "match",
        "mod",
        "mut",
        "pub",
        "return",
        "self",
        "struct",
        "true",
        "type",
        "use",
        "where",
      ]);
    case "shell":
      return new Set([
        "case",
        "do",
        "done",
        "elif",
        "else",
        "esac",
        "export",
        "fi",
        "for",
        "function",
        "if",
        "in",
        "local",
        "then",
        "while",
      ]);
    case "json":
      return new Set(["false", "null", "true"]);
    case "css":
      return new Set(["important"]);
    case "toml":
    case "yaml":
      return new Set(["false", "true", "null"]);
    case "markdown":
    case "plain":
      return new Set();
  }
}

function commentStartForSyntax(
  content: string,
  syntaxKind: SyntaxKind,
): number {
  if (
    syntaxKind === "javascript" ||
    syntaxKind === "rust" ||
    syntaxKind === "json"
  ) {
    return content.indexOf("//");
  }

  if (
    syntaxKind === "shell" ||
    syntaxKind === "toml" ||
    syntaxKind === "yaml"
  ) {
    return content.indexOf("#");
  }

  if (syntaxKind === "css") {
    return content.indexOf("/*");
  }

  return -1;
}

function pushSyntaxSegment(
  segments: SyntaxSegment[],
  kind: SyntaxSegment["kind"],
  text: string,
): void {
  if (text.length > 0) {
    segments.push({ kind, text });
  }
}

function highlightMarkdownSegments(content: string): readonly SyntaxSegment[] {
  const segments: SyntaxSegment[] = [];
  let index = 0;

  const heading = content.match(/^#{1,6}(?=\s)/);
  if (heading !== null) {
    pushSyntaxSegment(segments, "markup", heading[0]);
    index = heading[0].length;
  }

  const listMarker = content.slice(index).match(/^(\s*)([-*+]|\d+[.)])(?=\s)/);
  if (listMarker !== null) {
    pushSyntaxSegment(segments, "plain", listMarker[1] ?? "");
    pushSyntaxSegment(segments, "punctuation", listMarker[2] ?? "");
    index += listMarker[0].length;
  }

  while (index < content.length) {
    const rest = content.slice(index);
    const inlineCode = rest.match(/^`+[^`]+`+/);
    if (inlineCode !== null) {
      pushSyntaxSegment(segments, "string", inlineCode[0]);
      index += inlineCode[0].length;
      continue;
    }

    const link = rest.match(/^\[[^\]]+\]\([^)]+\)/);
    if (link !== null) {
      pushSyntaxSegment(segments, "markup", link[0]);
      index += link[0].length;
      continue;
    }

    const frontMatterKey = rest.match(/^[A-Za-z0-9_-]+(?=\s*:)/);
    if (frontMatterKey !== null) {
      pushSyntaxSegment(segments, "keyword", frontMatterKey[0]);
      index += frontMatterKey[0].length;
      continue;
    }

    const number = rest.match(/^\d+(?:\.\d+)?/);
    if (number !== null) {
      pushSyntaxSegment(segments, "number", number[0]);
      index += number[0].length;
      continue;
    }

    const char = content[index] ?? "";
    if (/[\[\]{}():;,.=<>/+*-]/.test(char)) {
      pushSyntaxSegment(segments, "punctuation", char);
      index += 1;
      continue;
    }

    pushSyntaxSegment(segments, "plain", char);
    index += 1;
  }

  return segments.length === 0 ? [{ kind: "plain", text: content }] : segments;
}

function highlightSyntaxSegments(
  content: string,
  syntaxKind: SyntaxKind,
): readonly SyntaxSegment[] {
  if (syntaxKind === "plain" || content.length === 0) {
    return [{ kind: "plain", text: content }];
  }

  if (syntaxKind === "markdown") {
    return highlightMarkdownSegments(content);
  }

  const commentStart = commentStartForSyntax(content, syntaxKind);
  const body = commentStart >= 0 ? content.slice(0, commentStart) : content;
  const comment = commentStart >= 0 ? content.slice(commentStart) : "";
  const keywords = keywordSetForSyntax(syntaxKind);
  const segments: SyntaxSegment[] = [];
  let index = 0;

  while (index < body.length) {
    const char = body[index] ?? "";

    if (char === '"' || char === "'") {
      let end = index + 1;
      while (end < body.length) {
        const current = body[end];
        if (current === "\\" && end + 1 < body.length) {
          end += 2;
          continue;
        }
        end += 1;
        if (current === char) {
          break;
        }
      }
      pushSyntaxSegment(segments, "string", body.slice(index, end));
      index = end;
      continue;
    }

    if (/\d/.test(char)) {
      const match = body.slice(index).match(/^\d+(?:\.\d+)?/);
      const text = match?.[0] ?? char;
      pushSyntaxSegment(segments, "number", text);
      index += text.length;
      continue;
    }

    if (/[A-Za-z_]/.test(char)) {
      const match = body.slice(index).match(/^[A-Za-z_][A-Za-z0-9_-]*/);
      const text = match?.[0] ?? char;
      pushSyntaxSegment(
        segments,
        keywords.has(text) ? "keyword" : "plain",
        text,
      );
      index += text.length;
      continue;
    }

    if (/[\[\]{}():;,.=<>/+*-]/.test(char)) {
      pushSyntaxSegment(segments, "punctuation", char);
      index += 1;
      continue;
    }

    pushSyntaxSegment(segments, "plain", char);
    index += 1;
  }

  if (comment.length > 0) {
    pushSyntaxSegment(segments, "comment", comment);
  }

  return segments;
}

function JumpIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <path d="M6.25 3.25H3.5a1.25 1.25 0 0 0-1.25 1.25v8A1.25 1.25 0 0 0 3.5 13.75h8A1.25 1.25 0 0 0 12.75 12.5V9.75" />
      <path d="M8.25 2.25h5.5v5.5" />
      <path d="m7.25 8.75 6-6" />
    </svg>
  );
}

function PrDiffLoading(props: { readonly compact?: boolean }) {
  return (
    <div
      class={`pr-diff-loading${
        props.compact ? " pr-diff-loading--compact" : ""
      }`}
    >
      <span class="pr-diff-loading__spinner" aria-hidden="true" />
      <span class="pr-diff-loading__text">
        {props.compact ? "Loading files..." : "Loading diff..."}
      </span>
    </div>
  );
}

function sourceDisplayLabel(source: GitHubDiffSource): string {
  switch (source.kind) {
    case "pull_request":
      return `#${source.number}`;
    case "commit":
      return `@${source.sha.slice(0, 12)}`;
    case "compare":
      return `${source.base}...${source.head}`;
    case "git_worktree":
      return "worktree";
    case "git_commit":
      return `@${source.commit.slice(0, 12)}`;
    case "git_range": {
      const separator = source.merge_base ? "..." : "..";
      return `${source.base}${separator}${source.head}`;
    }
  }
}

function sourceKindLabel(source: GitHubDiffSource): string {
  switch (source.kind) {
    case "pull_request":
      return "Pull request";
    case "commit":
      return "Commit";
    case "compare":
      return "Compare";
    case "git_worktree":
      return "Git worktree";
    case "git_commit":
      return "Git commit";
    case "git_range":
      return "Git range";
  }
}

function sourceStatusLabel(snapshot: PrDiffSnapshot | null): string {
  const identity = snapshot?.identity;
  if (identity === undefined) {
    return "Loading";
  }

  if (identity.source.kind === "commit") {
    return "Commit";
  }

  if (identity.source.kind === "compare") {
    return identity.state ?? "Compare";
  }

  if (
    identity.source.kind === "git_worktree" ||
    identity.source.kind === "git_commit" ||
    identity.source.kind === "git_range"
  ) {
    return identity.state ?? sourceKindLabel(identity.source);
  }

  if (identity.merged) {
    return "Merged";
  }

  return identity.state ?? "Unknown";
}

function sourceStatusClass(snapshot: PrDiffSnapshot | null): string {
  const identity = snapshot?.identity;
  if (identity?.source.kind !== "pull_request") {
    return "";
  }

  if (identity.merged) {
    return "pr-diff-header__state--merged";
  }

  if (identity.state === "open") {
    return "pr-diff-header__state--open";
  }

  if (identity.state === "closed") {
    return "pr-diff-header__state--closed";
  }

  return "";
}

function fallbackSourceForTarget(
  target: DiffWorkspaceTarget,
): GitHubDiffSource {
  if (target.kind === "github") {
    return target.target.source;
  }

  const repoPath = target.target.repo_path;
  switch (target.target.source.kind) {
    case "worktree":
      return {
        kind: "git_worktree",
        repo_path: repoPath,
      };
    case "commit":
      return {
        kind: "git_commit",
        repo_path: repoPath,
        commit: target.target.source.commit,
      };
    case "range":
      return {
        kind: "git_range",
        repo_path: repoPath,
        base: target.target.source.base,
        head: target.target.source.head,
        merge_base: target.target.source.merge_base,
      };
  }
}

function fallbackTargetTitle(target: DiffWorkspaceTarget): string {
  return target.kind === "github" ? target.target.url : target.target.repo_path;
}

function fallbackOwner(target: DiffWorkspaceTarget): string {
  return target.kind === "github" ? target.target.owner : "local";
}

function fallbackRepo(target: DiffWorkspaceTarget): string {
  if (target.kind === "github") {
    return target.target.repo;
  }

  const parts = target.target.repo_path.split(/[\\/]/).filter(Boolean);
  const name = parts[parts.length - 1];
  return name ?? target.target.repo_path;
}

export function buildDirectoryEntries(
  files: readonly PrDiffFile[],
  currentDir: string,
  query: string,
): readonly BrowserEntry[] {
  const normalizedQuery = query.trim().toLowerCase();
  const directories = new Map<
    string,
    {
      name: string;
      path: string;
      fileCount: number;
      additions: number;
      deletions: number;
    }
  >();
  const directFiles: PrDiffFile[] = [];
  const prefix = currentDir.length === 0 ? "" : `${currentDir}/`;

  for (const file of files) {
    if (!file.path.startsWith(prefix)) {
      continue;
    }

    const relative = file.path.slice(prefix.length);
    if (relative.length === 0) {
      continue;
    }

    const separatorIndex = relative.indexOf("/");
    if (separatorIndex === -1) {
      directFiles.push(file);
      continue;
    }

    const name = relative.slice(0, separatorIndex);
    const path = currentDir.length === 0 ? name : `${currentDir}/${name}`;
    const previous = directories.get(path);
    directories.set(path, {
      name,
      path,
      fileCount: (previous?.fileCount ?? 0) + 1,
      additions: (previous?.additions ?? 0) + file.additions,
      deletions: (previous?.deletions ?? 0) + file.deletions,
    });
  }

  const directoryEntries: BrowserEntry[] = [...directories.values()].map(
    (entry) => ({
      kind: "directory",
      ...entry,
    }),
  );
  const fileEntries: BrowserEntry[] = directFiles.map((file) => ({
    kind: "file",
    name: basename(file.path),
    path: file.path,
    file,
  }));

  return [...directoryEntries, ...fileEntries]
    .filter((entry) => {
      if (normalizedQuery.length === 0) {
        return true;
      }

      if (entry.kind === "directory") {
        const directoryPrefix = `${entry.path}/`;
        return files.some(
          (file) =>
            file.path.startsWith(directoryPrefix) &&
            file.path.toLowerCase().includes(normalizedQuery),
        );
      }

      return (
        entry.name.toLowerCase().includes(normalizedQuery) ||
        entry.path.toLowerCase().includes(normalizedQuery)
      );
    })
    .sort((left, right) => {
      if (left.kind !== right.kind) {
        return left.kind === "directory" ? -1 : 1;
      }

      return left.name.localeCompare(right.name, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });
}

function ModeIcon(props: { readonly mode: DiffViewMode }) {
  if (props.mode === "left_right") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <rect x="1.5" y="2.5" width="5" height="11" rx="1" />
        <rect x="9.5" y="2.5" width="5" height="11" rx="1" />
      </svg>
    );
  }

  if (props.mode === "full_file") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d="M4 1.75h5.2L12.75 5v9.25H4z" />
        <path d="M9.2 1.75V5h3.55" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 16 16" aria-hidden="true">
      <rect x="2" y="2.5" width="12" height="11" rx="1" />
      <path d="M4.5 5.5h7M4.5 8h7M4.5 10.5h5" />
    </svg>
  );
}

function FileStatusBadge(props: { readonly file: PrDiffFile }) {
  return (
    <span class={`pr-file-badge pr-file-badge--${props.file.status}`}>
      {statusLabel(props.file)}
    </span>
  );
}

function DiffLineContent(props: {
  readonly change: PrDiffChange;
  readonly syntaxKind: SyntaxKind;
}) {
  return (
    <code class="pr-diff-line__content">
      <span class="pr-diff-line__marker">
        {props.change.change_type === "add"
          ? "+"
          : props.change.change_type === "delete"
            ? "-"
            : " "}
      </span>
      <For
        each={highlightSyntaxSegments(props.change.content, props.syntaxKind)}
      >
        {(segment) => (
          <span class={`pr-syntax pr-syntax--${segment.kind}`}>
            {segment.text}
          </span>
        )}
      </For>
    </code>
  );
}

function FullFileLineContent(props: {
  readonly content: string;
  readonly syntaxKind: SyntaxKind;
}) {
  return (
    <code class="pr-diff-line__content pr-diff-line__content--full-file">
      <For each={highlightSyntaxSegments(props.content, props.syntaxKind)}>
        {(segment) => (
          <span class={`pr-syntax pr-syntax--${segment.kind}`}>
            {segment.text}
          </span>
        )}
      </For>
    </code>
  );
}

function flushChangeBlock(
  lineKinds: Map<number, FullFileLineKind>,
  deletionMarkers: Map<number, number>,
  deletedCount: number,
  addedLines: readonly number[],
  nextNewLine: number | null,
  lastNewLine: number,
): void {
  if (deletedCount > 0) {
    const markerPosition = addedLines[0] ?? nextNewLine ?? lastNewLine + 1;
    deletionMarkers.set(
      markerPosition,
      (deletionMarkers.get(markerPosition) ?? 0) + deletedCount,
    );
  }

  const lineKind: FullFileLineKind = deletedCount > 0 ? "modify" : "add";
  for (const lineNumber of addedLines) {
    lineKinds.set(lineNumber, lineKind);
  }
}

function buildFullFileAnnotations(file: PrDiffFile): {
  readonly lineKinds: ReadonlyMap<number, FullFileLineKind>;
  readonly deletionMarkers: ReadonlyMap<number, number>;
} {
  const lineKinds = new Map<number, FullFileLineKind>();
  const deletionMarkers = new Map<number, number>();

  for (const chunk of file.chunks) {
    let deletedCount = 0;
    let addedLines: number[] = [];
    let lastNewLine = chunk.new_start - 1;

    const flush = (nextNewLine: number | null) => {
      flushChangeBlock(
        lineKinds,
        deletionMarkers,
        deletedCount,
        addedLines,
        nextNewLine,
        lastNewLine,
      );
      deletedCount = 0;
      addedLines = [];
    };

    for (const change of chunk.changes) {
      if (change.change_type === "context") {
        flush(change.new_line);
        if (change.new_line !== null) {
          lastNewLine = change.new_line;
        }
        continue;
      }

      if (change.change_type === "delete") {
        if (deletedCount === 0 && addedLines.length > 0) {
          flush(null);
        }
        deletedCount += 1;
        continue;
      }

      if (change.new_line !== null) {
        addedLines.push(change.new_line);
        lastNewLine = change.new_line;
      }
    }

    flush(null);
  }

  return { lineKinds, deletionMarkers };
}

function fullTextRows(file: PrDiffFile): readonly FullFileRow[] {
  if (file.full_text === null) {
    return [];
  }

  const { lineKinds, deletionMarkers } = buildFullFileAnnotations(file);
  const rows: FullFileRow[] = [];

  file.full_text.split("\n").forEach((content, index) => {
    const lineNumber = index + 1;
    const deletedCount = deletionMarkers.get(lineNumber);
    if (deletedCount !== undefined) {
      rows.push({
        kind: "deletion-marker",
        position: lineNumber,
        deletedCount,
      });
    }

    rows.push({
      kind: "line",
      lineKind: lineKinds.get(lineNumber) ?? "context",
      lineNumber,
      content,
    });
  });

  const trailingMarkerPosition = file.full_text.split("\n").length + 1;
  const trailingDeletedCount = deletionMarkers.get(trailingMarkerPosition);
  if (trailingDeletedCount !== undefined) {
    rows.push({
      kind: "deletion-marker",
      position: trailingMarkerPosition,
      deletedCount: trailingDeletedCount,
    });
  }

  return rows;
}

function StackDiff(props: { readonly file: PrDiffFile }) {
  const syntaxKind = createMemo(() => syntaxKindForPath(props.file.path));

  return (
    <div class="pr-diff-code" role="table" aria-label="Stack diff">
      <For each={props.file.chunks}>
        {(chunk) => (
          <>
            <div class="pr-diff-hunk" role="row">
              <span>{chunk.header}</span>
            </div>
            <For each={chunk.changes}>
              {(change) => (
                <div
                  class={`pr-diff-line pr-diff-line--${change.change_type}`}
                  role="row"
                >
                  <span class="pr-diff-line__number">
                    {change.old_line ?? ""}
                  </span>
                  <span class="pr-diff-line__number">
                    {change.new_line ?? ""}
                  </span>
                  <DiffLineContent change={change} syntaxKind={syntaxKind()} />
                </div>
              )}
            </For>
          </>
        )}
      </For>
    </div>
  );
}

export function FullFileDiff(props: {
  readonly file: PrDiffFile;
  readonly loading?: boolean;
  readonly error?: string | null;
}) {
  const syntaxKind = createMemo(() => syntaxKindForPath(props.file.path));

  return (
    <div class="pr-diff-code" role="table" aria-label="Full file diff">
      <Show when={props.loading}>
        <div class="pr-diff-hunk" role="row">
          <PrDiffLoading compact={true} />
        </div>
      </Show>
      <Show when={props.error !== undefined && props.error !== null}>
        <div class="pr-diff-hunk" role="row">
          <span>{props.error}</span>
        </div>
      </Show>
      <Show
        when={props.file.full_text !== null}
        fallback={
          <For each={props.file.chunks}>
            {(chunk) => (
              <>
                <div class="pr-diff-hunk" role="row">
                  <span>{chunk.header}</span>
                </div>
                <For
                  each={chunk.changes.filter(
                    (change) => change.change_type !== "delete",
                  )}
                >
                  {(change) => (
                    <div
                      class={`pr-diff-line pr-diff-line--full-file pr-diff-line--${change.change_type}`}
                      role="row"
                    >
                      <span class="pr-diff-line__number" aria-hidden="true" />
                      <span class="pr-diff-line__number">
                        {change.new_line ?? ""}
                      </span>
                      <DiffLineContent
                        change={change}
                        syntaxKind={syntaxKind()}
                      />
                    </div>
                  )}
                </For>
              </>
            )}
          </For>
        }
      >
        <Show when={props.file.full_text_truncated}>
          <div class="pr-diff-hunk" role="row">
            <span>Full file content is truncated.</span>
          </div>
        </Show>
        <For each={fullTextRows(props.file)}>
          {(row) =>
            row.kind === "line" ? (
              <div
                class={`pr-diff-line pr-diff-line--full-file pr-diff-line--${row.lineKind}`}
                role="row"
              >
                <span class="pr-diff-line__number" aria-hidden="true" />
                <span class="pr-diff-line__number">{row.lineNumber}</span>
                <FullFileLineContent
                  content={row.content}
                  syntaxKind={syntaxKind()}
                />
              </div>
            ) : (
              <div
                class="pr-diff-line pr-diff-line--full-file pr-diff-line--delete-marker"
                role="row"
                aria-label={`Deleted ${row.deletedCount} line${
                  row.deletedCount === 1 ? "" : "s"
                } before line ${row.position}`}
              >
                <span class="pr-diff-line__number" aria-hidden="true" />
                <span class="pr-diff-line__number" aria-hidden="true" />
                <span
                  class="pr-diff-line__content pr-diff-line__content--delete-marker"
                  aria-hidden="true"
                />
              </div>
            )
          }
        </For>
      </Show>
    </div>
  );
}

function LeftRightDiff(props: { readonly file: PrDiffFile }) {
  const syntaxKind = createMemo(() => syntaxKindForPath(props.file.path));

  return (
    <div class="pr-diff-split" role="table" aria-label="Left/right diff">
      <For each={props.file.chunks}>
        {(chunk) => (
          <LeftRightDiffHunk chunk={chunk} syntaxKind={syntaxKind()} />
        )}
      </For>
    </div>
  );
}

function LeftRightDiffHunk(props: {
  readonly chunk: PrDiffChunk;
  readonly syntaxKind: SyntaxKind;
}) {
  let oldPane: HTMLDivElement | undefined;
  let newPane: HTMLDivElement | undefined;
  let segmentScrollbar: HTMLDivElement | undefined;
  let scrollbarSpacer: HTMLDivElement | undefined;
  let syncing = false;

  const updateScrollbarWidth = () => {
    const oldScrollWidth = oldPane?.scrollWidth ?? 0;
    const newScrollWidth = newPane?.scrollWidth ?? 0;
    const paneWidth = Math.max(
      oldPane?.clientWidth ?? 0,
      newPane?.clientWidth ?? 0,
    );
    const scrollWidth = Math.max(oldScrollWidth, newScrollWidth, paneWidth);

    if (scrollbarSpacer !== undefined) {
      scrollbarSpacer.style.width = `${scrollWidth}px`;
    }
  };

  const applyScrollLeft = (nextScrollLeft: number) => {
    if (oldPane !== undefined) {
      oldPane.scrollLeft = nextScrollLeft;
    }
    if (newPane !== undefined) {
      newPane.scrollLeft = nextScrollLeft;
    }
    if (segmentScrollbar !== undefined) {
      segmentScrollbar.scrollLeft = nextScrollLeft;
    }
  };

  const syncFromScrollbar = () => {
    if (segmentScrollbar === undefined) {
      return;
    }

    applyScrollLeft(segmentScrollbar.scrollLeft);
  };

  const syncFromPane = (source: HTMLDivElement) => {
    if (syncing) {
      return;
    }

    syncing = true;
    applyScrollLeft(source.scrollLeft);
    syncing = false;
  };

  const handleWheel = (event: WheelEvent) => {
    if (segmentScrollbar === undefined) {
      return;
    }

    const horizontalDelta = event.deltaX || (event.shiftKey ? event.deltaY : 0);
    if (Math.abs(horizontalDelta) === 0) {
      return;
    }
    event.preventDefault();
    applyScrollLeft(segmentScrollbar.scrollLeft + horizontalDelta);
  };

  createEffect(() => {
    props.chunk.header;
    props.chunk.changes.length;
    queueMicrotask(updateScrollbarWidth);
  });

  onMount(() => {
    updateScrollbarWidth();

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver(updateScrollbarWidth);
    if (oldPane !== undefined) {
      resizeObserver.observe(oldPane);
    }
    if (newPane !== undefined) {
      resizeObserver.observe(newPane);
    }

    onCleanup(() => resizeObserver.disconnect());
  });

  return (
    <>
      <div class="pr-diff-split__hunk" role="row">
        <span>{props.chunk.header}</span>
      </div>
      <div class="pr-diff-split__hunk-body" onWheel={handleWheel}>
        <div class="pr-diff-split__hunk-panes">
          <div
            ref={(element) => {
              oldPane = element;
            }}
            class="pr-diff-split__pane pr-diff-split__pane--old"
            onScroll={(event) => syncFromPane(event.currentTarget)}
          >
            <For each={props.chunk.changes}>
              {(change) => (
                <div
                  class={`pr-diff-split__cell pr-diff-split__cell--old pr-diff-split__cell--${change.change_type}`}
                  role="row"
                >
                  <span class="pr-diff-line__number">
                    {change.old_line ?? ""}
                  </span>
                  <Show
                    when={
                      change.change_type === "delete" ||
                      change.change_type === "context"
                    }
                    fallback={
                      <code
                        class="pr-diff-line__content pr-diff-line__content--empty"
                        aria-hidden="true"
                      />
                    }
                  >
                    <DiffLineContent
                      change={change}
                      syntaxKind={props.syntaxKind}
                    />
                  </Show>
                </div>
              )}
            </For>
          </div>
          <div
            ref={(element) => {
              newPane = element;
            }}
            class="pr-diff-split__pane pr-diff-split__pane--new"
            onScroll={(event) => syncFromPane(event.currentTarget)}
          >
            <For each={props.chunk.changes}>
              {(change) => (
                <div
                  class={`pr-diff-split__cell pr-diff-split__cell--new pr-diff-split__cell--${change.change_type}`}
                  role="row"
                >
                  <span class="pr-diff-line__number">
                    {change.new_line ?? ""}
                  </span>
                  <Show
                    when={
                      change.change_type === "add" ||
                      change.change_type === "context"
                    }
                    fallback={
                      <code
                        class="pr-diff-line__content pr-diff-line__content--empty"
                        aria-hidden="true"
                      />
                    }
                  >
                    <DiffLineContent
                      change={change}
                      syntaxKind={props.syntaxKind}
                    />
                  </Show>
                </div>
              )}
            </For>
          </div>
        </div>
        <div
          ref={(element) => {
            segmentScrollbar = element;
          }}
          class="pr-diff-segment-scrollbar"
          aria-hidden="true"
          onScroll={syncFromScrollbar}
        >
          <div
            ref={(element) => {
              scrollbarSpacer = element;
            }}
            class="pr-diff-segment-scrollbar__spacer"
          />
        </div>
      </div>
    </>
  );
}

export function PrDiffWorkspace(props: PrDiffWorkspaceProps) {
  let filterInput: HTMLInputElement | undefined;
  let diffFileView: HTMLDivElement | undefined;
  const [snapshot, setSnapshot] = createSignal<PrDiffSnapshot | null>(null);
  const [isLoading, setLoading] = createSignal(true);
  const [errorMessage, setErrorMessage] = createSignal<string | null>(null);
  const [currentDir, setCurrentDir] = createSignal("");
  const [query, setQuery] = createSignal("");
  const [cursorPath, setCursorPath] = createSignal<string | null>(null);
  const [selectedPath, setSelectedPath] = createSignal<string | null>(null);
  const [lazyFileText, setLazyFileText] = createSignal<
    Readonly<Record<string, LazyFileTextState>>
  >({});
  const [mode, setMode] = createSignal<DiffViewMode>("left_right");

  const files = createMemo(() => snapshot()?.files ?? []);
  const sortedFiles = createMemo(() =>
    [...files()].sort((left, right) => left.path.localeCompare(right.path)),
  );
  const entries = createMemo(() =>
    buildDirectoryEntries(sortedFiles(), currentDir(), query()),
  );
  const selectedFile = createMemo(() => {
    const path = selectedPath();
    const file = sortedFiles().find((candidate) => candidate.path === path);
    if (file === undefined) {
      return null;
    }

    const lazyState = lazyFileText()[file.path];
    if (lazyState?.text === undefined || lazyState.text === null) {
      return file;
    }

    return {
      ...file,
      full_text: lazyState.text.full_text,
      full_text_truncated: lazyState.text.full_text_truncated,
    };
  });
  const selectedLazyTextState = createMemo(() => {
    const file = selectedFile();
    return file === null ? null : (lazyFileText()[file.path] ?? null);
  });
  const headerSourceLabel = createMemo(() =>
    sourceDisplayLabel(
      snapshot()?.identity.source ?? fallbackSourceForTarget(props.target),
    ),
  );
  const headerSummary = createMemo(() => {
    const currentSnapshot = snapshot();
    if (currentSnapshot === null) {
      return fallbackTargetTitle(props.target);
    }

    return `${sourceKindLabel(currentSnapshot.identity.source)}: ${
      currentSnapshot.identity.title
    }`;
  });

  const load = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const nextSnapshot =
        props.target.kind === "github"
          ? await loadPrDiff(props.target.target)
          : await loadGitDiff(props.target.target);
      setSnapshot(nextSnapshot);
      const nextFiles = [...nextSnapshot.files].sort((left, right) =>
        left.path.localeCompare(right.path),
      );
      const initialEntries = buildDirectoryEntries(nextFiles, "", "");
      setCurrentDir("");
      setQuery("");
      setCursorPath(initialEntries[0]?.path ?? null);
      setSelectedPath(null);
      setLazyFileText({});
    } catch (error: unknown) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to load diff",
      );
    } finally {
      setLoading(false);
    }
  };

  const ensureFullFileText = (file: PrDiffFile) => {
    if (
      file.full_text !== null ||
      file.raw_url === null ||
      file.is_binary ||
      lazyFileText()[file.path]?.loading === true ||
      (lazyFileText()[file.path]?.text !== undefined &&
        lazyFileText()[file.path]?.text !== null)
    ) {
      return;
    }

    setLazyFileText((state) => ({
      ...state,
      [file.path]: {
        loading: true,
        text: state[file.path]?.text ?? null,
        error: null,
      },
    }));

    void loadPrDiffFileText(file.raw_url)
      .then((text) => {
        setLazyFileText((state) => ({
          ...state,
          [file.path]: {
            loading: false,
            text,
            error: null,
          },
        }));
      })
      .catch((error: unknown) => {
        setLazyFileText((state) => ({
          ...state,
          [file.path]: {
            loading: false,
            text: state[file.path]?.text ?? null,
            error:
              error instanceof Error
                ? error.message
                : "Failed to load full file content",
          },
        }));
      });
  };

  createEffect(() => {
    const file = selectedFile();
    if (mode() === "full_file" && file !== null) {
      ensureFullFileText(file);
    }
  });

  const focusEntry = (entry: BrowserEntry) => {
    setCursorPath(entry.path);
    setSelectedPath(entry.kind === "file" ? entry.path : null);
  };

  const selectEntry = (entry: BrowserEntry) => {
    focusEntry(entry);
    if (entry.kind === "directory") {
      setCurrentDir(entry.path);
      setQuery("");
      const childEntries = buildDirectoryEntries(sortedFiles(), entry.path, "");
      const firstChild = childEntries[0];
      if (firstChild === undefined) {
        setCursorPath(null);
        setSelectedPath(null);
      } else {
        focusEntry(firstChild);
      }
      return;
    }
  };

  const moveCursor = (step: 1 | -1) => {
    const visibleEntries = entries();
    if (visibleEntries.length === 0) {
      return;
    }

    const index = visibleEntries.findIndex(
      (entry) => entry.path === cursorPath(),
    );
    const currentIndex = index === -1 ? 0 : index;
    const nextIndex = Math.min(
      visibleEntries.length - 1,
      Math.max(0, currentIndex + step),
    );
    const nextEntry = visibleEntries[nextIndex];
    if (nextEntry !== undefined) {
      focusEntry(nextEntry);
    }
  };

  const navigateParent = () => {
    const previousDir = currentDir();
    const parent = parentDir(currentDir());
    if (parent !== null) {
      setCurrentDir(parent);
      setQuery("");
      setCursorPath(previousDir);
      setSelectedPath(null);
    }
  };

  onMount(() => {
    void load();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) {
        return;
      }

      const key = event.key.toLowerCase();
      if (matchesCtrlShortcut(event, "d")) {
        event.preventDefault();
        scrollDiffPane(diffFileView, 1);
        return;
      }

      if (matchesCtrlShortcut(event, "u")) {
        event.preventDefault();
        scrollDiffPane(diffFileView, -1);
        return;
      }

      if (key === "j" || event.key === "ArrowDown" || event.key === "Down") {
        event.preventDefault();
        moveCursor(1);
        return;
      }

      if (key === "k" || event.key === "ArrowUp" || event.key === "Up") {
        event.preventDefault();
        moveCursor(-1);
        return;
      }

      if (key === "h" || event.key === "ArrowLeft" || event.key === "Left") {
        event.preventDefault();
        navigateParent();
        return;
      }

      if (
        key === "l" ||
        event.key === "ArrowRight" ||
        event.key === "Right" ||
        event.key === "Enter" ||
        event.key === "Return"
      ) {
        const entry =
          entries().find((candidate) => candidate.path === cursorPath()) ??
          entries()[0];
        if (entry !== undefined) {
          event.preventDefault();
          selectEntry(entry);
        }
        return;
      }

      if (event.key === "/") {
        event.preventDefault();
        filterInput?.focus();
        filterInput?.select();
        return;
      }

      if (event.key === "Tab") {
        event.preventDefault();
        setMode((value) =>
          value === "left_right"
            ? "stack"
            : value === "stack"
              ? "full_file"
              : "left_right",
        );
        return;
      }

      if (event.key === "1") {
        event.preventDefault();
        setMode("left_right");
        return;
      }

      if (event.key === "2") {
        event.preventDefault();
        setMode("stack");
        return;
      }

      if (event.key === "3") {
        event.preventDefault();
        setMode("full_file");
        return;
      }

      if (key === "o") {
        if (props.target.kind !== "github") {
          return;
        }
        event.preventDefault();
        void openUrl(snapshot()?.identity.url ?? props.target.target.url);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    onCleanup(() => window.removeEventListener("keydown", handleKeyDown));
  });

  return (
    <div class="pr-workspace">
      <aside class="pane pr-browser">
        <header class="pane__header">
          <span class="pane__title">Changed Files</span>
          <span>{files().length} files</span>
        </header>
        <div class="pane__body pr-browser__body">
          <div
            class={`pr-browser__path${
              currentDir().length === 0 ? " pr-browser__path--root" : ""
            }`}
          >
            {currentDir().length === 0 ? "/" : currentDir()}
          </div>
          <input
            ref={(element) => {
              filterInput = element;
            }}
            class="file-browser__filter pr-browser__filter"
            value={query()}
            placeholder="Filter files..."
            onInput={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                setQuery("");
                setCursorPath(entries()[0]?.path ?? null);
                filterInput?.blur();
              }
            }}
          />
          <Show
            when={entries().length > 0}
            fallback={
              <Show
                when={!isLoading()}
                fallback={<PrDiffLoading compact={true} />}
              >
                <div class="empty">No changed files here.</div>
              </Show>
            }
          >
            <ul class="file-browser__list pr-browser__list">
              <Show when={parentDir(currentDir()) !== null}>
                <li>
                  <button
                    type="button"
                    class="file-browser__button file-browser__button--dir"
                    onClick={navigateParent}
                  >
                    <span class="file-browser__entry-labels">
                      <span class="file-browser__name">..</span>
                    </span>
                  </button>
                </li>
              </Show>
              <For each={entries()}>
                {(entry) => (
                  <li>
                    <button
                      type="button"
                      class={`file-browser__button${
                        entry.kind === "directory"
                          ? " file-browser__button--dir"
                          : " file-browser__button--file"
                      }${
                        cursorPath() === entry.path
                          ? " file-browser__button--active"
                          : ""
                      }`}
                      data-path={entry.path}
                      onClick={() => selectEntry(entry)}
                    >
                      <Show when={entry.kind === "file"}>
                        <FileStatusBadge
                          file={(entry as { file: PrDiffFile }).file}
                        />
                      </Show>
                      <span class="file-browser__entry-labels">
                        <span class="file-browser__name">{entry.name}</span>
                        <span class="file-browser__path-hint">
                          <Show
                            when={entry.kind === "directory"}
                            fallback={
                              <>
                                +
                                {(entry as { file: PrDiffFile }).file.additions}
                                {" -"}
                                {(entry as { file: PrDiffFile }).file.deletions}
                              </>
                            }
                          >
                            {
                              (
                                entry as Extract<
                                  BrowserEntry,
                                  { kind: "directory" }
                                >
                              ).fileCount
                            }
                            {" files | +"}
                            {
                              (
                                entry as Extract<
                                  BrowserEntry,
                                  { kind: "directory" }
                                >
                              ).additions
                            }
                            {" -"}
                            {
                              (
                                entry as Extract<
                                  BrowserEntry,
                                  { kind: "directory" }
                                >
                              ).deletions
                            }
                          </Show>
                        </span>
                      </span>
                    </button>
                  </li>
                )}
              </For>
            </ul>
          </Show>
        </div>
      </aside>

      <section class="pane pr-diff-pane">
        <header class="pane__header pr-diff-header">
          <div class="pr-diff-header__title">
            <span class="pane__title">
              {snapshot()?.identity.owner ?? fallbackOwner(props.target)}/
              {snapshot()?.identity.repo ?? fallbackRepo(props.target)}{" "}
              {headerSourceLabel()}
            </span>
            <span class="pr-diff-header__summary">{headerSummary()}</span>
            <span
              class={`pr-diff-header__state ${sourceStatusClass(
                snapshot() ?? null,
              )}`}
              title={
                snapshot()?.identity.merged_at === undefined ||
                snapshot()?.identity.merged_at === null
                  ? undefined
                  : `Merged at ${snapshot()?.identity.merged_at}`
              }
            >
              {sourceStatusLabel(snapshot() ?? null)}
            </span>
          </div>
          <div
            class="pr-diff-header__actions"
            role="group"
            aria-label="Diff actions and diff mode"
          >
            <Show when={props.target.kind === "github"}>
              <button
                type="button"
                class="workspace__mode"
                title="Open source in GitHub"
                aria-label="Open source in GitHub"
                onClick={() => {
                  if (props.target.kind === "github") {
                    void openUrl(
                      snapshot()?.identity.url ?? props.target.target.url,
                    );
                  }
                }}
              >
                <JumpIcon />
              </button>
            </Show>
            <For
              each={
                [
                  ["left_right", "Left/right diff"],
                  ["stack", "Stack"],
                  ["full_file", "Full file"],
                ] as const
              }
            >
              {([nextMode, label]) => (
                <button
                  type="button"
                  class={`workspace__mode${
                    mode() === nextMode ? " workspace__mode--active" : ""
                  }`}
                  title={label}
                  aria-label={label}
                  onClick={() => setMode(nextMode)}
                >
                  <ModeIcon mode={nextMode} />
                </button>
              )}
            </For>
          </div>
        </header>
        <Show when={errorMessage() !== null}>
          <div class="banner banner--error pr-diff-error">
            <span>{errorMessage()}</span>
            <button
              type="button"
              class="workspace__text-button"
              onClick={() => {
                void load();
              }}
            >
              Retry
            </button>
          </div>
        </Show>
        <Show when={snapshot()?.warnings.length}>
          <div class="banner">{snapshot()?.warnings.join(" | ")}</div>
        </Show>
        <div class="pane__body pr-diff-pane__body">
          <Show when={!isLoading()} fallback={<PrDiffLoading />}>
            <Show
              when={selectedFile()}
              fallback={<div class="empty">No file selected.</div>}
            >
              {(getFile) => (
                <>
                  <div class="pr-diff-filebar">
                    <FileStatusBadge file={getFile()} />
                    <span>{getFile().path}</span>
                    <Show when={getFile().old_path !== null}>
                      <span class="pr-diff-filebar__old">
                        from {getFile().old_path}
                      </span>
                    </Show>
                    <span>
                      +{getFile().additions} -{getFile().deletions}
                    </span>
                  </div>
                  <Show
                    when={!getFile().is_binary}
                    fallback={
                      <div class="empty">
                        No text diff is available for this file.
                      </div>
                    }
                  >
                    <Show
                      when={
                        getFile().chunks.length > 0 || mode() === "full_file"
                      }
                      fallback={
                        <div class="empty">
                          No patch is available for this file. Use full file
                          view.
                        </div>
                      }
                    >
                      <div
                        ref={(element) => {
                          diffFileView = element;
                        }}
                        class="pr-diff-fileview"
                      >
                        <Show
                          when={
                            mode() === "left_right" &&
                            getFile().chunks.length > 0
                          }
                        >
                          <LeftRightDiff file={getFile()} />
                        </Show>
                        <Show when={mode() === "full_file"}>
                          <FullFileDiff
                            file={getFile()}
                            loading={selectedLazyTextState()?.loading ?? false}
                            error={selectedLazyTextState()?.error ?? null}
                          />
                        </Show>
                        <Show
                          when={
                            mode() === "stack" && getFile().chunks.length > 0
                          }
                        >
                          <StackDiff file={getFile()} />
                        </Show>
                      </div>
                    </Show>
                  </Show>
                </>
              )}
            </Show>
          </Show>
        </div>
      </section>
    </div>
  );
}
