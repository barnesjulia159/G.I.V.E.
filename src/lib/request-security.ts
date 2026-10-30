const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

export function isTrustedRequest(request: Request, siteUrl?: string) {
  const url = new URL(request.url);
  const isApi = url.pathname === "/api" || url.pathname.startsWith("/api/");
  if (SAFE_METHODS.has(request.method) && !isApi) return true;

  // Next.js can construct the internal URL with a different development port.
  // Use the browser-facing Host, not spoofable forwarded-host headers.
  const expectedOrigin = new URL(siteUrl || `${url.protocol}//${request.headers.get("host") || url.host}`).origin;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite === "cross-site" || fetchSite === "same-site") return false;

  if (origin !== null) {
    // Exact equality rejects opaque origins, sibling subdomains and URL tricks.
    return origin === expectedOrigin;
  }
  if (SAFE_METHODS.has(request.method)) return true;

  const referer = request.headers.get("referer");
  if (!referer) return false;
  try {
    return new URL(referer).origin === expectedOrigin;
  } catch {
    return false;
  }
}
