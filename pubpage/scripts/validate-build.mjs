import { access, readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import worker from "../src/worker.js";

const root = new URL("../", import.meta.url);
const dist = new URL("dist/", root);
const requiredFiles = [
  "index.html",
  "ja/index.html",
  "privacy/index.html",
  "ja/privacy/index.html",
  "_headers",
  "robots.txt",
  "sitemap.xml",
  "og.png",
  "favicon.png",
  "apple-touch-icon.png",
  "cat.webp",
  "screenshots/browse-fresh.jpg",
  "screenshots/browse-fresh.webp",
  "screenshots/diff-fresh.jpg",
  "screenshots/diff-fresh.webp",
  "screenshots/readme.png",
  "screenshots/readme.webp",
  "screenshots/readme-720.webp",
  "screenshots/git-diff.png",
  "screenshots/git-diff.webp",
  "screenshots/git-diff-1200.webp",
  "screenshots/movie.png",
  "screenshots/movie.webp",
];

const failures = [];

const wwwRedirect = await worker.fetch(new Request("https://www.chilla-viewer.com/ja/?from=www"), {
  ASSETS: { fetch() { throw new Error("www must redirect before static asset fetch"); } },
});
if (wwwRedirect.status !== 301) failures.push("www redirect must be permanent");
if (wwwRedirect.headers.get("location") !== "https://chilla-viewer.com/ja/?from=www") {
  failures.push("www redirect must preserve path and query on the canonical host");
}
if (wwwRedirect.headers.get("link") !== '<https://chilla-viewer.com/ja/?from=www>; rel="canonical"') {
  failures.push("www redirect must include its canonical Link header");
}
if (wwwRedirect.headers.get("x-frame-options") !== "DENY") failures.push("www redirect is missing common security headers");

const rejectingAssets = { fetch() { throw new Error("request must not reach static assets"); } };
const httpRedirect = await worker.fetch(new Request("http://chilla-viewer.com/privacy/?a=1&a=2"), { ASSETS: rejectingAssets });
if (httpRedirect.status !== 301 || httpRedirect.headers.get("location") !== "https://chilla-viewer.com/privacy/?a=1&a=2") {
  failures.push("HTTP canonical host must redirect to HTTPS without changing path or query");
}
const aliasRedirect = await worker.fetch(new Request("https://chilla-viewer.com/ja/privacy/index.html?x=%2Ffoo"), { ASSETS: rejectingAssets });
if (aliasRedirect.status !== 301 || aliasRedirect.headers.get("location") !== "https://chilla-viewer.com/ja/privacy/?x=%2Ffoo") {
  failures.push("known HTML aliases must redirect to their canonical paths");
}
const unknownHost = await worker.fetch(new Request("https://attacker.example/"), { ASSETS: rejectingAssets });
if (unknownHost.status !== 404 || unknownHost.headers.get("x-robots-tag") !== "noindex") {
  failures.push("unknown hosts must return a noindex 404");
}
const disallowedMethod = await worker.fetch(new Request("https://chilla-viewer.com/", { method: "POST" }), { ASSETS: rejectingAssets });
if (disallowedMethod.status !== 405 || disallowedMethod.headers.get("allow") !== "GET, HEAD") {
  failures.push("non-GET/HEAD methods must return 405 with an Allow header");
}
const headResponse = await worker.fetch(new Request("https://chilla-viewer.com/og.png", { method: "HEAD" }), {
  ASSETS: { fetch() { return new Response(null, { status: 200, headers: { ETag: '"asset-tag"' } }); } },
});
const htmlResponse = await worker.fetch(new Request("https://chilla-viewer.com/ja/"), {
  ASSETS: { fetch() { return new Response("<!doctype html>", { headers: { "Content-Type": "text/html" } }); } },
});
if (!htmlResponse.headers.get("cache-control")?.includes("no-transform")) {
  failures.push("HTML must prevent automatic third-party script injection");
}
if (headResponse.status !== 200 || headResponse.body !== null || headResponse.headers.get("etag") !== '"asset-tag"') {
  failures.push("HEAD asset responses must preserve status and validators without a body");
}

for (const relativePath of requiredFiles) {
  try {
    await access(new URL(relativePath, dist));
  } catch {
    failures.push(`missing ${relativePath}`);
  }
}

const english = await readFile(new URL("index.html", dist), "utf8");
const japanese = await readFile(new URL("ja/index.html", dist), "utf8");
const privacy = await readFile(new URL("privacy/index.html", dist), "utf8");
const japanesePrivacy = await readFile(new URL("ja/privacy/index.html", dist), "utf8");
const headers = await readFile(new URL("_headers", dist), "utf8");
const assets = await readdir(new URL("assets/", dist));

const productRequirements = [
  [english, "English", ["Fast file browsing.", "Download for Mac", "Yazi-like", "Fast and responsive", "Built-in Git diffs", "brew install --cask chilla", "/screenshots/browse-fresh.jpg", "/screenshots/diff-fresh.jpg", 'href="/privacy/"']],
  [japanese, "Japanese", ["ターミナルのように、", "Mac版をダウンロード", "Yaziライク", "キーボード中心", "Git diffを標準搭載", "brew install --cask chilla", "/screenshots/browse-fresh.jpg", "/screenshots/diff-fresh.jpg", 'href="/ja/privacy/"']],
];
for (const [source, label, required] of productRequirements) {
  for (const content of required) {
    if (!source.includes(content)) failures.push(`${label} product page is missing ${content}`);
  }
}

for (const [source, label] of [[english, "English"], [japanese, "Japanese"]]) {
  const installIndex = source.indexOf('id="install"');
  if (installIndex < 0 || installIndex > source.indexOf('id="proof"') ||
      installIndex > source.indexOf('id="features"')) {
    failures.push(`${label} installation must appear before screenshots and detailed features`);
  }
  for (const required of ['class="install-steps"', 'class="brew-steps"',
    '_aarch64.dmg', 'chilla.app', 'Applications', 'open -a chilla',
    'brew upgrade --cask chilla', 'href="https://brew.sh/"']) {
    if (!source.includes(required)) failures.push(`${label} installation guide is missing ${required}`);
  }
  const heroActions = source.match(/<div class="hero-actions">([\s\S]*?)<\/div>/)?.[1];
  if (!heroActions?.includes('href="https://github.com/tacogips/chilla"')) {
    failures.push(`${label} hero must link directly to the GitHub repository`);
  }
}

const localizedPages = [
  ["English product", english, '<html lang="en">', "https://chilla-viewer.com/", 'href="/ja/"'],
  ["Japanese product", japanese, '<html lang="ja">', "https://chilla-viewer.com/ja/", 'href="/"'],
  ["English privacy", privacy, '<html lang="en">', "https://chilla-viewer.com/privacy/", 'href="/ja/privacy/"'],
  ["Japanese privacy", japanesePrivacy, '<html lang="ja">', "https://chilla-viewer.com/ja/privacy/", 'href="/privacy/"'],
];
for (const [label, source, language, canonical, alternate] of localizedPages) {
  if (!source.includes(language)) failures.push(`${label} has the wrong document language`);
  if (!source.includes(`rel="canonical" href="${canonical}"`)) failures.push(`${label} is missing its canonical URL`);
  if (!source.includes('rel="alternate" hreflang="en"')) failures.push(`${label} is missing the English alternate`);
  if (!source.includes('rel="alternate" hreflang="ja"')) failures.push(`${label} is missing the Japanese alternate`);
  if (!source.includes(alternate)) failures.push(`${label} is missing its language switch`);
  if (!source.includes('href="/favicon.png"') || !source.includes('href="/apple-touch-icon.png"')) {
    failures.push(`${label} is missing icon metadata`);
  }
}

for (const content of ["local-first desktop viewer", "does not use third-party analytics", "Cloudflare Privacy Policy", "GitHub General Privacy Statement"]) {
  if (!privacy.includes(content)) failures.push(`English privacy page is missing ${content}`);
}
for (const content of ["ローカル優先", "第三者解析", "Cloudflareプライバシーポリシー", "GitHub一般プライバシー声明"]) {
  if (!japanesePrivacy.includes(content)) failures.push(`Japanese privacy page is missing ${content}`);
}

for (const content of ["Content-Security-Policy:", "X-Chilla-Deployment: workers-static-assets", "Strict-Transport-Security:", "frame-ancestors 'none'", "X-Frame-Options: DENY", "connect-src 'none'", "base-uri 'none'"]) {
  if (!headers.includes(content)) failures.push(`security headers are missing ${content}`);
}
if (!assets.some((name) => /icon-[\w-]+\.png$/.test(name))) failures.push("bundled Chilla app icon is missing");

const ogStats = await stat(new URL("og.png", dist));
if (ogStats.size < 1_000) failures.push("Open Graph image is unexpectedly small");
if (ogStats.size > 400_000) failures.push("Open Graph image exceeds the 400 KiB budget");
for (const relativePath of ["cat.webp", "screenshots/browse-fresh.webp", "screenshots/diff-fresh.webp"]) {
  const stats = await stat(new URL(relativePath, dist));
  if (stats.size > 500_000) failures.push(`${relativePath} exceeds the 500 KiB screenshot budget`);
}

const generatedPages = [english, japanese, privacy, japanesePrivacy];
const unresolvedMarkerPattern = new RegExp(`(?:${"TO" + "DO"}|${"T" + "BD"}|${"PLACE" + "HOLDER"})`, "i");
if (generatedPages.some((source) => unresolvedMarkerPattern.test(source))) {
  failures.push("generated HTML contains an unresolved marker");
}
if (generatedPages.some((source) => /<script[^>]+src=["']https?:/i.test(source))) {
  failures.push("generated HTML contains a third-party script");
}

if (failures.length > 0) {
  console.error("Product page validation failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`Product page validation passed (${join("dist", "index.html")}; ${assets.length} bundled assets).`);
