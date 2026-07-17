# Keyless onboarding without a backend

Date: 2026-07-17. Question: can users be spared from pasting their own Freesound
API key into the shared static SPA, without a backend, without leaking a secret,
and without breaking Freesound's terms?

Sources: Freesound API terms of use ([tos_api](https://freesound.org/help/tos_api/),
[terms_of_use.html](https://freesound.org/docs/api/terms_of_use.html)),
[overview.html](https://freesound.org/docs/api/overview.html),
[authentication.html](https://freesound.org/docs/api/authentication.html); OWASP
[Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html);
MDN [Third-party APIs](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Client-side_APIs/Third_party_APIs);
Cloudflare [Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/); and the
sibling note [original-quality-downloads.md](./original-quality-downloads.md).

## Summary

A key that lives in the browser is not a secret: the static bundle is readable by
anyone, so embedding it (even obfuscated) is not safe, and it violates Freesound's
terms ("must be kept secret and confidential and under no circumstances be exposed
to the public"). There is no keyless OAuth path for a static Freesound app. Without
a backend, two options keep the key confidential: (a) per-user keys with reduced
friction (the current model plus an optional prefill link the owner shares
privately); (b) a serverless proxy holding the key, which is arguably the backend
the owner wanted to avoid. For a two-person tool, option (a) is recommended.
Embedding the owner's token is defensible only as a knowingly-revocable,
rate-limited convenience for a private tool, never for a public app.

## 1. Can a secret be safe in a public SPA? — No

Client-side code is delivered to the user and is fully inspectable; nothing in the
bundle is secret. OWASP's Secrets Management Cheat Sheet treats hardcoded secrets
as an anti-pattern
([source](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)):

> "Many organizations have them hardcoded within the source code in plaintext,
> littered throughout configuration files and configuration management tools."

MDN, on third-party developer keys
([source](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Client-side_APIs/Third_party_APIs)):

> "Third party APIs have a slightly different permissions system — they tend to use
> developer keys to allow developers access to the API functionality, which is more
> to protect the API vendor than the user."

> "Requiring a key enables the API provider to hold users of the API accountable
> for their actions. … The easiest action would be to just revoke their API
> privileges."

Obfuscation, base64, or splitting the key across files does not help: these are
encodings, not encryption, and the running app must reassemble the plaintext to
send it, so it is recoverable from the bundle or the Network tab (`token=` on every
request). Any key in the bundle is public once it ships.

Abuse surface of an exposed key (numbers in §3): rate-limit exhaustion (a stranger
can burn the shared 60/min · 2000/day budget, returning 429 to all users); key
revocation (Freesound may revoke it, per §2, taking the app down); and all usage
attributed to the owner's single credential. The API is free for non-commercial
use, so this is an availability and terms-compliance liability, not a financial one.

## 2. Freesound's terms — embedding the key is forbidden

From the API terms of use ([tos_api](https://freesound.org/help/tos_api/)):

> "Freesound API User IDs used to authenticate access to the Freesound API must be
> kept secret and confidential and under no circumstances be exposed to the public."

Shipping the key in a public bundle exposes it to the public, so it is
non-compliant. Also:

> "The Access Keys are our property and may be revoked if you share them with any
> third party … if they are compromised, if you violate any term of this Agreement,
> or if we terminate this Agreement."

> "You will be provided with one Access Key per Application."

From the general terms
([terms_of_use.html](https://freesound.org/docs/api/terms_of_use.html)):

> "Do not register multiple API keys to circumvent request limitations."

> "Be fair with your usage of the Freesound API." / "Do not abuse server bandwidth."

API access is free only for non-commercial use, and attribution to Freesound and
its users per the sounds' licenses is required.

The terms do not state a per-user-key requirement in those words, nor explicitly
address one key serving many users. The secrecy clause makes the embedded-in-SPA
form non-compliant regardless. The compliant model is the one the app uses: each
user brings their own credential.

## 3. Token-auth rate limits

Documented throttles ([overview.html](https://freesound.org/docs/api/overview.html)):

> Standard resources: "60 requests per minute and 2000 requests per day"
>
> Write operations: "30 requests per minute and 500 requests per day"
>
> On exceed: "the APIv2 will return a 429 Too many requests response error"

Limits are per credential, not per user, so one shared key gives all users combined
2000 requests/day. Sufficient for a two-person tool; inadequate for a public one,
where one abuser or runaway loop returns 429 to everyone. The terms note limits may
be tightened at Freesound's discretion ([tos_api](https://freesound.org/help/tos_api/)):

> "The number of Freesound API calls you will be permitted to make during any given
> period may be limited. Freesound will determine call limits based on various
> factors."

## 4. No-backend options, by safety

### 4a. Embed the owner's token in the bundle — not safe, non-compliant

Confidentiality: none (§1). Terms: violates the secrecy clause (§2); sharing or
exposure is an enumerated revocation trigger. Blast radius: the app fails entirely
if the key is throttled (§3) or revoked (§2); all usage is attributed to the owner.
Obfuscation does not fix exposure. A dedicated, disposable credential reduces the
consequences but not the exposure. Acceptable only as a deliberate convenience for
a private tool whose owner accepts that the key is public and revocable; still
off-side of the written terms even at two users.

### 4b. Keep per-user keys, reduce friction — safe (recommended)

Each user pastes their own credential, which is the compliant model. Two
friction-reducers, no backend:

- One-time paste persisted in localStorage (the prior status quo): each user
  completes https://freesound.org/apiv2/apply once and pastes. No secret sharing.
- Prefill via a link the owner shares privately. This stays safe only if it
  prefills the recipient's own key, not a shared one:
  - Prefilling an empty field with instructions or a deep link to the apply page is
    pure UX, with no secret in the URL.
  - Prefilling an actual key value in a query param or `#hash` fragment puts the key
    into browser history, the `Referer` header on outbound navigation, server and
    proxy logs, and link previews. A `#hash` fragment is better than a query param
    (fragments are not sent to servers or in `Referer`), and clearing it with
    `history.replaceState` after reading shrinks the window, but it is still weaker
    than a manual paste. Tolerable only when the value is the recipient's own key
    and the link is sent over a private channel. Never put the owner's key in a
    shared link.

### 4c. Keyless OAuth2 (implicit / device flow) — not available for Freesound

Per [original-quality-downloads.md](./original-quality-downloads.md): Freesound's
OAuth2 is authorization-code grant only; the token exchange requires
`client_secret`; there is no PKCE, implicit, or device flow. From
[authentication.html](https://freesound.org/docs/api/authentication.html):

> "Our OAuth2 implementation follows the 'authorization code grant' flow described
> in the RFC6749."

A shipped OAuth client credential would embed a secret, disqualified for the same
reason as §4a. OAuth2 in this SPA is viable only in the "user pastes their own
`client_id` + `client_secret`" form, which is more onboarding friction than the
token paste. OAuth2 is a downloads feature, not an onboarding one.

## 5. Serverless proxy (crosses the "no backend" line)

The standard way to share one key across users is a serverless function
(Cloudflare Workers, Netlify/Vercel edge functions) that holds the key server-side
and proxies requests, so the key never reaches the browser. Cloudflare's docs
([Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)):

> "Secrets are a type of binding that allow you to attach encrypted text values to
> your Worker. Secrets are used for storing sensitive information like API keys and
> auth tokens."

This is the only safe way to share one key, and it satisfies the secrecy clause.
Whether it counts as a "real backend" is a judgement call: a single stateless edge
function on a free tier has no server or database to maintain, but it is server-side
code and infrastructure, and it re-introduces the shared 2000/day cap (§3) plus the
need to keep the proxy from becoming an open relay (an allowlist or simple auth).

## 6. Recommendation for this app (two people, weekly)

Both users have Freesound accounts and can each obtain a free key in one visit to
https://freesound.org/apiv2/apply, so per-user keys cost only a one-time paste.
Ranked:

1. Keep per-user keys; optionally add a prefill or deep link that carries no shared
   secret (localStorage persistence already exists). Compliant, no shared secret,
   no backend. Recommended.
2. Embed a dedicated, disposable owner token, only if the owner accepts that it is
   public, revocable, and throttle-shared. Use a separate credential, not the
   owner's main key. Off-side of the terms even at two users; disqualified for a
   public app.
3. A single serverless proxy holding the key, with a request allowlist. The only
   safe way to share one key, but it is server-side infrastructure and re-imposes
   the shared quota.

No option is simultaneously keyless-onboarding, safe, and backendless: that is
ruled out by client code being public and by Freesound's terms.

(Chosen after this note: option 3 — see `proxy/README.md`.)

## Remaining uncertainty

- The confidentiality clause comes from the legal terms page
  (https://freesound.org/help/tos_api/); the developer-facing docs are quieter on
  it. No Freesound page explicitly permits or forbids "one key, many end-users" in
  those words; the prohibition is inferred from the secrecy clause plus the
  single-key-per-application and fair-use clauses.
- Whether a single stateless edge function is a "real backend" is a preference, not
  a fact.
- The rate-limit numbers are from the current overview docs and are described as
  adjustable at Freesound's discretion.
