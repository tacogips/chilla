import type {
  KeymapBindingInput,
  KeymapConfigInput,
  KeymapSectionInput,
} from "../../lib/tauri/keymap";

export type KeymapContext = "file" | "diff" | "workspace";
export const MGR_ACTIONS = [
  "noop",
  "cursor.up",
  "cursor.down",
  "parent",
  "enter",
  "open",
  "filter",
  "search.name",
  "search.content",
  "view.toggle",
  "ignored.toggle",
  "directory.info",
  "sort.name.asc",
  "sort.name.desc",
  "sort.extension.asc",
  "sort.extension.desc",
  "sort.mtime.asc",
  "sort.mtime.desc",
  "sort.size.asc",
  "sort.size.desc",
  "sort.reset",
  "diff.previous",
  "diff.next",
  "diff.view.cycle",
  "diff.view.split",
  "diff.view.stack",
  "diff.view.full",
  "diff.view.image",
  "diff.open",
  "scroll.up",
  "scroll.down",
] as const;
export const WORKSPACE_ACTIONS = [
  "noop",
  "help",
  "quit",
  "files.open",
  "document.save",
  "document.reload",
  "path.copy",
  "sidebar.toggle",
  "git.toggle",
  "toc.toggle",
  "presentation.toggle",
  "presentation.raw",
  "presentation.rendered",
  "theme.toggle",
  "scroll.up",
  "scroll.down",
  "document.previous",
  "document.next",
] as const;
export type KeymapAction =
  | (typeof MGR_ACTIONS)[number]
  | (typeof WORKSPACE_ACTIONS)[number];
export interface KeymapBinding {
  readonly keys: readonly string[];
  readonly actions: readonly KeymapAction[];
  readonly description: string;
}
export type EffectiveKeymap = Readonly<
  Record<KeymapContext, readonly KeymapBinding[]>
>;
const b = (
  on: string | readonly string[],
  run: KeymapAction,
  desc: string,
): KeymapBindingInput => ({ on, run, desc });
const navigation = [
  b("j", "cursor.down", "Move selection down"),
  b("J", "cursor.down", "Move selection down"),
  b("<Down>", "cursor.down", "Move selection down"),
  b("k", "cursor.up", "Move selection up"),
  b("K", "cursor.up", "Move selection up"),
  b("<Up>", "cursor.up", "Move selection up"),
  b("h", "parent", "Parent or collapse folder"),
  b("H", "parent", "Parent or collapse folder"),
  b("<Left>", "parent", "Parent or collapse folder"),
  b("l", "enter", "Enter or expand folder"),
  b("<Right>", "enter", "Enter or expand folder"),
  b("<Enter>", "open", "Open or confirm"),
  b("f", "filter", "Show and focus filter"),
  b("/", "filter", "Show and focus filter"),
  b("t", "view.toggle", "Toggle List/Tree"),
];
const sorts = (["name", "extension", "mtime", "size"] as const).flatMap(
  (field, index) => {
    const key = ["a", "e", "m", "s"][index] ?? "a";
    return [
      b([",", key], `sort.${field}.asc`, `${field} ascending`),
      b([",", key.toUpperCase()], `sort.${field}.desc`, `${field} descending`),
    ];
  },
);
export const DEFAULT_KEYMAP_INPUT: Readonly<
  Record<KeymapContext, readonly KeymapBindingInput[]>
