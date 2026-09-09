import { highlightSyntaxSegments } from "./prDiffSyntax";
import { highlightSyntaxSegments as reference } from "./prDiffSyntaxReference.fixture";
import { diffSyntaxFixtures, diffSyntaxKinds } from "./prDiffSyntaxFixtures";
import type { SyntaxKind } from "./prDiffSyntaxTypes";

function measure(
  highlight: typeof reference,
  kind: SyntaxKind,
  lines: readonly string[],
): { milliseconds: number; firstPassMilliseconds: number; segments: number } {
  const samples: number[] = [];
  let segments = 0;
  let firstPassMilliseconds = 0;
  for (let run = 0; run < 11; run += 1) {
    const start = performance.now();
    let count = 0;
    for (const line of lines) count += highlight(line, kind).length;
    const elapsed = performance.now() - start;
    if (run === 0) firstPassMilliseconds = elapsed;
    if (run > 1) samples.push(elapsed);
    segments = count;
  }
  samples.sort((a, b) => a - b);
  return {
    milliseconds: samples[Math.floor(samples.length / 2)] ?? 0,
    firstPassMilliseconds,
    segments,
  };
}

const results = diffSyntaxKinds.map((kind) => {
  const fixture = diffSyntaxFixtures[kind];
  // A diff highlights individual lines, so each call gets one line with fresh source.
  const lines = Array.from(
    { length: 2000 },
    (_, index) => `${fixture.source.trimEnd()} ${index}`,
  );
  const before = measure(reference, kind, lines);
  const after = measure(highlightSyntaxSegments, kind, lines);
  return {
    kind,
    aliases: fixture.aliases,
    bytes: lines.reduce(
      (sum, line) => sum + new TextEncoder().encode(line).length,
      0,
    ),
    lines: lines.length,
    before,
    after,
    speedup: before.milliseconds / after.milliseconds,
  };
});
console.log(
  JSON.stringify(
    {
      runtime: Bun.version,
      metric:
        "median of 9 warm passes over 2000 distinct lines; firstPassMilliseconds is the first observed full pass in this process (includes JIT and lazy keyword initialization, not isolated process startup); no result cache; reference tokenizer and keyword allocator frozen before changes",
      results,
    },
    null,
    2,
  ),
);
