# Research: Sparing other users from pasting a Freesound API key — without a real backend

Date: 2026-07-17. Question: is there a SIMPLE but SAFE way to avoid making every user paste their own
Freesound API key into the shared static SPA, without standing up a real backend, without leaking a
secret, and without breaking Freesound's terms?

Sources: Freesound API terms of use ([tos_api](https://freesound.org/help/tos_api/),
[terms_of_use.html](https://freesound.org/docs/api/terms_of_use.html)),
[overview.html](https://freesound.org/docs/api/overview.html),
[authentication.html](https://freesound.org/docs/api/authentication.html); OWASP
[Secrets Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html);
MDN [Third-party APIs](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Client-side_APIs/Third_party_APIs);
Cloudflare [Workers Secrets docs](https://developers.cloudflare.com/workers/configuration/secrets/); and the
sibling note [original-quality-downloads.md](./original-quality-downloads.md) (Freesound OAuth2 is
authorization-code-only, `client_secret` mandatory, no PKCE/implicit/device).

## TL;DR verdict

A shared key that lives **in the browser** can never be a *secret* — the static bundle is fully readable
by anyone, so "embed the key, even obfuscated" is **simple but NOT safe**, and it also **directly violates
Freesound's terms** ("must be kept secret and confidential and under no circumstances be exposed to the
public"). There is **no keyless OAuth path** for a static Freesound app (confirmed in the sibling note).
The only options that keep the key confidential without a backend are: **(a)** per-user keys with the
friction cut down (status quo + a prefill link the owner shares privately), which is simple AND safe, or
**(b)** a tiny serverless proxy holding the key, which is safe but is arguably the "backend" the owner
wanted to avoid. For a 2-person weekly tool, recommendation **(i)**: keep per-user keys, add a private
prefill link. Embedding the owner's token is only defensible as a *knowingly-revocable, throttle-capped*
convenience for a genuinely private 2-person tool — never for a public app.

---

## 1. The hard constraint: can a secret ever be safe in a public SPA? — VERDICT: No.

Client-side code is delivered to the user's machine and is fully inspectable; nothing shipped in the bundle
is secret. OWASP's Secrets Management Cheat Sheet frames hardcoded-in-source secrets as exactly the
anti-pattern the whole discipline exists to fix
([Secrets_Management_Cheat_Sheet.html](https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html)):

> "Many organizations have them hardcoded within the source code in plaintext, littered throughout
> configuration files and configuration management tools."

MDN, describing third-party API developer keys, is explicit that the key is the *provider's* leverage over
the developer, and that the provider's remedy for abuse is revocation
([Third-party APIs](https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Client-side_APIs/Third_party_APIs)):

> "Third party APIs have a slightly different permissions system — they tend to use developer keys to allow
> developers access to the API functionality, which is more to protect the API vendor than the user."

> "Requiring a key enables the API provider to hold users of the API accountable for their actions. … action
> can be taken if they start to do anything malicious with the API … The easiest action would be to just
> revoke their API privileges."

**Obfuscation / base64 / splitting the key across files does not help.** These are encodings, not
encryption — the running app must reassemble the plaintext key to send it, so it is trivially recoverable
from DevTools (Network tab shows the `token=` on every request) or by reading the bundle. Treat any key in
the bundle as public the moment it ships.

**Abuse surface of an exposed Freesound key** (see §3 for the numbers): (1) **rate-limit exhaustion** — a
stranger can burn the shared key's 60/min · 2000/day budget and every real user gets `429`; (2) **key
revocation** — Freesound may revoke it (their explicit right, §2), taking down the whole app at once; (3)
**quota/attribution theft** — all usage is billed to the owner's single credential, and misuse is
attributable to the owner. It is not a financial secret (the API is free for non-commercial use), but it is
a *availability* and *terms-compliance* liability.

## 2. What Freesound's OWN terms say — VERDICT: Embedding the key is explicitly forbidden.

The API terms of use ([tos_api](https://freesound.org/help/tos_api/)) are not silent here. Verbatim:

> "Freesound API User IDs used to authenticate access to the Freesound API must be kept secret and
> confidential and under no circumstances be exposed to the public."

That single clause is dispositive: shipping the key in a public static bundle *is* exposing it to the
public. Also verbatim:

> "The Access Keys are our property and may be revoked if you share them with any third party (other than as
> allowed under this Agreement), if they are compromised, if you violate any term of this Agreement, or if
> we terminate this Agreement."

> "You will be provided with one Access Key per Application."

And from the general terms ([terms_of_use.html](https://freesound.org/docs/api/terms_of_use.html)):

> "Do not register multiple API keys to circumvent request limitations."

> "Be fair with your usage of the Freesound API." / "Do not abuse server bandwidth."

Freesound API access is **free only for non-commercial purposes**, and credit to "Freesound and Freesound
users in accordance to sounds' licenses" is required.

**What the terms are silent on:** they do *not* spell out a per-user-key requirement in so many words, and
they do *not* explicitly address "one key serving many users." But the "kept secret … never exposed to the
public" clause makes the embedded-in-SPA shape non-compliant regardless. Note the tension in the "multiple
API keys" clause: it targets registering *many* keys to dodge limits — it does **not** endorse funnelling
many users through *one* shared exposed key either. The compliant model is what the app already does: each
user brings **their own** credential.

## 3. Token-auth rate limits — VERDICT: one shared key cannot comfortably serve many users.

Documented throttles ([overview.html](https://freesound.org/docs/api/overview.html)), verbatim:

> Standard resources: "60 requests per minute and 2000 requests per day"
>
> Write operations (uploading, describing, commenting, rating, bookmarking): "30 requests per minute and
> 500 requests per day"
>
> On exceed: "the APIv2 will return a 429 Too many requests response error"

These limits are **per credential**, not per user. So a single shared key gives *all* users combined only
2000 requests/day. For a 2-person tool doing a handful of searches a week that is plenty; for anything
public it collapses immediately, and one abuser (or one runaway loop) `429`s everyone. The terms add that
limits may be tightened at Freesound's discretion:

> "The number of Freesound API calls you will be permitted to make during any given period may be limited.
> Freesound will determine call limits based on various factors." ([tos_api](https://freesound.org/help/tos_api/))

## 4. Options that need NO backend, ranked by safety

### 4a. Ship the owner's token embedded in the bundle — SIMPLE, NOT SAFE, non-compliant.

- **Confidentiality:** none. Public per §1. Recoverable from bundle or Network tab in seconds.
- **Terms:** violates the "kept secret … never exposed to the public" clause (§2). Revocable at Freesound's
  discretion, and sharing/exposure is an enumerated revocation trigger.
- **Blast radius:** the whole app dies at once if the key is throttled (§3) or revoked (§2); all usage is
  attributed to the owner.
- **Mitigations that don't fix it:** obfuscation/base64/splitting (encoding, not secrecy). A *dedicated,
  disposable* credential the owner is willing to rotate reduces the pain but not the exposure.
- **Verdict:** Acceptable ONLY as a deliberate, eyes-open convenience for a genuinely private tool the owner
  controls and can rotate — i.e. accepting "this key is public and revocable and that's fine because only I
  and one friend use the URL." **Never acceptable for a public app.** Strictly, it is still off-side of the
  written terms even at 2 users, so it trades a small real risk for onboarding convenience.

### 4b. Keep per-user keys, cut the friction — SIMPLE and SAFE (recommended).

The key never becomes a shared secret because each user pastes **their own** credential, which is exactly
the compliant model. Two friction-reducers, no backend:

- **One-time paste persisted in localStorage (status quo).** Already implemented. Each user does the
  https://freesound.org/apiv2/apply flow once and pastes. Zero secret-sharing. The only cost is first-run
  friction. **This is the safe baseline.**
- **Prefill via a link the owner shares privately.** The owner sends a friend a link that pre-populates the
  key field. **Leak-surface assessment — this only stays safe if it prefills the *recipient's own* key, not
  a shared one.** Two sub-cases:
  - *Prefill an empty field with instructions / a deep-link to the apply page* — pure UX, no secret in the
    URL, fully safe.
  - *Prefill the actual key value in a URL query param or `#hash` fragment* — convenient, but the key then
    lands in **browser history, the `Referer` header on any outbound navigation, server/proxy access logs,
    shoulder-surfing, and chat-app link previews**. A `#hash` fragment is meaningfully better than a `?query`
    param (fragments are not sent to servers and not in the `Referer`), and clearing the fragment via
    `history.replaceState` right after reading it shrinks the window — but it is still weaker than a manual
    paste. This is only tolerable if the value is the *recipient's own* key (they already own it; the leak
    exposes only their own credential) and the link is sent over a private channel. **Never put the owner's
    key in a link you share** — that is just §4a with extra steps and a worse leak surface.
- **Verdict:** per-user keys are the compliant, safe answer. Prefill is fine as a UX aid **as long as any
  key value in the URL belongs to the person receiving the link.**

### 4c. Keyless OAuth2 (implicit / device flow) — DOES NOT EXIST for Freesound.

Cross-checked against [original-quality-downloads.md](./original-quality-downloads.md) — no need to
re-derive. Freesound's OAuth2 is authorization-code grant **only**; the token exchange mandates
`client_secret`; there is **no documented PKCE, implicit, or device flow**. From that note (quoting
[authentication.html](https://freesound.org/docs/api/authentication.html)):

> "Our OAuth2 implementation follows the 'authorization code grant' flow described in the RFC6749."

Therefore a *shipped* OAuth client credential would embed a secret and is disqualified for the same reason
as §4a. OAuth2 in this SPA is viable **only** in the "user pastes their own `client_id` + `client_secret`"
shape (that note's verdict) — which is *more* onboarding friction than the current token paste, not less. So
OAuth2 does not help the keyless-onboarding goal at all; it is a downloads feature, not an onboarding one.

## 5. The line at "no real backend": a serverless proxy

The textbook-safe way to let many users share one key is a **tiny serverless function** (Cloudflare Workers,
Netlify/Vercel edge functions) that holds the key server-side and proxies requests to Freesound, so the key
never reaches the browser. Cloudflare's docs describe exactly this primitive
([Workers Secrets](https://developers.cloudflare.com/workers/configuration/secrets/)):

> "Secrets are a type of binding that allow you to attach encrypted text values to your Worker. Secrets are
> used for storing sensitive information like API keys and auth tokens."

This is the **only genuinely-safe way to share one key across users**, and it satisfies Freesound's "kept
secret" clause (the key stays server-side). Whether it counts as the "real backend" the owner excluded is a
judgement call: a single stateless edge function on a free tier is far less than "a backend" in the
maintenance sense (no server, no DB, deploy-and-forget), but it *is* server-side code and infrastructure the
owner must own, and it re-introduces the shared 2000/day cap (§3) plus the need to prevent the *proxy* from
becoming an open relay (add an allowlist / simple auth, or the whole world uses the owner's quota). Out of
scope per the prompt; noted as the standard answer if the "one shared key" requirement ever hardens.

## 6. Verdict for THIS app (2-person, weekly) and recommendation ladder

Both users have Freesound accounts and can each mint a free key in one visit to
https://freesound.org/apiv2/apply. That makes per-user keys nearly free in practice — the "friction" is a
one-time, once-per-person paste. Ranked for an implementing agent:

1. **(SIMPLE AND SAFE — do this) Keep per-user keys; add a friendly prefill/deep-link that does NOT carry a
   shared secret.** Persist in localStorage (already done). Optionally: a first-run panel with a one-click
   "Get a key" link to `apiv2/apply` and clear paste instructions; if you add a prefill link, prefill only
   the *recipient's own* key and use a `#hash` fragment cleared with `history.replaceState` immediately after
   read. Compliant, no shared secret, no backend. This is the recommendation.

2. **(SIMPLE, NOT STRICTLY SAFE — acceptable only knowingly) Embed a dedicated, disposable owner token in the
   bundle.** Only if the owner explicitly accepts that the key is public, revocable, and throttle-shared, and
   is willing to rotate it. Use a *separate* credential from any real work, never the owner's main key.
   Understand this is technically off-side of Freesound's terms even at 2 users, and any stranger who finds
   the GitHub Pages URL can burn the 2000/day quota or get the key revoked. Fine for a private toy; disqualify
   the moment the app is meant to be public.

3. **(SAFE, but crosses the "no backend" line — only if requirement (i) ever hardens) A single serverless
   proxy** (Cloudflare Worker) holding the key, with a request allowlist so it isn't an open relay. This is
   the only real way to share one key safely, but it is server-side infra and re-imposes the shared quota.

**Bottom line:** "simple AND safe" = option 1. "Simple but not safe" = option 2. There is no fourth option
that is both keyless-onboarding *and* safe *and* backendless — that combination is ruled out by physics
(client code is public) and by Freesound's terms.

## Remaining uncertainty

- The strongest-worded confidentiality clause ("must be kept secret and confidential and under no
  circumstances be exposed to the public") comes from the **legal** terms page (https://freesound.org/help/tos_api/);
  the developer-facing docs pages are quieter on it. I did not find a Freesound page that *explicitly*
  permits or forbids "one key, many end-users" in those exact words — the prohibition is inferred from the
  secrecy clause, which is unambiguous, plus the single-key-per-application and fair-use clauses.
- Whether the owner considers a single stateless edge function a "real backend" is a preference, not a fact;
  §5 lays out the tradeoff rather than deciding it.
- Rate-limit numbers (60/min, 2000/day) are from the current overview docs and are described by Freesound as
  adjustable at their discretion.