> = {
  file: [
    ...navigation,
    b("<C-m>", "open", "Open or confirm"),
    b("<D-m>", "open", "Open or confirm"),
    b("<Space>", "open", "Open preview and play media"),
    b(".", "ignored.toggle", "Toggle Git-ignored entries"),
    b("<Tab>", "directory.info", "Show directory information"),
    b("s", "search.name", "Find files recursively"),
    b("S", "search.content", "Search file contents recursively"),
    ...sorts,
    b([",", "0"], "sort.reset", "Default (name ascending)"),
    b("0", "sort.reset", "Default (name ascending)"),
  ],
  diff: [
    ...navigation,
    b("<", "diff.previous", "Previous changed file"),
    b(">", "diff.next", "Next changed file"),
    b("<Tab>", "diff.view.cycle", "Cycle diff view"),
    b("1", "diff.view.split", "Side-by-side diff"),
    b("2", "diff.view.stack", "Stacked diff"),
    b("3", "diff.view.full", "Full file"),
    b("4", "diff.view.image", "SVG image"),
    b("o", "diff.open", "Open pull request"),
    b("<C-d>", "scroll.down", "Scroll diff down"),
    b("<C-u>", "scroll.up", "Scroll diff up"),
  ],
  workspace: [
    b("?", "help", "Show keyboard help"),
    b("q", "quit", "Quit application"),
    b("<C-o>", "files.open", "Open files"),
    b("<D-o>", "files.open", "Open files"),
    b("<C-s>", "document.save", "Save Markdown"),
    b("<D-s>", "document.save", "Save Markdown"),
    b("<C-d>", "scroll.down", "Scroll document down"),
    b("<C-u>", "scroll.up", "Scroll document up"),
    b("j", "document.next", "Next document position when sidebar hidden"),
    b("<Down>", "document.next", "Next document position when sidebar hidden"),
    b(
      "k",
      "document.previous",
      "Previous document position when sidebar hidden",
    ),
    b(
      "<Up>",
      "document.previous",
      "Previous document position when sidebar hidden",
    ),
    b("L", "sidebar.toggle", "Toggle file tree"),
    b("g", "git.toggle", "Toggle Git diff"),
    b("y", "path.copy", "Copy selected path"),
    b("r", "document.reload", "Refresh workspace and current file"),
    b("T", "toc.toggle", "Toggle table of contents"),
    b(
      "P",
      "presentation.toggle",
      "Toggle Raw / Preview (Markdown) or Raw / Formatted (CSV)",
    ),
    b("1", "presentation.raw", "Select Raw view (Markdown / CSV)"),
    b(
      "2",
      "presentation.rendered",
      "Select Preview view (Markdown) or Formatted view (CSV)",
    ),
    b("S", "theme.toggle", "Toggle theme outside browser"),
  ],
};
const names: Readonly<Record<string, string>> = {
  enter: "Enter",
  return: "Enter",
  esc: "Esc",
  escape: "Esc",
  space: "Space",
  tab: "Tab",
  up: "Up",
  arrowup: "Up",
  down: "Down",
  arrowdown: "Down",
  left: "Left",
  arrowleft: "Left",
  right: "Right",
  arrowright: "Right",
  home: "Home",
  end: "End",
  pageup: "PageUp",
  pagedown: "PageDown",
  backspace: "Backspace",
  delete: "Delete",
  insert: "Insert",
};
export function normalizeKey(raw: string): string {
  if (Array.from(raw).length === 1) return raw === " " ? "<Space>" : raw;
  if (!raw.startsWith("<") || !raw.endsWith(">"))
    throw new Error("Unsupported key notation");
  const parts = raw.slice(1, -1).split("-");
  const last = parts.pop();
  if (last === undefined || last === "")
    throw new Error("Unsupported key notation");
  const modifiers = new Set<string>();
  for (const part of parts) {
    const normalized = (
      {
        c: "C",
        ctrl: "C",
        control: "C",
        a: "A",
        alt: "A",
        d: "D",
        meta: "D",
        cmd: "D",
        super: "D",
        s: "S",
        shift: "S",
      } as Readonly<Record<string, string>>
    )[part.toLowerCase()];
    if (normalized === undefined || modifiers.has(normalized))
      throw new Error("Unsupported key modifier");
    modifiers.add(normalized);
  }
  const named =
    names[last.toLowerCase()] ??
    (/^f(?:[1-9]|1[0-9]|2[0-4])$/i.test(last) ? last.toUpperCase() : undefined);
  if (modifiers.size > 0 && /^[A-Z]$/.test(last)) modifiers.add("S");
  if (named === undefined && Array.from(last).length !== 1)
    throw new Error("Unsupported key name");
  if (modifiers.size === 0) return named === undefined ? last : `<${named}>`;
  if (
    modifiers.size === 1 &&
    modifiers.has("S") &&
    named === undefined &&
    /^[a-z]$/i.test(last)
  )
    return last.toUpperCase();
  const prefix = ["C", "A", "D", "S"]
    .filter((key) => modifiers.has(key))
    .join("-");
  return `<${prefix}-${named ?? last.toLowerCase()}>`;
}
export function eventKey(event: KeyboardEvent): string | null {
  if (["Shift", "Control", "Alt", "Meta"].includes(event.key)) return null;
  const named =
    event.key === " "
      ? "Space"
      : (names[event.key.toLowerCase()] ??
        (/^F\d+$/.test(event.key) ? event.key : undefined));
  if (
    named === undefined &&
    Array.from(event.key).length !== 1 &&
    !(
      (event.ctrlKey || event.altKey || event.metaKey) &&
      /^Key[A-Z]$/.test(event.code)
    )
  )
    return null;
  if (!event.ctrlKey && !event.altKey && !event.metaKey && named === undefined)
    return event.shiftKey && /^[a-z]$/.test(event.key)
      ? event.key.toUpperCase()
      : event.shiftKey && ["/", ",", ".", "0"].includes(event.key)
        ? `<S-${event.key}>`
        : event.key;
  const modifiers = [
    event.ctrlKey ? "C" : "",
    event.altKey ? "A" : "",
    event.metaKey ? "D" : "",
    event.shiftKey ? "S" : "",
  ].filter(Boolean);
  if (event.key === " ")
    return normalizeKey(`<${[...modifiers, "Space"].join("-")}>`);
  const physical =
    (event.ctrlKey || event.altKey || event.metaKey) &&
    /^Key[A-Z]$/.test(event.code)
      ? event.code.slice(3).toLowerCase()
      : event.key.toLowerCase();
  try {
    return normalizeKey(`<${[...modifiers, named ?? physical].join("-")}>`);
  } catch {
    return null;
  }
}
function compileBinding(
  input: KeymapBindingInput,
  context: "mgr" | "workspace",
): KeymapBinding {
  if (
    typeof input !== "object" ||
    input === null ||
    Object.keys(input).some((key) => !["on", "run", "desc"].includes(key))
  )
    throw new Error("Invalid binding fields");
  const keys = typeof input.on === "string" ? [input.on] : input.on;
  const actions = typeof input.run === "string" ? [input.run] : input.run;
  if (
    !Array.isArray(keys) ||
    keys.length < 1 ||
    keys.length > 8 ||
    !keys.every((key: unknown) => typeof key === "string")
  )
    throw new Error("A binding requires 1–8 keys");
  const allowed: readonly string[] =
    context === "mgr" ? MGR_ACTIONS : WORKSPACE_ACTIONS;
  if (
    !Array.isArray(actions) ||
    actions.length < 1 ||
    actions.length > 8 ||
    !actions.every(
      (action: unknown) =>
        typeof action === "string" && allowed.includes(action),
    )
  )
    throw new Error("Unsupported built-in action for context");
  if (
    input.desc !== undefined &&
    (typeof input.desc !== "string" || input.desc.length > 512)
  )
    throw new Error("Invalid binding description");
  const normalized = keys.map(normalizeKey);
  if (normalized.slice(1).includes("<Esc>"))
    throw new Error("Escape is reserved for cancelling sequences");
  return {
    keys: normalized,
    actions: actions as KeymapAction[],
    description: input.desc ?? actions.join(", "),
  };
}
function compileSection(
  section: KeymapSectionInput | undefined,
  context: KeymapContext,
): readonly KeymapBinding[] {
  if (
    section !== undefined &&
    (typeof section !== "object" ||
      section === null ||
      Object.keys(section).some(
        (key) => !["prepend_keymap", "keymap", "append_keymap"].includes(key),
      ))
  )
    throw new Error("Invalid keymap section");
  for (const list of [
    section?.prepend_keymap,
    section?.keymap,
    section?.append_keymap,
  ])
    if (list !== undefined && (!Array.isArray(list) || list.length > 512))
      throw new Error("Invalid keymap list");
  const validated = [
    ...(section?.prepend_keymap ?? []),
    ...(section?.keymap ?? DEFAULT_KEYMAP_INPUT[context]),
    ...(section?.append_keymap ?? []),
  ].map((entry) =>
    compileBinding(entry, context === "workspace" ? "workspace" : "mgr"),
  );
  const effective: KeymapBinding[] = [];
  for (const binding of validated) {
    if (
      !effective.some((earlier) =>
        earlier.keys
          .slice(0, Math.min(earlier.keys.length, binding.keys.length))
          .every((key, index) => binding.keys[index] === key),
      )
    )
      effective.push(binding);
  }
  return effective;
}
export function compileKeymap(config: KeymapConfigInput): EffectiveKeymap {
  if (
    typeof config !== "object" ||
    config === null ||
    Object.keys(config).some((key) => key !== "mgr" && key !== "workspace")
  )
    throw new Error("Invalid keymap configuration");
  return {
    file: compileSection(config.mgr, "file"),
    diff: compileSection(config.mgr, "diff"),
    workspace: compileSection(config.workspace, "workspace"),
  };
}
export function matchingBindings(
  bindings: readonly KeymapBinding[],
  prefix: readonly string[],
): readonly KeymapBinding[] {
  return bindings.filter(
    (binding) =>
      prefix.length <= binding.keys.length &&
      prefix.every((key, index) => binding.keys[index] === key),
  );
}
/** First-prefix priority lets a prepended sequence shadow a lower single-key default. */
export function reachableBindings(
  bindings: readonly KeymapBinding[],
  prefix: readonly string[],
): readonly KeymapBinding[] {
  return matchingBindings(bindings, prefix).filter(
    (binding, index, candidates) =>
      binding.keys.length > prefix.length &&
      !candidates
        .slice(0, index)
        .some(
          (earlier) =>
            earlier.keys.length > prefix.length &&
            earlier.keys.length <= binding.keys.length &&
            earlier.keys.every(
              (key, position) => binding.keys[position] === key,
            ),
        ),
  );
}
