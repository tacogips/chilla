import { describe, expect, it } from "vitest";
import {
  compileKeymap,
  DEFAULT_KEYMAP_INPUT,
  eventKey,
  matchingBindings,
  normalizeKey,
  reachableBindings,
} from "./keymap";

describe("keymap compilation", () => {
  it("has no shadowed defaults or unrelated browser/workspace prefix collisions", () => {
    const defaults = compileKeymap({});
    for (const context of ["file", "diff", "workspace"] as const) {
      // Compilation removes unreachable bindings, so compare against the raw defaults.
      expect(defaults[context]).toHaveLength(
        DEFAULT_KEYMAP_INPUT[context].length,
      );
    }
    for (const context of ["file", "diff"] as const) {
      const overlaps = defaults[context].flatMap((browser) =>
        defaults.workspace
          .filter((workspace) => {
            const prefixLength = Math.min(
              browser.keys.length,
              workspace.keys.length,
            );
            return browser.keys
              .slice(0, prefixLength)
              .every((key, index) => key === workspace.keys[index]);
          })
          .map((workspace) => ({
            keys: browser.keys,
            browser: browser.actions,
            workspace: workspace.actions,
          })),
      );
      // These equivalent actions intentionally follow the active surface.
      const navigation = [
        { keys: ["j"], browser: ["cursor.down"], workspace: ["document.next"] },
        {
          keys: ["<Down>"],
          browser: ["cursor.down"],
          workspace: ["document.next"],
        },
        {
          keys: ["k"],
          browser: ["cursor.up"],
          workspace: ["document.previous"],
        },
        {
          keys: ["<Up>"],
          browser: ["cursor.up"],
          workspace: ["document.previous"],
        },
      ];
      expect(overlaps).toEqual(
        context === "file"
          ? navigation
          : [
              ...navigation,
              {
                keys: ["1"],
                browser: ["diff.view.split"],
                workspace: ["presentation.raw"],
              },
              {
                keys: ["2"],
                browser: ["diff.view.stack"],
                workspace: ["presentation.rendered"],
              },
              {
                keys: ["<C-d>"],
                browser: ["scroll.down"],
                workspace: ["scroll.down"],
              },
              {
                keys: ["<C-u>"],
                browser: ["scroll.up"],
                workspace: ["scroll.up"],
              },
            ],
      );
    }
  });

  it("preserves defaults and merges prepend/default/append with first-key priority", () => {
    const defaults = compileKeymap({});
    expect(matchingBindings(defaults.file, ["s"])[0]?.actions).toEqual([
      "search.name",
    ]);
    expect(matchingBindings(defaults.file, [",", "S"])[0]?.actions).toEqual([
      "sort.size.desc",
    ]);
    const config = compileKeymap({
      mgr: {
        prepend_keymap: [{ on: "s", run: "noop" }],
        append_keymap: [
          { on: "s", run: "search.content" },
          { on: "z", run: "view.toggle" },
        ],
      },
    });
    expect(matchingBindings(config.file, ["s"])).toHaveLength(1);
    expect(matchingBindings(config.file, ["s"])[0]?.actions).toEqual(["noop"]);
    expect(matchingBindings(config.file, ["z"])[0]?.actions).toEqual([
      "view.toggle",
    ]);
    expect(config.workspace).toEqual(defaults.workspace);
  });

  it("distinguishes empty replacement from omitted lists in both contexts", () => {
    const config = compileKeymap({
      mgr: { keymap: [] },
      workspace: { keymap: [] },
    });
    expect(config).toEqual({ file: [], diff: [], workspace: [] });
    const extended = compileKeymap({
      mgr: {
        prepend_keymap: [{ on: "x", run: "filter" }],
        keymap: [],
        append_keymap: [{ on: "z", run: "open" }],
      },
    });
    expect(extended.file.map((binding) => binding.keys)).toEqual([
      ["x"],
      ["z"],
    ]);
    expect(extended.diff).toEqual(extended.file);
  });

  it("keeps independent higher-priority continuations but eliminates shadowed prefixes", () => {
    const map = compileKeymap({
      mgr: {
        keymap: [
          { on: ["g", "f"], run: "filter", desc: "Find locally" },
          { on: "g", run: "open" },
          { on: ["g", "s"], run: "search.name", desc: "Find recursively" },
          { on: ["g", "f", "x"], run: "noop" },
        ],
      },
    });
    expect(map.file.map((binding) => binding.keys)).toEqual([
      ["g", "f"],
      ["g", "s"],
    ]);
    expect(
      reachableBindings(map.file, ["g"]).map((binding) => binding.description),
    ).toEqual(["Find locally", "Find recursively"]);
    expect(matchingBindings(map.file, ["g", "s"])[0]?.actions).toEqual([
      "search.name",
    ]);
    expect(matchingBindings(map.file, ["g", "s", "x"])).toEqual([]);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    "supports %i-key sequences and ordered action arrays",
    (length) => {
      const keys = Array.from({ length }, (_, index) => String(index));
      const map = compileKeymap({
        mgr: { keymap: [{ on: keys, run: ["filter", "view.toggle"] }] },
      });
      expect(map.file[0]).toEqual({
        keys,
        actions: ["filter", "view.toggle"],
        description: "filter, view.toggle",
      });
    },
  );

  it.each([{ keys: [] }, { keys: Array.from({ length: 9 }, () => "a") }])(
    "rejects out-of-range sequences",
    ({ keys }) => {
      expect(() =>
        compileKeymap({ mgr: { keymap: [{ on: keys, run: "open" }] } }),
      ).toThrow();
    },
  );

  it("rejects invalid bindings atomically, even when shadowed", () => {
    expect(() =>
      compileKeymap({
        mgr: {
          prepend_keymap: [{ on: "s", run: "noop" }],
          append_keymap: [{ on: "s", run: "shell echo unsafe" }],
        },
      }),
    ).toThrow();
    expect(() =>
      compileKeymap({
        mgr: { keymap: [{ on: "a", run: ["open", "document.save"] }] },
      }),
    ).toThrow();
    expect(() =>
      compileKeymap({
        workspace: { keymap: [{ on: "a", run: "search.name" }] },
      }),
    ).toThrow();
    expect(() =>
      compileKeymap({ mgr: { keymap: [{ on: "a", run: [] }] } }),
    ).toThrow();
    expect(() =>
      compileKeymap({
        mgr: { keymap: [{ on: "a", run: "open", desc: "a".repeat(513) }] },
      }),
    ).toThrow();
  });

  it("reserves Escape continuations for cancellation but permits an initial Escape binding", () => {
    expect(() =>
      compileKeymap({
        mgr: { keymap: [{ on: ["g", "<Escape>"], run: "open" }] },
      }),
    ).toThrow();
    expect(
      compileKeymap({ mgr: { keymap: [{ on: "<Esc>", run: "noop" }] } }).file[0]
        ?.keys,
    ).toEqual(["<Esc>"]);
  });
});

describe("key notation", () => {
  it.each([
    [" ", "<Space>"],
    ["<space>", "<Space>"],
    ["<return>", "<Enter>"],
    ["<Escape>", "<Esc>"],
    ["<ctrl-s>", "<C-s>"],
    ["<Cmd-s>", "<D-s>"],
    ["<shift-s>", "S"],
    ["<C-S-s>", "<C-S-s>"],
    ["<C-S>", "<C-S-s>"],
    ["<S-Tab>", "<S-Tab>"],
    ["<F24>", "<F24>"],
    ["界", "界"],
  ])("normalizes %s to %s", (input, expected) =>
    expect(normalizeKey(input)).toBe(expected),
  );

  it.each(["", "gg", "<unknown>", "<C-C-s>", "<Hyper-s>", "<C->", "<F25>"])(
    "rejects %s",
    (input) => {
      expect(() => normalizeKey(input)).toThrow();
    },
  );

  it("normalizes keyboard events consistently including modifiers and physical letter codes", () => {
    expect(eventKey(new KeyboardEvent("keydown", { key: " " }))).toBe(
      normalizeKey(" "),
    );
    expect(
      eventKey(new KeyboardEvent("keydown", { key: "s", shiftKey: true })),
    ).toBe("S");
    expect(
      eventKey(
        new KeyboardEvent("keydown", {
          key: "S",
          ctrlKey: true,
          shiftKey: true,
        }),
      ),
    ).toBe("<C-S-s>");
    expect(
      eventKey(
        new KeyboardEvent("keydown", { key: "ß", code: "KeyS", altKey: true }),
      ),
    ).toBe("<A-s>");
    expect(eventKey(new KeyboardEvent("keydown", { key: "ArrowDown" }))).toBe(
      "<Down>",
    );
    expect(
      eventKey(new KeyboardEvent("keydown", { key: "Control", ctrlKey: true })),
    ).toBeNull();
  });
});
