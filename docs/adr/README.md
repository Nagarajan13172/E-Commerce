# Architecture decision records

One file per decision that was genuinely contested — where a competent engineer
could have chosen otherwise, and where knowing _why_ changes what you should do
when you touch that code.

Decisions with an obvious answer are not recorded here. Neither are decisions
already explained where they live: the reason inventory is reserved rather than
decremented is in `inventory.service.ts`, next to the query that depends on it,
which is where someone about to change it will actually be looking.

| #                                                | Decision                                                  | Status   |
| ------------------------------------------------ | --------------------------------------------------------- | -------- |
| [0001](0001-embedded-variants.md)                | Variants embedded in the product document                 | Accepted |
| [0002](0002-cookie-auth-over-bearer-tokens.md)   | httpOnly cookies + CSRF, not `localStorage` bearer tokens | Accepted |
| [0003](0003-zod-parsing-over-sanitization.md)    | Strict Zod parsing instead of a NoSQL sanitizer           | Accepted |
| [0004](0004-tanstack-query-owns-server-state.md) | TanStack Query owns server state; Redux owns client state | Accepted |
| [0005](0005-provider-interfaces.md)              | Payments, storage, email and search behind interfaces     | Accepted |
| [0006](0006-csr-seo-limits.md)                   | Client-side rendering, with its SEO limits accepted       | Accepted |
