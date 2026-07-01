export type SyntaxKind =
  | "plain"
  | "javascript"
  | "java"
  | "scala"
  | "lisp"
  | "ruby"
  | "python"
  | "c"
  | "cpp"
  | "zig"
  | "haskell"
  | "vue"
  | "sql"
  | "groovy"
  | "xml"
  | "properties"
  | "protobuf"
  | "nix"
  | "dockerfile"
  | "makefile"
  | "rust"
  | "shell"
  | "json"
  | "markdown"
  | "css"
  | "toml"
  | "yaml";
export interface SyntaxSegment {
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
