# 2. httpOnly cookies + CSRF, not `localStorage` bearer tokens

**Status:** Accepted

## Context

A React SPA talking to an Express API has to keep a credential somewhere. The
common choice is a JWT in `localStorage`, sent as `Authorization: Bearer`. The
alternative is an httpOnly cookie the browser attaches automatically.

The two choices trade one attack for another:

- `localStorage` is readable by any JavaScript on the page. One XSS — in your
  code or in any dependency you ship — exfiltrates the token, and the attacker
  keeps it after the user closes the tab.
- Cookies are attached automatically to cross-site requests, which is the
  precondition for CSRF.

## Decision

httpOnly cookies, with double-submit CSRF protection.

- **Access token**: JWT, 15 minutes, httpOnly + SameSite=Lax + Secure in
  production. Carries a `tokenVersion` claim so bumping the user's version
  invalidates every live token immediately, on password change, role change or
  suspension.
- **Refresh token**: an _opaque_ 256-bit random value, stored SHA-256 hashed,
  30 days, scoped to `path=/api/v1/auth`. Rotated on every use, with reuse
  detection — presenting an already-rotated token revokes the whole family.
- **CSRF**: an HMAC-signed token in a readable cookie that must be echoed in
  `X-CSRF-Token` on every unsafe method.

## Consequences

XSS can no longer steal the session. It can still _act_ as the user while the
page is open — nothing stops that — but it cannot take the credential away with
it, and revocation actually works.

The cost is that CSRF becomes our problem, and the double-submit scheme is the
answer: a cross-origin attacker can cause the cookie to be _sent_ but cannot
_read_ it to populate the header.

The refresh token is opaque and stored rather than a JWT because refresh tokens
must be revocable server-side, and a stateless token cannot be. That is one
extra database read per refresh, every fifteen minutes per active session.

Payment webhooks are exempt from CSRF and mounted before the middleware: they
carry no cookies, so there is no ambient authority to abuse, and they are
authenticated by HMAC signature instead.

## Notes

`backend/tests/integration/security.test.ts` asserts the cookie flags, that a
request with no CSRF token is refused, and that a forged token we did not sign
is refused. Those are the properties this decision rests on, so they are pinned.
