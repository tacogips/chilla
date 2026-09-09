# Complete Syntax Inventory and Performance

## Scope

Measured locally on 2026-09-09 using Apple M4, arm64, macOS 26.5.2. Results are observations for the checked-in fixtures, not guarantees for arbitrary files.

This inventory covers two independent paths: Rust file previews and Markdown code fences, and the TypeScript diff tokenizer. The backend contains 76 actual grammar entries, including 7 hidden grammars. Hidden entries support embedded syntax and are benchmarked directly; they are not all standalone file types. Extension declarations can overlap and do not by themselves establish which grammar wins path detection.

Backend inventory: [machine-readable grammar metadata](../../src-tauri/examples/support/exhaustive_inventory.json). Fixtures select actual grammar scopes rather than accepting plain-text fallback: [backend fixtures](../../src-tauri/examples/support/exhaustive_fixtures.json).

The dedicated JSON source-file lexer is separate from the bundled JSON grammar used by fences. TypeScript/TSX/JSX backend aliases use JavaScript grammar, not a dedicated TypeScript grammar. Swift and Nix have dedicated diff tokenizers but currently fall back to plain text in backend file previews despite friendly display labels. These are existing support limitations, not newly added language support.

## Backend Grammar Entries

| Grammar | Scope | Declared extensions / names | Hidden |
| --- | --- | --- | --- |
| Plain Text | `text.plain` | `txt` | No |
| ASP | `source.asp` | `asa` | No |
| HTML (ASP) | `text.html.asp` | `asp` | No |
| ActionScript | `source.actionscript.2` | `as` | No |
| AppleScript | `source.applescript` | `applescript`, `script editor` | No |
| Batch File | `source.dosbatch` | `bat`, `cmd` | No |
| NAnt Build File | `source.nant-build` | `build` | No |
| C# | `source.cs` | `cs`, `csx` | No |
| C++ | `source.c++` | `cpp`, `cc`, `cp`, `cxx`, `c++`, `C`, `h`, `hh`, `hpp`, `hxx`, `h++`, `inl`, `ipp` | No |
| C | `source.c` | `c`, `h` | No |
| CSS | `source.css` | `css`, `css.erb`, `css.liquid` | No |
| Clojure | `source.clojure` | `clj` | No |
| D | `source.d` | `d`, `di` | No |
| Diff | `source.diff` | `diff`, `patch` | No |
| Erlang | `source.erlang` | `erl`, `hrl`, `Emakefile`, `emakefile` | No |
| HTML (Erlang) | `text.html.erlang.yaws` | `yaws` | No |
| Go | `source.go` | `go` | No |
| Graphviz (DOT) | `source.dot` | `dot`, `DOT`, `gv` | No |
| Groovy | `source.groovy` | `groovy`, `gvy`, `gradle` | No |
| HTML | `text.html.basic` | `html`, `htm`, `shtml`, `xhtml`, `inc`, `tmpl`, `tpl` | No |
| Haskell | `source.haskell` | `hs` | No |
| Literate Haskell | `text.tex.latex.haskell` | `lhs` | No |
| Java Server Page (JSP) | `text.html.jsp` | `jsp` | No |
| Java | `source.java` | `java`, `bsh` | No |
| JavaDoc | `text.html.javadoc` | — | No |
| Java Properties | `source.java-props` | `properties` | No |
| JSON | `source.json` | `json`, `sublime-settings`, `sublime-menu`, `sublime-keymap`, `sublime-mousemap`, `sublime-theme`, `sublime-build`, `sublime-project`, `sublime-completions`, `sublime-commands`, `sublime-macro`, `sublime-color-scheme` | No |
| JavaScript | `source.js` | `js`, `htc` | No |
| Regular Expressions (Javascript) | `source.regexp.js` | — | Yes |
| BibTeX | `text.bibtex` | `bib` | No |
| LaTeX Log | `text.log.latex` | — | No |
| LaTeX | `text.tex.latex` | `tex`, `ltx` | No |
| TeX | `text.tex` | `sty`, `cls` | No |
| Lisp | `source.lisp` | `lisp`, `cl`, `clisp`, `l`, `mud`, `el`, `scm`, `ss`, `lsp`, `fasl` | No |
| Lua | `source.lua` | `lua` | No |
| Make Output | `source.build_output` | — | Yes |
| Makefile | `source.makefile` | `make`, `GNUmakefile`, `makefile`, `Makefile`, `OCamlMakefile`, `mak`, `mk` | No |
| Markdown | `text.html.markdown` | `md`, `mdown`, `markdown`, `markdn` | No |
| MultiMarkdown | `text.html.markdown.multimarkdown` | — | No |
| MATLAB | `source.matlab` | `matlab` | No |
| OCaml | `source.ocaml` | `ml`, `mli` | No |
| OCamllex | `source.ocamllex` | `mll` | No |
| OCamlyacc | `source.ocamlyacc` | `mly` | No |
| camlp4 | `source.camlp4.ocaml` | — | No |
| Objective-C++ | `source.objc++` | `mm`, `M`, `h` | No |
| Objective-C | `source.objc` | `m`, `h` | No |
| PHP Source | `source.php` | — | Yes |
| PHP | `embedding.php` | `php`, `php3`, `php4`, `php5`, `php7`, `phps`, `phpt`, `phtml` | No |
| Pascal | `source.pascal` | `pas`, `p`, `dpr` | No |
| Perl | `source.perl` | `pl`, `pm`, `pod`, `t`, `PL` | No |
| Python | `source.python` | `py`, `py3`, `pyw`, `pyi`, `pyx`, `pyx.in`, `pxd`, `pxd.in`, `pxi`, `pxi.in`, `rpy`, `cpy`, `SConstruct`, `Sconstruct`, `sconstruct`, `SConscript`, `gyp`, `gypi`, `Snakefile`, `wscript` | No |
| Regular Expressions (Python) | `source.regexp.python` | — | Yes |
| R Console | `source.r-console` | — | No |
| R | `source.r` | `R`, `r`, `s`, `S`, `Rprofile` | No |
| Rd (R Documentation) | `text.tex.latex.rd` | `rd` | No |
| HTML (Rails) | `text.html.ruby` | `rails`, `rhtml`, `erb`, `html.erb` | No |
| JavaScript (Rails) | `source.js.rails` | `js.erb` | No |
| Ruby Haml | `text.haml` | `haml`, `sass` | No |
| Ruby on Rails | `source.ruby.rails` | `rxml`, `builder` | No |
| SQL (Rails) | `source.sql.ruby` | `erbsql`, `sql.erb` | No |
| Regular Expression | `source.regexp` | `re` | No |
| reStructuredText | `text.restructuredtext` | `rst`, `rest` | No |
| Ruby | `source.ruby` | `rb`, `Appfile`, `Appraisals`, `Berksfile`, `Brewfile`, `capfile`, `cgi`, `Cheffile`, `config.ru`, `Deliverfile`, `Fastfile`, `fcgi`, `Gemfile`, `gemspec`, `Guardfile`, `irbrc`, `jbuilder`, `podspec`, `prawn`, `rabl`, `rake`, `Rakefile`, `Rantfile`, `rbx`, `rjs`, `ruby.rail`, `Scanfile`, `simplecov`, `Snapfile`, `thor`, `Thorfile`, `Vagrantfile` | No |
| Cargo Build Results | `source.build_results` | — | Yes |
| Rust | `source.rust` | `rs` | No |
| SQL | `source.sql` | `sql`, `ddl`, `dml` | No |
| Scala | `source.scala` | `scala`, `sbt` | No |
| Bourne Again Shell (bash) | `source.shell.bash` | `sh`, `bash`, `zsh`, `fish`, `.bash_aliases`, `.bash_completions`, `.bash_functions`, `.bash_login`, `.bash_logout`, `.bash_profile`, `.bash_variables`, `.bashrc`, `.profile`, `.textmate_init` | No |
| Shell-Unix-Generic | `source.shell` | — | Yes |
| commands-builtin-shell-bash | `commands.builtin.shell.bash` | — | Yes |
| HTML (Tcl) | `text.html.tcl` | `adp` | No |
| Tcl | `source.tcl` | `tcl` | No |
| Textile | `text.html.textile` | `textile` | No |
| XML | `text.xml` | `xml`, `xsd`, `xslt`, `tld`, `dtml`, `rss`, `opml`, `svg` | No |
| YAML | `source.yaml` | `yaml`, `yml`, `sublime-syntax` | No |
| TOML | `source.toml` | `toml`, `tml`, `Cargo.lock`, `Gopkg.lock`, `Pipfile`, `pdm.lock`, `poetry.lock`, `uv.lock` | No |

