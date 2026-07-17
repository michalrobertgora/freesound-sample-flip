# Research: Original-quality (wav/aiff/flac) downloads from the Freesound API

Date: 2026-07-17. Sources: Freesound APIv2 docs ([authentication.html](https://freesound.org/docs/api/authentication.html), [resources_apiv2.html](https://freesound.org/docs/api/resources_apiv2.html), [overview.html](https://freesound.org/docs/api/overview.html), [terms_of_use.html](https://freesound.org/docs/api/terms_of_use.html)) and the [MTG/freesound](https://github.com/MTG/freesound) source (`freesound/settings.py`, `apiv2/views.py`, `apiv2/urls.py`). One live unauthenticated header check against the download endpoint (expected-401, no credentials sent).

## Verdicts

### 1. Endpoint — `GET /apiv2/sounds/<sound_id>/download/`; OAuth2 REQUIRED, token auth is NOT enough (CONFIRMED)

From [resources_apiv2.html](https://freesound.org/docs/api/resources_apiv2.html), Sound Download resource:

> "This resource allows you to download a sound in its original format/quality (the format/quality with which the sound was uploaded). It requires OAuth2 authentication."

From [authentication.html](https://freesound.org/docs/api/authentication.html):

> "Most of the resources are accessible using both authentication strategies but some of them are restricted to the use of OAuth2." — restricted resources are "marked as 'OAuth2 required'", and "OAuth2 resources require the requests to be made over https."

Our current pasted-API-key token auth cannot reach this endpoint. Confirmed live: an unauthenticated `GET /apiv2/sounds/1234/download/` returns `401 Unauthorized` with `Www-Authenticate: Bearer realm="api"`.

Source corroboration ([`apiv2/urls.py`](https://github.com/MTG/freesound/blob/master/apiv2/urls.py)): `path("sounds/<int:pk>/download/", views.DownloadSound.as_view(), ...)`. There is also an **undocumented-in-the-resource-list** companion, `sounds/<int:pk>/download/link/` (`views.DownloadLink`), which — behind the same OAuth2 wall — returns `{"download_link": ...}`, a JWT-signed URL at `download/<token>/` valid for `API_DOWNLOAD_TOKEN_LIFETIME = 60 * 60` (1 hour, [`freesound/settings.py`](https://github.com/MTG/freesound/blob/master/freesound/settings.py)) that is then fetchable **without auth headers** — useful as a plain `<a href>` once OAuth2 is in place.

### 2. OAuth2 flow — authorization code grant ONLY; client secret REQUIRED at token exchange; no PKCE/implicit (CONFIRMED)

From [authentication.html](https://freesound.org/docs/api/authentication.html):

> "Our OAuth2 implementation follows the 'authorization code grant' flow described in the RFC6749."

No implicit grant, no PKCE, no device flow is documented. The token exchange (Step 3) requires the secret — docs example verbatim:

```
curl -X POST -d "client_id=YOUR_CLIENT_ID&client_secret=YOUR_CLIENT_SECRET&grant_type=authorization_code&code=THE_GIVEN_CODE" https://freesound.org/apiv2/oauth2/access_token/
```

There is **no documented client-side-only path**: a secretless public-client exchange is not described anywhere. Redirect constraint: the developer registers a redirect URL when requesting the credential; Freesound redirects the user there with `?code=...` as a GET parameter. Token lifetime:

> "Access tokens do have a limited lifetime of 24 hours."

(matches `"ACCESS_TOKEN_EXPIRE_SECONDS": 60 * 60 * 24` in `freesound/settings.py`). A refresh token is issued alongside; refresh uses `grant_type=refresh_token` and — same endpoint — again requires `client_secret`. Expired tokens 401 with an "Expired token" error.

### 3. CORS — OPEN; browser calls to /apiv2/ (incl. download) are CORS-readable (CONFIRMED with one caveat)

Source ([`freesound/settings.py`](https://github.com/MTG/freesound/blob/master/freesound/settings.py)): `"corsheaders.middleware.CorsMiddleware"` in `MIDDLEWARE` and `CORS_ALLOW_ALL_ORIGINS = True` — site-wide, so it covers `/apiv2/oauth2/access_token/`, `/download/`, and `download/<token>/`.

Observed live (unauthenticated, `Origin: https://example.github.io`, expected 401):

```
HTTP/1.1 401 Unauthorized
Access-Control-Allow-Origin: *
Vary: Accept, Cookie, origin
```

Caveat: the actual file response is served via django-sendfile → nginx `X-Accel-Redirect` (`DownloadSound` returns `sendfile(sound_path, ...)`; `SENDFILE_SECRET_URL = "/secret/"`). Upstream-set headers normally survive nginx internal redirects, so `Access-Control-Allow-Origin` should persist on the file body, but this was not verified on a real 200 (would need credentials). The no-auth-header `download/<token>/` link sidesteps the question entirely for the `<a href>` case since no CORS preflight is needed for a plain navigation/anchor download.

### 4. Fallbacks

- **(a) Link out to the sound page — WORKS TODAY.** Sound Instance `url` field (already in our fields list, `src/lib/resolveSet.ts`) is the freesound.org page; a logged-in user clicks Download there. Zero API changes.
- **(b) Lossless preview transcodes — DO NOT EXIST.** The `previews` dictionary has exactly four lossy variants: `preview-hq-mp3` (~128kbps mp3), `preview-lq-mp3` (~64kbps mp3), `preview-hq-ogg` (~192kbps ogg), `preview-lq-ogg` (~80kbps ogg). No FLAC/wav transcode is served by the API. The original's format/size are only metadata: `type` — "The original type of the sound (wav, aif, aiff, ogg, mp3, m4a, or flac)" — and `filesize` (bytes), both filterable; useful for showing "Original: wav, 12.4 MB" next to a link.
- **(c) Download fields.** `download` (URI, non-filterable) — "The URI for retrieving the original sound" (it's the OAuth2-gated endpoint from #1); `num_downloads` (int, filterable) — download count. No per-sound "downloadable" permission flag exists; all public sounds are downloadable by any logged-in user under the sound's CC license.
- **(d) Terms on proxying.** [terms_of_use.html](https://freesound.org/docs/api/terms_of_use.html) doesn't forbid apps triggering downloads; relevant constraints: API is free "only for non-commercial purposes"; credit "Freesound and Freesound users in accordance to sounds' licenses"; don't abuse bandwidth; "Do not register multiple API keys to circumvent request limitations"; don't replicate Freesound wholesale. A user-initiated per-sound download with attribution is squarely normal API usage.

### 5. Verdict for this app

**OAuth2-in-SPA is technically feasible only in the "user pastes their own client_id + client_secret" shape — and that shape fits this app's existing model.** There is no PKCE/public-client flow, so a single shipped credential is impossible (the secret would be public; the token endpoint is CORS-open, so the exchange itself works from the browser — the only blocker is secret confidentiality, which vanishes when the secret belongs to the user pasting it). Each player already creates their own API credential at https://freesound.org/apiv2/apply (any registered user; per docs overview: "you'll need an API credential that you can request in https://freesound.org/apiv2/apply"); they would (1) mark it OAuth2-capable, (2) set its redirect URL to the GitHub Pages app URL, (3) paste id+secret instead of just the token. Nothing in the docs or ToS forbids a credential owner using their own secret from their own browser; the ToS multiple-keys clause targets rate-limit evasion, not one-key-per-user. Costs: a redirect round-trip UX, `?code=` capture on the callback, 24 h token + refresh handling in localStorage, and per-user credential-setup friction (each user must correctly register the redirect URL).

**Link-out is strictly cheaper and delivers the same file.** The user is presumably logged in to freesound.org already; `sound.url` + a "Download original (wav, 12.4 MB)" label from `type`/`filesize` costs one UI element.

## Recommended approach ladder

1. **Ship now (no auth change):** render a "Get original" link to `sound.url` (open in new tab), labeled with `type` + human-readable `filesize`. Add `download,num_downloads,filesize` to the fields list if surfacing them.
2. **Optional power-user tier:** accept an optional client_id + client_secret pair in settings; run the RFC6749 auth-code redirect against `https://freesound.org/apiv2/oauth2/authorize/`, exchange at `/apiv2/oauth2/access_token/` from the browser (CORS is open), store access+refresh tokens in localStorage, refresh on 401 "Expired token".
3. **For actual downloading under tier 2:** prefer `GET /apiv2/sounds/<id>/download/link/` (Bearer token) → put the returned 1-hour `download_link` in a plain `<a download href>` — avoids any CORS/blob handling on multi-MB wavs. Fall back to fetching `/download/` as a blob only if the link endpoint misbehaves.
4. **Do not** attempt a shared shipped credential, implicit flow, or PKCE — none are supported, and shipping a secret is disqualifying.
