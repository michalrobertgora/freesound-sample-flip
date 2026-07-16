/**
 * Freesound APIv2 client, count endpoint only for now (set resolution
 * arrives with the seeded draw). Talks through an injected fetch-shaped
 * transport so everything below the UI is testable offline.
 *
 * CORS is confirmed open ("Access-Control-Allow-Origin: *") for token GET
 * auth - requests go straight to freesound.org, no proxy.
 */

export const API_BASE = "https://freesound.org/apiv2";
export const APPLY_URL = "https://freesound.org/apiv2/apply/";

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
export function buildCountUrl(token: string, query: string, filter: string): string {
  const q = new URLSearchParams();
  q.set("page_size", "1");
  q.set("fields", "id");
  if (query) q.set("query", query);
  if (filter) q.set("filter", filter);
  q.set("token", token);
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

export async function fetchCount(
  transport: Transport,
  token: string,
  query: string,
  filter: string,
): Promise<CountResult> {
  let res: TransportResponse;
  try {
    res = await transport(buildCountUrl(token, query, filter));
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
    return {
      ok: false,
      error: { kind: "unexpected", message: `HTTP ${res.status}` },
    };
  }

  try {
    const body = (await res.json()) as { count?: unknown };
    if (typeof body?.count !== "number") {
      return {
        ok: false,
        error: { kind: "unexpected", message: "response has no count" },
      };
    }
    return { ok: true, count: body.count };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { kind: "unexpected", message } };
  }
}

/**
 * Session-lived cache: one live request per (query, canonical filter)
 * pair. Errors are not cached, so a retry after fixing the key or waiting
 * out a 429 goes back to the network.
 */
export function makeCachedCountFetcher(
  transport: Transport,
): (token: string, query: string, filter: string) => Promise<CountResult> {
  const cache = new Map<string, number>();

  return async (token, query, filter) => {
    const key = `${query}\n${filter}`;
    const hit = cache.get(key);
    if (hit !== undefined) return { ok: true, count: hit };

    const result = await fetchCount(transport, token, query, filter);
    if (result.ok) cache.set(key, result.count);
    return result;
  };
}
