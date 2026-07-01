import type { SyntaxKind } from "./prDiffSyntaxTypes";

function basename(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? path : path.slice(index + 1);
}

export function syntaxKindForPath(path: string): SyntaxKind {
  const name = basename(path).toLowerCase();
  const extension = name.includes(".") ? name.split(".").pop() : "";

  if (
    ["js", "jsx", "mjs", "cjs", "ts", "tsx", "mts", "cts"].includes(
      extension ?? "",
    )
  ) {
    return "javascript";
  }

  if (extension === "java") {
    return "java";
  }

  if (["scala", "sc"].includes(extension ?? "")) {
    return "scala";
  }

  if (["lisp", "lsp", "cl", "el"].includes(extension ?? "")) {
    return "lisp";
  }

  if (
    ["rb", "rake", "gemspec"].includes(extension ?? "") ||
    ["gemfile", "rakefile"].includes(name)
  ) {
    return "ruby";
  }

  if (["py", "pyw"].includes(extension ?? "")) {
    return "python";
  }

  if (["c", "h"].includes(extension ?? "")) {
    return "c";
  }

  if (["cpp", "cc", "cxx", "hpp", "hh", "hxx"].includes(extension ?? "")) {
    return "cpp";
  }

  if (extension === "zig") {
    return "zig";
  }

  if (["hs", "lhs", "hsc"].includes(extension ?? "")) {
    return "haskell";
  }

  if (extension === "rs") {
    return "rust";
  }

  if (extension === "vue") {
    return "vue";
  }

  if (extension === "sql") {
    return "sql";
  }

  if (["gradle", "groovy", "gvy", "gy", "gsh"].includes(extension ?? "")) {
    return "groovy";
  }

  if (["xml", "svg"].includes(extension ?? "")) {
    return "xml";
  }

  if (extension === "properties") {
    return "properties";
  }

  if (extension === "proto") {
    return "protobuf";
  }

  if (extension === "nix") {
    return "nix";
  }

  if (name === "dockerfile" || name.endsWith(".dockerfile")) {
    return "dockerfile";
  }

  if (name === "makefile" || name.endsWith(".mk")) {
    return "makefile";
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

function firstIndexOfAny(content: string, markers: readonly string[]): number {
  let first = -1;
  for (const marker of markers) {
    const index = content.indexOf(marker);
    if (index >= 0 && (first === -1 || index < first)) {
      first = index;
    }
  }

  return first;
}

export function commentStartForSyntax(
  content: string,
  syntaxKind: SyntaxKind,
): number {
  if (
    syntaxKind === "javascript" ||
    syntaxKind === "java" ||
    syntaxKind === "scala" ||
    syntaxKind === "c" ||
    syntaxKind === "cpp" ||
    syntaxKind === "zig" ||
    syntaxKind === "groovy" ||
    syntaxKind === "protobuf" ||
    syntaxKind === "rust" ||
    syntaxKind === "json"
  ) {
    return firstIndexOfAny(content, ["//", "/*"]);
  }

  if (syntaxKind === "sql") {
    return firstIndexOfAny(content, ["--", "/*"]);
  }

  if (syntaxKind === "haskell") {
    return firstIndexOfAny(content, ["--", "{-"]);
  }

  if (
    syntaxKind === "shell" ||
    syntaxKind === "ruby" ||
    syntaxKind === "python" ||
    syntaxKind === "properties" ||
    syntaxKind === "nix" ||
    syntaxKind === "dockerfile" ||
    syntaxKind === "makefile" ||
    syntaxKind === "toml" ||
    syntaxKind === "yaml"
  ) {
    return content.indexOf("#");
  }

  if (syntaxKind === "lisp") {
    return content.indexOf(";");
  }

  if (syntaxKind === "vue" || syntaxKind === "xml") {
    return firstIndexOfAny(content, ["<!--", "//", "/*"]);
  }

  if (syntaxKind === "css") {
    return content.indexOf("/*");
  }

  return -1;
}
