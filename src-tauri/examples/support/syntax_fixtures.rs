//! Public, synthetic snippets; never derive fixtures from local user files.

pub const LANGUAGES: &[&str] = &[
    "rust",
    "typescript",
    "javascript",
    "python",
    "shell",
    "toml",
    "yaml",
    "css",
    "html",
    "xml",
    "markdown",
    "plain",
    "json",
];

pub fn fixture(language: &str) -> Option<(&'static str, String)> {
    let (extension, snippet) = match language {
        "rust" => ("rs", "// Unicode and escaping: 日本語 <>&\n#[derive(Debug)]\nstruct Item { name: String, count: usize }\nfn render(item: &Item) -> String {\n    let label = format!(\"{}: {}\", item.name, item.count);\n    if item.count > 0 { label } else { String::new() }\n}\n"),
        "typescript" => ("ts", "// Typed frontend model\ninterface Item { name: string; count: number; }\nexport const render = (item: Item): string => {\n  const label = `${item.name}: ${item.count}`;\n  return item.count > 0 ? label : \"日本語 <>&\";\n};\n"),
        "javascript" => ("js", "// Regex and template interpolation\nexport function render(item) {\n  const pattern = /[a-z]+/gi;\n  const label = `${item.name}: ${item.count}`;\n  return pattern.test(label) ? label : \"日本語 <>&\";\n}\n"),
        "python" => ("py", "# Decorator, interpolation, Unicode\n@dataclass\nclass Item:\n    name: str\n    count: int = 0\n\ndef render(item: Item) -> str:\n    return f\"{item.name}: {item.count}\" if item.count > 0 else '日本語 <>&'\n\n"),
        "shell" => ("sh", "# Command substitution and parameters\nrender() {\n  local label=\"${1:-日本語 <>&}\"\n  for item in one two three; do\n    printf '%s: %s\\n' \"$label\" \"$item\"\n  done\n}\nrender \"$(printf 'sample')\"\n"),
        "toml" => ("toml", "# Configuration fixture\n[application]\nname = \"日本語 <>&\"\nenabled = true\ncount = 1_024\nratio = 1.5e2\npaths = [\"first\", \"second\"]\n[application.theme]\ncolor = \"#ffffff\"\n\n"),
        "yaml" => ("yaml", "# Configuration fixture\napplication:\n  name: \"日本語 <>&\"\n  enabled: true\n  count: 1024\n  paths:\n    - first\n    - second\n  description: |\n    A multiline description\n    with another line.\n\n"),
        "css" => ("css", "/* Selectors, functions, variables */\n.preview > .item:hover {\n  color: var(--foreground, #ffffff);\n  margin: calc(100% - 2rem);\n  content: \"日本語 <>&\";\n}\n@media (min-width: 800px) { .item { display: grid; } }\n"),
        "html" => ("html", "<!-- Embedded CSS and JavaScript -->\n<section class=\"preview\" data-id=\"1\"><p>日本語 &amp; text</p></section>\n<style>.preview { color: #fff; }</style>\n<script>const label = `item ${1 + 2}`; console.log(label);</script>\n"),
        "xml" => ("xml", "<!-- Namespace, attributes, CDATA -->\n<item xmlns:x=\"urn:example\" x:id=\"1\">\n  <name>日本語 &amp; text</name>\n  <source><![CDATA[if (a < b && c > d) {}]]></source>\n</item>\n"),
        "markdown" => ("md", "# Heading\n\nA **bold** and *italic* paragraph with [a link](https://example.com).\n\n- first\n- 日本語 <>&\n\n```rust\nfn main() { println!(\"hello\"); }\n```\n\n> A quotation.\n\n"),
        "plain" => ("txt", "Plain text with 日本語, punctuation <>&, and multiple words.\nAnother line without a recognized language or shebang.\n\n"),
        "json" => ("json", "{\"name\":\"日本語 <>&\",\"count\":1024,\"enabled\":true,\"values\":[1,2,null]}\n"),
        _ => return None,
    };
    let repetitions = 16_384_usize.div_ceil(snippet.len());
    Some((extension, snippet.repeat(repetitions)))
}
