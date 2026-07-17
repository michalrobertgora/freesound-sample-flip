# Freesound Flip — API proxy (Cloudflare Worker)

Fronts the token-authenticated Freesound JSON API so the browser sends no key.
The token is stored as a Cloudflare secret; the Worker appends it and forwards
only `/apiv2/search/` and `/apiv2/sounds/<id>/analysis/`.

Preview MP3s and waveform PNGs are not proxied; they are served token-free from
the Freesound CDN and loaded directly by the app.

## One-time setup

From this `proxy/` directory:

```sh
npm i -g wrangler          # if not already installed
wrangler login             # authorize the Cloudflare account (opens a browser)
wrangler secret put FREESOUND_KEY
# Paste the key from ../.env.local (FREESOUND_API_KEY) at the prompt.
# It is stored in Cloudflare's secret store, not in git or the app bundle.
wrangler deploy
```

`wrangler deploy` prints the Worker URL, e.g.
`https://freesound-flip-proxy.<subdomain>.workers.dev`. This URL is the app's
API base (`API_BASE` in `src/lib/freesound.ts`); it is not a secret.

Note: after the first deploy, a `wrangler secret put` does not always publish a
new active version on its own. If requests return `FREESOUND_KEY unset`, run
`wrangler deploy` again to bind the stored secret.

## Verify

```sh
BASE=https://freesound-flip-proxy.<subdomain>.workers.dev

# Search returns JSON with a "count" field (no token in the request):
curl "$BASE/apiv2/search/?query=rain&fields=id&page_size=1"

# A disallowed browser origin is refused (403):
curl -H "Origin: https://example.invalid" "$BASE/apiv2/search/?query=rain"

# A non-allowlisted path is refused (404):
curl "$BASE/apiv2/sounds/1/"
```

## Local dev

Put the key in `proxy/.dev.vars` (git-ignored) as `FREESOUND_KEY=...`, then run
`wrangler dev`. Add `http://localhost:8787` to `ALLOWED_ORIGINS` in `worker.js`
to point a local app build at the local Worker.

## Notes

- The shared key is one quota for all users: 60 requests/minute, 2000/day. A
  burst past the limit returns `429`, surfaced as an error in the app.
- The origin allowlist and per-IP rate limit bound casual misuse; neither is a
  hard guarantee. The key is revocable from the Freesound account.
- Redeploy after any `worker.js` change with `wrangler deploy`.
