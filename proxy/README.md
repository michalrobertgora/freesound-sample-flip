# Freesound Flip — API proxy (Cloudflare Worker)

Fronts the token-authenticated Freesound JSON API so the browser never needs a
key. The Freesound token lives in a Cloudflare **secret**; this Worker appends
it and forwards only `/apiv2/search/` and `/apiv2/sounds/<id>/analysis/`.

Preview mp3s and waveform PNGs are **not** proxied — they're served token-free
from the Freesound CDN and the app hits them directly.

## One-time setup

From this `proxy/` directory:

```sh
npm i -g wrangler          # if not already installed
wrangler login             # opens a browser to authorize your Cloudflare account
wrangler secret put FREESOUND_KEY
# ↑ paste the key from ../.env.local (FREESOUND_API_KEY) at the prompt.
#   It goes straight to Cloudflare's secret store — never into git or the app.
wrangler deploy
```

`wrangler deploy` prints the live URL, e.g.
`https://freesound-flip-proxy.<your-subdomain>.workers.dev`. Hand that URL to
the app integration (ticket 22); it is not a secret.

## Verify (no token in the request)

```sh
# Search should return JSON with a "count" field:
curl "https://freesound-flip-proxy.<your-subdomain>.workers.dev/apiv2/search/?query=rain&fields=id&page_size=1"

# A disallowed browser origin is refused:
curl -H "Origin: https://evil.example" \
  "https://freesound-flip-proxy.<your-subdomain>.workers.dev/apiv2/search/?query=rain"
# → 403 Forbidden origin

# A non-allowlisted path is refused:
curl "https://freesound-flip-proxy.<your-subdomain>.workers.dev/apiv2/sounds/1/"
# → 404 Not found
```

## Local dev (optional)

Put the key in `proxy/.dev.vars` (git-ignored) as `FREESOUND_KEY=...`, then
`wrangler dev`. Add `http://localhost:8787` to `ALLOWED_ORIGINS` in `worker.js`
if you point a local app build at the local Worker.

## Notes

- The shared key means one **60/min · 2000/day** quota across everyone — fine
  for a couple of users; a heavy burst surfaces as a `429` in the app.
- The gates (origin allowlist + per-IP rate limit) make casual misuse annoying,
  not impossible; the key stays revocable from your Freesound account.
- Redeploy after any `worker.js` change with `wrangler deploy`.
