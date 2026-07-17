/**
 * Freesound APIv2 client. Requests go through the app's Cloudflare Worker
 * proxy (see proxy/), which injects the API token server-side — the
 * browser never holds or sends a key. Everything below the UI talks to an
 * injected fetch-shaped transport, so it stays testable offline.
 */

const DEFAULT_API_BASE = "https://freesound-flip-proxy.flipping.workers.dev/apiv2";

/** Proxy base for the Freesound JSON API. Override at build with VITE_API_BASE. */
export const API_BASE: string = import.meta.env.VITE_API_BASE ?? DEFAULT_API_BASE;

/** Minimal fetch-shaped transport; `fetch` satisfies it in the browser. */
export type Transport = (url: string) => Promise<TransportResponse>;
export interface TransportResponse {
  status: number;
  json(): Promise<unknown>;
}

export type FreesoundError =
  | { kind: "invalid-key" }
  | { kind: "rate-limited"; detail: string }
  | { kind: "zero-results" }
  | { kind: "partial-fetch"; message: string }
  | { kind: "unexpected"; message: string };

export type CountResult =
  | { ok: true; count: number }
  | { ok: false; error: FreesoundError };

/**
 * URL for "how many sounds match": one result, minimal fields - we only
 * read the response's `count`.
 */
export function buildCountUrl(query: string, filter: string): string {
  const q = new URLSearchParams();
  q.set("page_size", "1");
  q.set("fields", "id");
  if (query) q.set("query", query);
  if (filter) q.set("filter", filter);
  return `${API_BASE}/search/?${q.toString()}`;
}

async function readDetail(res: TransportResponse): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: unknown };
    return typeof body?.detail === "string" ? body.detail : "";
  } catch {
    return "";
  }
}

/**
 * One GET through the transport with the status cascade every Freesound
 * endpoint shares (throw → unexpected, 401 → invalid-key, 429 →
 * rate-limited with detail, other → unexpected). Callers validate the
 * body shape.
 */
export async function requestJson(
  transport: Transport,
  url: string,
): Promise<{ ok: true; body: unknown } | { ok: false; error: FreesoundError }> {
  let res: TransportResponse;
  try {
    res = await transport(url);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { kind: "unexpected", message } };
  }

  if (res.status === 401) return { ok: false, error: { kind: "invalid-key" } };
  if (res.status === 429) {
    return {
      ok: false,
      error: { kind: "rate-limited", detail: await readDetail(res) },
    };
  }
  if (res.status !== 200) {
    // 400s carry a useful `detail` (e.g. which filter field Solr rejected).
    const detail = await readDetail(res);
    return {
      ok: false,
      error: {
        kind: "unexpected",
        message: detail ? `HTTP ${res.status}: ${detail}` : `HTTP ${res.status}`,
      },
    };
  }

  try {
    return { ok: true, body: await res.json() };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { kind: "unexpected", message } };
  }
}

export async function fetchCount(
  transport: Transport,
  query: string,
  filter: string,
): Promise<CountResult> {
  const r = await requestJson(transport, buildCountUrl(query, filter));
  if (!r.ok) return r;
  const count = (r.body as { count?: unknown })?.count;
  if (typeof count !== "number") {
    return {
      ok: false,
      error: { kind: "unexpected", message: "response has no count" },
    };
  }
  return { ok: true, count };
}

/**
 * Session-lived cache: one live request per (query, canonical filter)
 * pair. Errors are not cached, so a retry after fixing the key or waiting
 * out a 429 goes back to the network.
 */
export function makeCachedCountFetcher(
  transport: Transport,
): (query: string, filter: string) => Promise<CountResult> {
  const cache = new Map<string, number>();

  return async (query, filter) => {
    const key = `${query}\n${filter}`;
    const hit = cache.get(key);
    if (hit !== undefined) return { ok: true, count: hit };

    const result = await fetchCount(transport, query, filter);
    if (result.ok) cache.set(key, result.count);
    return result;
  };
}