## Diff Tokenizers and Measured Results

All 28 kinds are covered by [exhaustive fixtures](../../src/features/pr-diff/prDiffSyntaxFixtures.ts) and semantic regression tests. Aliases below describe the diff path only; bare extension tokens stand for filenames with that extension, while explicit filenames retain their filename meaning.

Measurements use Bun 1.4.0: medians of nine warmed passes over 2,000 distinct synthetic lines per kind, against frozen original implementations. There is no result cache. This measures tokenization, not file loading, DOM layout, webview paint, or isolated application startup. Source lengths and first observed pass results are retained in the [complete benchmark artifact](../references/diff-syntax-performance.json).

Shared improvements reuse keyword sets, replace per-character regular expression allocation with ASCII checks, and merge adjacent equal-style spans. Markdown also avoids repeatedly scanning failed identifier, link, and backtick candidates. Tests preserve exact source and per-character token styles while allowing equivalent span coalescing.

| Kind | Aliases / paths | Before (ms) | After (ms) | Speedup |
| --- | --- | ---: | ---: | ---: |
| plain | `sample.txt`, `unknown` | 0.12 | 0.10 | Existing O(1) path |
| javascript | `js`, `jsx`, `mjs`, `cjs`, `ts`, `tsx`, `mts`, `cts` | 8.76 | 5.27 | 1.66x |
| java | `java` | 9.60 | 4.46 | 2.15x |
| scala | `scala`, `sc` | 9.39 | 3.27 | 2.88x |
| lisp | `lisp`, `lsp`, `cl`, `el` | 6.52 | 2.24 | 2.92x |
| ruby | `rb`, `rake`, `gemspec`, `Gemfile`, `Rakefile` | 7.72 | 2.44 | 3.17x |
| python | `py`, `pyw` | 8.79 | 2.84 | 3.10x |
| c | `c`, `h` | 7.84 | 2.58 | 3.04x |
| cpp | `cpp`, `cc`, `cxx`, `hpp`, `hh`, `hxx` | 10.11 | 3.27 | 3.09x |
| zig | `zig` | 10.58 | 4.36 | 2.43x |
| haskell | `hs`, `lhs`, `hsc` | 9.26 | 3.80 | 2.44x |
| swift | `swift` | 10.73 | 3.86 | 2.78x |
| vue | `vue` | 8.03 | 2.85 | 2.82x |
| sql | `sql` | 9.13 | 3.34 | 2.74x |
| groovy | `gradle`, `groovy`, `gvy`, `gy`, `gsh` | 8.63 | 2.75 | 3.14x |
| xml | `xml`, `svg` | 4.53 | 2.35 | 1.93x |
| properties | `properties` | 3.69 | 1.75 | 2.11x |
| protobuf | `proto` | 8.16 | 2.91 | 2.81x |
| nix | `nix` | 5.73 | 2.75 | 2.08x |
| dockerfile | `Dockerfile`, `sample.dockerfile` | 4.44 | 1.48 | 3.01x |
| makefile | `Makefile`, `mk` | 4.40 | 1.83 | 2.41x |
| rust | `rs` | 9.37 | 3.90 | 2.40x |
| shell | `sample.sh`, `sample.bash`, `sample.zsh`, `ksh`, `env`, `.bashrc`, `.zshrc`, `.profile`, `bash`, `sh`, `zsh` | 4.71 | 2.24 | 2.10x |
| json | `json`, `jsonc` | 5.67 | 4.87 | 1.16x |
| markdown | `md`, `markdown` | 10.60 | 6.79 | 1.56x |
| css | `css`, `scss`, `sass` | 6.25 | 4.26 | 1.47x |
| toml | `toml` | 4.07 | 3.44 | 1.18x |
| yaml | `yaml`, `yml` | 4.29 | 3.29 | 1.30x |

