import type { SyntaxKind } from "./prDiffSyntaxTypes";

// Every diff kind has its own representative source and all current path aliases.
export const diffSyntaxFixtures = {
  plain: {
    aliases: ["sample.txt", "unknown"],
    source: "Ordinary text with 123 and Unicode 日本語.\n",
  },
  javascript: {
    aliases: ["js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts"],
    source:
      "export const result = async (value: number) => { return value + 42; }; // note\n",
  },
  java: {
    aliases: ["java"],
    source:
      'public class Sample { static int value = 42; String name = "hello"; } // note\n',
  },
  scala: {
    aliases: ["scala", "sc"],
    source:
      'object Sample { def value(x: Int) = if (x > 2) "yes" else "no" } // note\n',
  },
  lisp: {
    aliases: ["lisp", "lsp", "cl", "el"],
    source: '(defun sample (x) (if (> x 2) "yes" nil)) ; note\n',
  },
  ruby: {
    aliases: ["rb", "rake", "gemspec", "Gemfile", "Rakefile"],
    source: 'def sample(value); return "yes" if value > 42; end # note\n',
  },
  python: {
    aliases: ["py", "pyw"],
    source:
      'def sample(value: int): return "yes" if value > 42 else None # note\n',
  },
  c: {
    aliases: ["c", "h"],
    source: "static int sample(int value) { return value + 42; } /* note */\n",
  },
  cpp: {
    aliases: ["cpp", "cc", "cxx", "hpp", "hh", "hxx"],
    source:
      "template <typename T> constexpr T sample(T value) { return value + 42; } // note\n",
  },
  zig: {
    aliases: ["zig"],
    source:
      "pub fn sample(value: u32) u32 { const extra = 42; return value + extra; } // note\n",
  },
  haskell: {
    aliases: ["hs", "lhs", "hsc"],
    source:
      'sample value = let extra = 42 in if value > extra then "yes" else "no" -- note\n',
  },
  swift: {
    aliases: ["swift"],
    source:
      'public func sample(value: Int) -> String { return value > 42 ? "yes" : "no" } // note\n',
  },
  vue: {
    aliases: ["vue"],
    source:
      '<template><div v-if="true">{{ value + 42 }}</div></template> <!-- note -->\n',
  },
  sql: {
    aliases: ["sql"],
    source:
      "SELECT name, 42 FROM sample WHERE enabled = TRUE AND name = 'hello'; -- note\n",
  },
  groovy: {
    aliases: ["gradle", "groovy", "gvy", "gy", "gsh"],
    source:
      'def sample = { value -> return value + 42 }; implementation "sample:1.0" // note\n',
  },
  xml: {
    aliases: ["xml", "svg"],
    source:
      '<svg viewBox="0 0 42 42"><rect width="42" /></svg> <!-- note -->\n',
  },
  properties: {
    aliases: ["properties"],
    source: "sample.enabled = true; sample.count = 42 # note\n",
  },
  protobuf: {
    aliases: ["proto"],
    source:
      "message Sample { string name = 1; repeated int32 values = 2; } // note\n",
  },
  nix: {
    aliases: ["nix"],
    source: 'let value = 42; in { enabled = true; name = "hello"; } # note\n',
  },
  dockerfile: {
    aliases: ["Dockerfile", "sample.dockerfile"],
    source: 'RUN echo "hello" && exit 0 # note\n',
  },
  makefile: {
    aliases: ["Makefile", "mk"],
    source: "export SAMPLE := 42; include sample.mk # note\n",
  },
  rust: {
    aliases: ["rs"],
    source:
      "pub fn sample(value: u32) -> u32 { let extra = 42; value + extra } // note\n",
  },
  shell: {
    aliases: [
      "sample.sh",
      "sample.bash",
      "sample.zsh",
      "ksh",
      "env",
      ".bashrc",
      ".zshrc",
      ".profile",
      "bash",
      "sh",
      "zsh",
    ],
    source: 'if [ "$value" = "42" ]; then echo true; fi # note\n',
  },
  json: {
    aliases: ["json", "jsonc"],
    source:
      '{"name": "hello", "count": 42.5, "enabled": true, "items": [1, 2, null]}\n',
  },
  markdown: {
    aliases: ["md", "markdown"],
    source:
      "## Heading with `inline code`, [link](target), key: 42 and ordinary prose.\n",
  },
  css: {
    aliases: ["css", "scss", "sass"],
    source:
      '.sample { color: red !important; width: 42.5px; content: "hello"; } /* note */\n',
  },
  toml: {
    aliases: ["toml"],
    source: 'enabled = true; count = 42; name = "hello" # note\n',
  },
  yaml: {
    aliases: ["yaml", "yml"],
    source: 'sample: {enabled: true, count: 42, name: "hello"} # note\n',
  },
} as const satisfies Record<
  SyntaxKind,
  { readonly aliases: readonly string[]; readonly source: string }
>;

export const diffSyntaxKinds = Object.keys(diffSyntaxFixtures) as SyntaxKind[];

export function fixturePaths(kind: SyntaxKind): readonly string[] {
  return diffSyntaxFixtures[kind].aliases.map((alias) =>
    kind === "plain" ||
    alias.includes(".") ||
    /^[A-Z]/.test(alias) ||
    (kind === "shell" && ["bash", "sh", "zsh"].includes(alias))
      ? alias
      : `sample.${alias}`,
  );
}
