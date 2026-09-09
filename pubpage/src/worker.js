const canonicalHost = "chilla-viewer.com";
const wwwHost = `www.${canonicalHost}`;
const allowedHosts = new Set([canonicalHost, wwwHost]);
const canonicalPaths = new Map([
  ["/index.html", "/"],
  ["/ja", "/ja/"],
  ["/ja/index.html", "/ja/"],
  ["/privacy", "/privacy/"],
  ["/privacy/index.html", "/privacy/"],
  ["/ja/privacy", "/ja/privacy/"],
  ["/ja/privacy/index.html", "/ja/privacy/"],
]);

const commonHeaders = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'none'; object-src 'none'; frame-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; upgrade-insecure-requests",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Chilla-Deployment": "workers-static-assets",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
};

function withHeaders(response, url, cacheControl) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(commonHeaders)) headers.set(name, value);
  if (url.protocol === "https:") headers.set("Strict-Transport-Security", "max-age=31536000");
  if (cacheControl) headers.set("Cache-Control", cacheControl);
  if (response.status >= 400) headers.set("X-Robots-Tag", "noindex");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function redirect(url) {
  const response = new Response(null, {
    status: 301,
    headers: { Location: url.href, Link: `<${url.href}>; rel="canonical"` },
  });
  return withHeaders(response, url, "public, max-age=300");
}

function errorResponse(status, message, url, extraHeaders = {}) {
  return withHeaders(
    new Response(message, {
      status,
      headers: { "Content-Type": "text/plain; charset=utf-8", ...extraHeaders },
    }),
    url,
    "no-store",
  );
}

function cachePolicy(pathname) {
  if (pathname.startsWith("/assets/")) return "public, max-age=31536000, immutable";
  // Preserve the published HTML; Cloudflare must not inject an analytics beacon.
  return "public, max-age=0, must-revalidate, no-transform";
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();

    if (!allowedHosts.has(host)) return errorResponse(404, "Not found", url);
    if (request.method !== "GET" && request.method !== "HEAD") {
      return errorResponse(405, "Method not allowed", url, { Allow: "GET, HEAD" });
    }

    if (host === wwwHost || url.protocol !== "https:") {
      url.protocol = "https:";
      url.hostname = canonicalHost;
      url.port = "";
      return redirect(url);
    }

    const canonicalPath = canonicalPaths.get(url.pathname);
    if (canonicalPath) {
      url.pathname = canonicalPath;
      return redirect(url);
    }

    try {
      const assetResponse = await env.ASSETS.fetch(request);
      const response = request.method === "HEAD"
        ? new Response(null, { status: assetResponse.status, statusText: assetResponse.statusText, headers: assetResponse.headers })
        : assetResponse;
      return withHeaders(response, url, cachePolicy(url.pathname));
    } catch {
      return errorResponse(503, "Service unavailable", url);
    }
  },
};