All 27 highlighted diff kinds improved warmed medians in this run. Plain text retains its existing constant-time path; its small timing difference is not an optimization claim. JSON's first observed pass increased from 5.91 to 8.76 ms even though its warmed median improved; this single pass includes JIT/GC effects and is not an isolated startup comparison.

Reproduce with `mise exec -- bun src/features/pr-diff/prDiffSyntax.bench.ts`.

## Backend Optimization and Measured Results

The baseline for this pass already includes the prebuilt grammar bundle, Oniguruma engine, and dedicated JSON lexer described in [design notes](notes.md#shared-syntax-highlighting-performance). This additional optimization reuses immutable per-theme highlighters, memoizes scope-to-style calculations within a render, caches CSS opening tags, and streams escaped text without collecting a styled-region vector for every line.

Scope memoization is bounded to 512 paths of at most 32 scopes; opening tags are bounded to 128 styles. When the scope bound is reached, rendering switches to Syntect's incremental styling from the current complete scope stack and offset, without restarting the file. Caches never retain source documents between calls. The JSON source-file lexer remains on its existing fast path.

The [full after artifact](../../src-tauri/examples/support/exhaustive_after.json) includes paired reference/optimized samples, separate initialization and stage measurements, exact HTML fingerprints, and authoritative extension/filename/fence resolution. The [baseline artifact](../../src-tauri/examples/support/exhaustive_baseline.json) retains the reference measurements and fingerprints.

The table uses the median of three reference and three optimized **release** calls recorded in the same after run, with approximately 8 KiB of synthetic source per grammar. Every call reparses the complete source; regex compilation is already warm and there is no whole-document result cache. This is not UI load time. Theme loading is excluded from the separate cold metrics; cold full rendering and instrumented cold stages each use their own fresh grammar bundle.

Across the 152 grammar/theme cases, summed medians decrease from 1,830.97 to 1,485.11 ms (18.9%). Python improves from 17.02 to 14.14 ms in dark mode and 26.29 to 16.98 ms in light mode. The aggregate is not a promise that every case improves: seven dark-mode cases exceed a 5% slowdown in this initial run—Java, OCamllex, OCamlyacc, Perl, HTML (Rails), Bash, and Textile. Their original per-case values remain visible below, with focused rechecks recorded after the table.

| Grammar | Dark before (ms) | Dark after (ms) | Light before (ms) | Light after (ms) |
| --- | ---: | ---: | ---: | ---: |
| Plain Text | 0.22 | 0.20 | 0.27 | 0.20 |
| ASP | 11.48 | 11.47 | 14.00 | 11.01 |
| HTML (ASP) | 15.41 | 14.79 | 20.03 | 14.56 |
| ActionScript | 4.46 | 4.36 | 5.71 | 5.01 |
| AppleScript | 16.79 | 17.41 | 19.79 | 16.65 |
| Batch File | 12.67 | 12.31 | 15.38 | 11.24 |
| NAnt Build File | 1.99 | 1.48 | 4.74 | 1.71 |
| C# | 11.28 | 11.65 | 20.64 | 11.05 |
| C++ | 15.71 | 14.92 | 19.85 | 14.94 |
| C | 8.94 | 8.24 | 13.84 | 8.32 |
| CSS | 11.41 | 10.72 | 15.14 | 11.27 |
| Clojure | 11.50 | 10.89 | 16.17 | 10.65 |
| D | 8.49 | 7.44 | 8.51 | 7.42 |
| Diff | 2.20 | 1.73 | 2.69 | 1.75 |
| Erlang | 7.24 | 6.94 | 11.37 | 7.49 |
| HTML (Erlang) | 8.53 | 7.54 | 12.18 | 7.13 |
| Go | 7.39 | 6.30 | 13.27 | 5.73 |
| Graphviz (DOT) | 4.26 | 3.85 | 7.27 | 3.99 |
| Groovy | 4.84 | 4.21 | 7.32 | 4.19 |
| HTML | 9.55 | 8.39 | 11.46 | 7.10 |
| Haskell | 2.93 | 2.74 | 3.93 | 2.78 |
| Literate Haskell | 3.91 | 3.65 | 5.99 | 3.89 |
| Java Server Page (JSP) | 2.32 | 2.04 | 3.94 | 1.69 |
| Java | 8.80 | 9.68 | 13.78 | 10.05 |
| JavaDoc | 0.34 | 0.33 | 0.31 | 0.30 |
| Java Properties | 1.21 | 0.90 | 2.10 | 1.02 |
| JSON | 5.54 | 4.22 | 12.10 | 4.52 |
| JavaScript | 12.11 | 10.69 | 14.73 | 12.11 |
| Regular Expressions (Javascript) | 5.81 | 5.10 | 9.67 | 5.17 |
| BibTeX | 2.89 | 2.37 | 6.60 | 2.74 |
| LaTeX Log | 0.86 | 0.72 | 0.87 | 0.74 |
| LaTeX | 8.44 | 8.68 | 13.54 | 7.56 |
| TeX | 6.37 | 5.62 | 11.46 | 5.55 |
| Lisp | 33.05 | 32.37 | 36.10 | 32.01 |
| Lua | 3.88 | 2.86 | 4.89 | 2.89 |
| Make Output | 0.61 | 0.58 | 0.62 | 0.57 |
| Makefile | 12.99 | 10.91 | 15.51 | 10.02 |
| Markdown | 8.18 | 8.58 | 9.55 | 9.58 |
| MultiMarkdown | 7.37 | 7.03 | 9.49 | 6.67 |
| MATLAB | 45.79 | 43.23 | 44.38 | 42.29 |
| OCaml | 7.63 | 7.68 | 9.10 | 6.46 |
| OCamllex | 7.47 | 8.50 | 9.71 | 7.46 |
| OCamlyacc | 4.24 | 4.71 | 7.36 | 4.94 |
| camlp4 | 0.89 | 0.81 | 0.76 | 0.55 |
| Objective-C++ | 11.36 | 11.01 | 15.08 | 11.53 |
| Objective-C | 8.57 | 7.96 | 11.58 | 8.11 |
| PHP Source | 13.64 | 14.00 | 20.43 | 13.67 |
| PHP | 14.70 | 13.48 | 25.67 | 15.57 |
| Pascal | 4.76 | 3.89 | 5.07 | 3.83 |
| Perl | 8.73 | 9.39 | 11.36 | 8.15 |
| Python | 17.02 | 14.14 | 26.29 | 16.98 |
| Regular Expressions (Python) | 5.74 | 4.91 | 12.23 | 5.52 |
| R Console | 23.81 | 24.76 | 35.03 | 25.10 |
| R | 32.52 | 32.06 | 40.99 | 34.43 |
| Rd (R Documentation) | 26.72 | 23.94 | 32.33 | 22.98 |
| HTML (Rails) | 17.59 | 18.48 | 22.89 | 17.04 |
| JavaScript (Rails) | 21.70 | 18.78 | 22.66 | 19.09 |
| Ruby Haml | 15.47 | 15.62 | 18.70 | 14.56 |
| Ruby on Rails | 33.58 | 20.96 | 23.54 | 20.03 |
| SQL (Rails) | 17.55 | 17.84 | 18.25 | 17.02 |
| Regular Expression | 18.39 | 15.88 | 28.55 | 16.00 |
| reStructuredText | 5.00 | 4.84 | 6.92 | 4.65 |
| Ruby | 18.93 | 16.90 | 20.54 | 19.50 |
| Cargo Build Results | 0.61 | 0.53 | 0.59 | 0.53 |
| Rust | 10.18 | 10.23 | 16.07 | 9.30 |
| SQL | 8.38 | 8.33 | 9.57 | 8.63 |
| Scala | 18.62 | 19.40 | 21.57 | 18.77 |
| Bourne Again Shell (bash) | 11.48 | 12.50 | 20.54 | 10.76 |
| Shell-Unix-Generic | 17.61 | 14.60 | 21.39 | 14.82 |
| commands-builtin-shell-bash | 3.52 | 3.00 | 3.95 | 3.47 |
| HTML (Tcl) | 8.49 | 7.18 | 12.56 | 7.96 |
| Tcl | 7.25 | 7.07 | 11.27 | 6.20 |
| Textile | 4.17 | 4.48 | 5.06 | 4.58 |
| XML | 3.27 | 2.85 | 7.92 | 2.63 |
| YAML | 10.95 | 11.08 | 13.28 | 11.01 |
| TOML | 5.82 | 5.31 | 8.87 | 5.47 |

A focused confirmation uses 15 samples with alternating reference/optimized order: [targeted release artifact](../../src-tauri/examples/support/exhaustive_targeted_release.json). Six of the seven apparent regressions do not reproduce; Textile remains essentially unchanged (+0.03 ms, 0.7%). This demonstrates why the original three-sample differences should not be treated as stable regressions or universal speedup guarantees. No grammar-specific dispatch exception was added.

| Rechecked dark grammar | Reference median (ms) | Optimized median (ms) |
| --- | ---: | ---: |
| Java | 10.94 | 10.66 |
| OCamllex | 10.55 | 10.35 |
| OCamlyacc | 6.06 | 5.26 |
| Perl | 10.18 | 10.06 |
| HTML (Rails) | 21.26 | 20.35 |
| Bourne Again Shell (bash) | 13.15 | 11.94 |
| Textile | 4.66 | 4.69 |


Reproduce the matrix with `CARGO_TERM_QUIET=true mise exec -- cargo run --locked --release --manifest-path src-tauri/Cargo.toml --example exhaustive_syntax_performance`; add `-- --baseline` for the reference pipeline. Omit `--release` for debug measurements. Focus a run with `-- --scope=source.python --samples=15`; `--theme=dark` restricts it to one theme.

### Python Confirmation and Debug Dependencies

A further Python release run was noisy: dark optimized samples ranged from 14.33 to 63.54 ms and its median regressed. The [noisy artifact](../../src-tauri/examples/support/exhaustive_python_release.json) is retained. One final nine-pair alternating-order run, also retained in [the final release artifact](../../src-tauri/examples/support/exhaustive_python_release_final.json), measures dark 17.37 to 16.88 ms and light 24.63 to 16.86 ms. These observations support only a modest, variable dark-theme gain, not a fixed universal Python speedup.

The remaining large debug-build cost warranted a separate change: root Cargo profiles compile only `syntect`, `onig`, and `onig_sys` at optimization level 3. Chilla's own code remains unoptimized with debug assertions/debug information; stepping inside the three optimized dependencies is less direct and their initial compilation is longer. No dependency versions, command contracts, or release profiles change.

Nine-pair Python measurements compare the same streaming renderer before and after that dependency profile change:

| Debug Python metric | Before dependency optimization | After dependency optimization |
| --- | ---: | ---: |
| Dark warm median | 541.36 ms | 17.42 ms |
| Dark warm range | 364.07–658.30 ms | 17.31–19.97 ms |
| Light warm median | 135.01 ms | 20.40 ms |
| Light warm range | 109.33–477.01 ms | 17.49–22.17 ms |
| Dark cold total, excluding theme loading | 1370.03 ms | 53.06 ms |
| Light cold total, excluding theme loading | 618.86 ms | 53.63 ms |

All samples are retained in [debug before](../../src-tauri/examples/support/exhaustive_python_debug_before.json) and [debug after](../../src-tauri/examples/support/exhaustive_python_debug_after.json); the earlier run has substantial host variability. Exact source/HTML fingerprints agree. With optimized dependencies, the original Syntect renderer is slightly faster for debug/dark Python (13.45 versus 17.42 ms), while the streaming renderer is faster for debug/light Python (23.77 versus 20.40 ms). This small per-render tradeoff is explicit; the large debug improvement comes from dependency compilation, not the scope cache alone.

### Dispatch and Existing Support Gaps

Actual resolution, not just grammar-declared extensions, is recorded under `dispatch` in the after artifact. It includes all declared extension entries as filenames, fence tokens, and bare filenames. Overlapping extensions and lowercasing can resolve to another grammar; a grammar's presence does not guarantee a matching basename is detected.

| Fence aliases | Resolved scope |
| --- | --- |
| `ts`, `typescript`, `tsx`, `jsx` | `source.js` |
| `shell`, `shellscript`, `console` | `source.shell.bash` |
| `md` | `text.html.markdown` |
| `swift`, `nix` | `text.plain` |
| `json` | `source.json` |

Shell startup aliases `.bashrc`, `.bash_profile`, `.bash_login`, `.bash_logout`, `.bash_aliases`, `.profile`, `.zshenv`, `.zprofile`, `.zshrc`, `.zlogin`, `.zlogout`, and bare `bash`, `sh`, `zsh` resolve to Bash grammar. `.json` source paths use the dedicated lexer, including uppercase `.JSON`; JSON fences use the bundled grammar.

The following existing backend detection limitations are explicitly recorded, not counted as dedicated language coverage. A first-line signature can still select a grammar when present; these rows use empty source to isolate path detection.

| Path | Display label | Actual path-only grammar |
| --- | --- | --- |
| `sample.env` | Shell | Plain Text |
| `sample.ksh` | Shell | Plain Text |
| `sample.nix` | Nix | Plain Text |
| `sample.swift` | Swift | Plain Text |
| `Cargo.lock` | Plain Text | Plain Text |
| `Makefile` | Plain Text | Plain Text |
| `Gemfile` | Plain Text | Plain Text |

## Verification Status

Checks pass for all 152 exact HTML/source comparisons and 16 targeted tests, including zero-width operations, Clear/Restore scope history, cache saturation, late midline fallback, escaping, and both themes. Final independent verification, including subsequent compact source layout and toolbar changes, passes all 212 locked Rust library tests in serial execution, all-target Clippy with warnings denied, 351 DOM tests, 39 Bun tests, app/E2E typechecking, and scoped Biome. The DOM suite includes the 58 exhaustive syntax tests.

The debug app was rebuilt and launched with `/Users/taco/gits/tacogips/chilla/target/debug/chilla --verbose /tmp/chilla-exhaustive-launch.Yu69di/sample.py > /tmp/chilla-exhaustive-launch.Yu69di/final-app.log 2>&1`. Its 9000-byte synthetic Python preview completes in 62 ms, compared with 590 ms in the earlier debug launch before dependency optimization. Diagnostic logs are `/Users/taco/Library/Logs/chilla/chilla-verbose-68368.log` and `chilla-verbose-56774.log` respectively. These are backend command durations, not webview paint timing, and the final app also includes the source-footer change.

Builds pass using `CARGO_TERM_QUIET=true mise exec -- bun run tauri build --debug --bundles app` and, after the final toolbar-only update, `CARGO_TERM_QUIET=true mise exec -- bun run tauri build --debug --no-bundle`. Output is in `/tmp/chilla-exhaustive-launch.Yu69di/final-build.log` and `icons-build.log`. The configured bundle build also completed its automatic signing/notarization; no release was published.

Native Computer Use through the Node bridge visually confirms Python/JSON content occupying the pane, compact footer placement, independent source scrolling, and icon-only toolbar controls. Existing Chilla instances made the inspector ambiguous, so verification used a temporary copy containing the rebuilt debug binary/assets with a distinct local bundle identifier and ad-hoc signature. Launch: `open -n /tmp/chilla-exhaustive-launch.Yu69di/chilla-verify.app --args --verbose /tmp/chilla-exhaustive-launch.Yu69di/sample.json`. The Open files icon opens the native chooser. The user subsequently took over that verification window, so it was left open and automated interaction stopped; other user windows were untouched. Native zoom-key interaction was not confirmed; code-only zoom is covered by automated tests. Other operating systems and webview paint timing were not measured.
