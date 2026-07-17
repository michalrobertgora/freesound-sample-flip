/**
 * Freesound Flip — API proxy Worker.
 *
 * Fronts the token-authenticated Freesound JSON API so the browser never
 * sees a key. The token lives in the FREESOUND_KEY secret (set with
 * `wrangler secret put FREESOUND_KEY`); this Worker appends it server-side
 * and forwards ONLY the endpoints the app needs.
 *
 * NOT fronted (the app hits these directly, token-free): preview mp3s and
 * waveform PNGs on the Freesound CDN.
 *
 * Security model (see docs/research/keyless-onboarding.md): an unguarded
 * proxy is the key in disguise, so two light gates apply — an Origin
 * allowlist (stops other browsers) and a per-IP rate limit (caps scripted
 * abuse). Neither is bulletproof; the key stays revocable, and the true
 * ceiling is Freesound's 60/min · 2000/day on the shared credential.
 */

const FREESOUND = "https://freesound.org";

// Only these JSON endpoints may be proxied — anything else is refused, so
// this can't serve as a general open proxy. Keep in sync with the app's
// freesound.ts (search/count) and onsetsCache.ts (analysis).
const ALLOWED_PATHS = [
  /^\/apiv2\/search\/$/,
  /^\/apiv2\/sounds\/\d+\/analysis\/$/,
];

// Browser origins allowed to call the proxy. A request with NO Origin
// (curl, server-to-server) passes the origin gate — origin checks only
// stop *other browsers*; scripted clients are bounded by the rate limit.
const ALLOWED_ORIGINS = new Set([
  "https://michalrobertgora.github.io",
  "http://localhost:5173",
  "http://localhost:4173",
]);

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }
    if (request.method !== "GET") {
      return new Response("Method not allowed", { status: 405 });
    }

    // Reject a present-but-unknown browser origin (missing Origin is allowed).
    if (origin && !ALLOWED_ORIGINS.has(origin)) {
      return new Response("Forbidden origin", { status: 403, headers: corsHeaders(origin) });
    }

    if (!ALLOWED_PATHS.some((re) => re.test(url.pathname))) {
      return new Response("Not found", { status: 404, headers: corsHeaders(origin) });
    }

    // Per-IP rate limit (basic backstop). Present only if the ratelimit
    // binding is configured in wrangler.toml; skipped gracefully otherwise.
    if (env.RATE_LIMITER) {
      const ip = request.headers.get("CF-Connecting-IP") ?? "anon";
      const { success } = await env.RATE_LIMITER.limit({ key: ip });
      if (!success) {
        return new Response("Rate limited", { status: 429, headers: corsHeaders(origin) });
      }
    }

    if (!env.FREESOUND_KEY) {
      return new Response("Proxy misconfigured: FREESOUND_KEY unset", { status: 500 });
    }

    // Forward to Freesound with the token appended server-side. Rebuilding
    // via URLSearchParams also strips any client-sent token, so the key can
    // never be overridden from the browser.
    const target = new URL(FREESOUND + url.pathname);
    target.search = url.search;
    target.searchParams.set("token", env.FREESOUND_KEY);

    let upstream;
    try {
      upstream = await fetch(target.toString(), { headers: { Accept: "application/json" } });
    } catch {
      return new Response("Upstream fetch failed", { status: 502, headers: corsHeaders(origin) });
    }

    const headers = new Headers(corsHeaders(origin));
    headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "application/json");
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
