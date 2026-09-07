# 5. Payments, storage, email and search behind interfaces

**Status:** Accepted

## Context

Four external dependencies: a payment provider, object storage, email, and
search. Each has a plausible replacement — Razorpay for the mock, S3 or R2 for
MinIO, SES for SMTP, Atlas Search or Elasticsearch for MongoDB `$text`.

Coding directly against each vendor's SDK is faster to write and makes every
future swap a rewrite of everything that touched it.

## Decision

Each sits behind an interface, selected by environment variable, with business
logic depending only on the interface.

- `PaymentProvider` — `createOrder`, `verifySignature`, `verifyWebhook`,
  `parseWebhook`, `fetchPayment`, `refund`
- `StorageService` — `upload`, `delete`, `getPresignedPutUrl`, `getPublicUrl`, …
- `EmailProvider` — `send`, with SMTP, console and in-memory implementations
- `SearchService` — `search(ProductQuery)`, `suggest(term)`

## Consequences

**The mock payment provider signs with real HMAC-SHA256** and verifies in
constant time. It is not a stub that returns `{ success: true }`. That means
signature verification, webhook parsing, replay deduplication and the
verify-versus-webhook race are all genuinely exercised by the test suite today,
against the same code paths Razorpay will use. `RazorpayProvider` is a ~120-line
adapter, and nothing above the interface changes.

**Storage uses the S3 SDK against MinIO**, not the MinIO SDK, with
`forcePathStyle: true`. The same class works against MinIO, AWS S3 and
Cloudflare R2 — production and development run identical code rather than merely
similar code.

**The in-memory email provider is what makes the auth tests honest.** Reset and
verification tokens are stored hashed; the plaintext exists only in the message.
Tests read the token out of the sent email, which is exactly what a user does by
clicking the link.

**`SearchService` documents its own replacement point.** The Mongo adapter's
typeahead uses a non-anchored regex, which cannot use an index and is therefore
O(collection). That is fine at catalogue scale and a real problem well before a
million products — which is precisely when the interface earns its cost.

The price is one indirection per call and a little more code. On a codebase this
size that is close to free, and it is paid back the first time any of the four
changes.
