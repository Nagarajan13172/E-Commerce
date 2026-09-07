# Aurora — Full-Stack MERN E-Commerce Platform

A production-grade e-commerce platform: customer storefront + admin dashboard, built on
MongoDB, Express 5, React 19 and Node 24, with Docker-based object storage.

This is not a CRUD demo. The design is driven by four rules that shape almost every
decision in the codebase:

1. **Never trust the client** — prices, inventory and authorization are all recomputed
   and enforced server-side.
2. **Never oversell** — stock is reserved atomically inside MongoDB transactions.
3. **Never double-charge or double-fulfil** — client retries and provider webhooks are
   both idempotent.
4. **Keep every external dependency behind an interface** — payments, storage, cache,
   email and search can each be swapped without touching business logic.

---

## Status

| Phase | Scope                                                               | State       |
| ----- | ------------------------------------------------------------------- | ----------- |
| 1     | Project structure, Docker infra, TS/lint/test toolchain, app shells | ✅ Complete |
| 2     | Models, auth, RBAC, storage/email/cache integrations                | ✅ Complete |
| 3     | Categories, brands, products, variants, search, media, seed data    | ✅ Complete |
| 4     | Storefront: home, listing, PDP, search, account, wishlist, cart     | ✅ Complete |
| 5     | Coupons, pricing service, multi-step checkout                       | ✅ Complete |
| 6     | Orders, payments, inventory reservation, notifications              | ✅ Complete |
| 7     | Admin panel and analytics                                           | ✅ Complete |
| 8     | Testing, security, performance and accessibility hardening          | ✅ Complete |

Cart was pulled forward from Phase 5 into Phase 4 — a storefront you can browse but
cannot add to is not a coherent checkpoint. Phase 5 is therefore coupons, the pricing
service and checkout.

---

Design decisions that were genuinely contested — embedded variants, cookie auth,
Zod-instead-of-sanitizer, the Query/Redux split, the provider interfaces, and the
SEO limits of client-side rendering — are recorded in [docs/adr](docs/adr).

---

## Technology

**Backend** — Node 24, Express 5, MongoDB 8 (replica set), Mongoose 9, Zod 4, argon2,
pino, AWS S3 SDK (against MinIO), ioredis, nodemailer, Vitest + Supertest.

**Frontend** — React 19, Vite 8, TypeScript 6, React Router 8, Redux Toolkit 2,
TanStack Query 5, Tailwind CSS 4, shadcn/ui, lucide-react, React Hook Form, axios.

**Infrastructure** — Docker Compose: MongoDB, MinIO, Redis, Mailpit, mongo-express.

### Why these versions

TypeScript is pinned to **6.0.3** rather than the newer 7.x. TypeScript 7 is the native
(Go) compiler port, and `typescript-eslint` still declares `typescript >=4.8.4 <6.1.0` —
adopting 7 today would mean giving up typed linting. 6.0.3 is stable, current, and fully
supported by the lint toolchain.

---

## Prerequisites

- **Node.js ≥ 20.19** (developed on 24.11)
- **pnpm ≥ 9** — `corepack enable && corepack prepare pnpm@9.15.4 --activate`
- **Docker Desktop** (or any Docker engine with Compose v2)

---

## Quick start

```bash
git clone <repo> && cd E-Commerce
cp .env.example .env          # defaults work as-is for local development
pnpm install
pnpm docker:up                # MongoDB, MinIO, Redis, Mailpit, mongo-express
pnpm build:shared             # shared/ must be built once before first run
pnpm dev                      # shared (watch) + backend :4000 + frontend :5173
```

Then open <http://localhost:5173>. The landing page calls the live
`/health/ready` endpoint, so a green row means that service is genuinely reachable
through the real request path (browser → CORS → Express → dependency).

### Service map

| Service       | URL                                         | Notes                            |
| ------------- | ------------------------------------------- | -------------------------------- |
| Frontend      | <http://localhost:5173>                     | Vite dev server                  |
| Backend       | <http://localhost:4000/api/v1>              | Express                          |
| Health        | <http://localhost:4000/api/v1/health/ready> | Per-dependency readiness         |
| MinIO console | <http://localhost:9001>                     | `minioadmin` / `minioadmin`      |
| Mailpit       | <http://localhost:8025>                     | Catches every outbound dev email |
| mongo-express | <http://localhost:8081>                     | Browse collections               |
| MongoDB       | `localhost:27017`                           | Single-node replica set `rs0`    |
| Redis         | `localhost:6379`                            | Cache + rate-limit counters      |

---

## Docker

```bash
pnpm docker:up       # start everything
pnpm docker:ps       # health status
pnpm docker:logs     # follow all logs
pnpm docker:down     # stop, keep data
pnpm docker:reset    # stop AND wipe all volumes (full reset)
```

### Why MongoDB runs as a replica set

`docker-compose.yml` starts mongod with `--replSet rs0` and a one-shot `mongo-init`
container that calls `rs.initiate()`. **This is not optional.** Checkout reserves stock
for every line item inside a transaction, and MongoDB transactions do not exist on a
standalone `mongod`. The API verifies this at boot and refuses to start with an
actionable message if it finds a standalone server.

Clients connect with `?directConnection=true`, which bypasses topology discovery. That
is what lets the _same_ connection-string shape work from the host (`localhost:27017`)
and from sibling containers (`mongo:27017`), regardless of the hostname the replica set
advertises internally.

### Object storage layout

The `ecom-media` bucket is namespaced by visibility:

- `public/**` — anonymously readable. Product imagery gets stable, cacheable,
  crawler-visible URLs.
- `private/**` — no anonymous access. Invoices and return labels are served only via
  short-lived presigned GET URLs.

Uploads use **presigned PUT straight from the browser to MinIO**, so large images never
stream through Node. The server then verifies the object's real magic bytes before
recording it — a renamed `.exe` cannot masquerade as a PNG.

---

## Environment variables

Every variable is parsed by Zod at boot (`backend/src/config/env.ts`) and the process
**exits** on anything missing or malformed, so a misconfiguration fails at deploy time
rather than at 3am during a checkout. See `.env.example` for the full annotated list.

Secrets are generated with:

```bash
openssl rand -base64 48
```

Two guards are enforced for production specifically: `COOKIE_SECURE` must be `true`, and
`PAYMENT_PROVIDER=mock` is rejected outright.

---

## Commands

```bash
pnpm dev              # shared (watch) + backend + frontend
pnpm dev:backend      # backend only
pnpm dev:frontend     # frontend only
pnpm build:shared     # build shared/ (required before the first dev run)
pnpm build            # build shared → backend → frontend
pnpm typecheck        # tsc across every package
pnpm lint             # ESLint across the workspace
pnpm format           # Prettier write
pnpm test             # Vitest across every package
pnpm test:backend     # backend tests only
pnpm test:frontend    # frontend tests only
pnpm test:e2e         # Playwright: journeys, accessibility, responsiveness
                      #   needs docker:up + seed + dev running
pnpm seed             # populate the database with demo data
```

Package names map to folders: `@ecom/backend`, `@ecom/frontend`, `@ecom/shared`. Any of
them can be targeted directly with `pnpm --filter @ecom/<name> <script>`.

---

## Architecture

```
E-Commerce/
├── backend/            Express API
│   ├── src/
│   │   ├── config/         env (Zod-parsed), db, logger, redis
│   │   ├── models/         Mongoose schemas + indexes
│   │   ├── services/       ALL business logic lives here
│   │   ├── controllers/    thin HTTP ↔ service translation
│   │   ├── routes/v1/      public / account / admin / webhooks
│   │   ├── middleware/     auth, rbac, validate, csrf, rateLimit, errorHandler
│   │   ├── integrations/   payments · storage · email · cache (all behind interfaces)
│   │   ├── events/ jobs/   domain events, background workers
│   │   ├── utils/ seed/
│   │   ├── app.ts          Express assembly
│   │   └── server.ts       lifecycle + graceful shutdown
│   └── tests/              unit · integration (in-memory replica set)
│
├── frontend/           React SPA
│   ├── src/
│   │   ├── components/     ui/ (shadcn primitives) + common/ (shared building blocks)
│   │   ├── features/       auth, catalog, cart, checkout, orders, account, admin/
│   │   ├── layouts/        Root, Store, Account, Admin, Auth
│   │   ├── routes/         route tree + guards; /admin is lazy-loaded
│   │   ├── lib/            apiClient, queryClient, format, utils
│   │   ├── hooks/ store/ styles/
│   │   └── main.tsx  App.tsx
│   └── tests/
│
├── shared/             Zod schemas + types imported by BOTH sides
├── docker/             MongoDB replica-set init, MinIO bucket bootstrap
├── docker-compose.yml
├── tsconfig.base.json  tsconfig.node.json  tsconfig.react.json
└── package.json        pnpm workspace root
```

Layering in the backend is strict: `route → middleware → controller → service → model`.
Controllers only translate HTTP to service calls; no business logic lives in a route
handler, and no Mongoose query syntax appears above the service layer.

### The shared folder earns its keep

`shared/` holds each schema exactly once. The same `productQuerySchema` that
validates an incoming request on the server also parses `useSearchParams()` in the
browser. That is why a shared URL like

```
/products?category=footwear&brand=nike&minPrice=1000&sort=price_asc
```

is guaranteed to mean the same thing on both sides: there is no second, drifting copy of
the parsing rules.

### State management

**Redux Toolkit + TanStack Query**, split by _who owns the data_ — not by feature.

| Kind of state                                               | Owner              | Examples                                                            |
| ----------------------------------------------------------- | ------------------ | ------------------------------------------------------------------- |
| **Server state** — lives in the database, arrives over HTTP | **TanStack Query** | products, cart, orders, wishlist, addresses, **the signed-in user** |
| **Client state** — the server has no opinion about it       | **Redux Toolkit**  | open drawers and sheets, theme, admin sidebar                       |

Two rules follow from that, and both are checkable:

```bash
# 1. No reducer performs I/O.
grep -rn "apiGet\|apiPost\|createAsyncThunk" frontend/src/store/   # → nothing

# 2. No fetched entity is mirrored into the store.
grep -n "reducer:" -A4 frontend/src/store/index.ts                  # → { ui } only
```

The second rule is the one that is easy to get wrong. The signed-in user _feels_ like
application state, so the obvious move is to fetch it with a query and copy it into a
slice. That copy then needs an effect to stay in step, and you have two sources of truth
that can disagree — exactly what this architecture exists to prevent. So the session is
read through `useAuth()`, whose only source is the query cache. TanStack Query
de-duplicates by key, so the header, a route guard and a page all calling `useAuth()`
share one request and one cache entry.

Transient form feedback (a failed sign-in message, server-side field errors) is read
straight off the mutation. It belongs to the form, not to global state.

Always use the typed `useAppDispatch` / `useAppSelector` from
`frontend/src/store/hooks.ts`; the bare react-redux versions type state as `unknown`.

Tokens are never in either layer. They live in httpOnly cookies the app cannot read —
which is what makes them safe from XSS — so "am I signed in?" is answered by asking the
server, not by inspecting client state.

### Why not RTK Query

RTK Query is a fine library, but it is an API cache — the same job TanStack Query does
here. Running both would mean two caches able to disagree about the same resource, and
two invalidation systems to keep in step. The data layer is TanStack Query throughout,
and Redux Toolkit does what it is best at: predictable, inspectable client state.

## Storefront

| Route                                                                             | What it does                                                           |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `/`                                                                               | Data-driven homepage — hero, categories, trending, new arrivals, deals |
| `/products`                                                                       | Listing with facets, sorting, pagination; all filter state in the URL  |
| `/products/:slug`                                                                 | Product detail with gallery, variant matrix, specs, related            |
| `/cart`                                                                           | Full bag; the drawer opens from the header on any page                 |
| `/account`                                                                        | Overview, addresses, wishlist                                          |
| `/login` · `/register` · `/forgot-password` · `/reset-password` · `/verify-email` | Auth                                                                   |

### Filters live in the URL

`useProductFilters` parses `useSearchParams()` with **the same `parseProductQuery` the
API validates with**. A link like

```
/products?category=fashion&brand=stride&minPrice=5000&rating=4&inStock=1&sort=price_asc
```

therefore means exactly the same thing in the browser and on the server — there is no
second copy of the parsing rules to drift. It also makes the view shareable and
bookmarkable, gives correct back/forward behaviour, and hands React Query a natural
cache key for free.

### The variant matrix

The hard part of a variant picker is telling the customer which combinations exist
_before_ they click one. `useVariantSelection` derives, for every option value,
whether it is available **given the other current selections** — so picking a colour
immediately marks the sizes that colour does not come in.

Three states, and the distinction matters:

- **does not exist** — no variant has this value. Disabled.
- **not with your other choices** — struck through but still clickable. Selecting it
  clears whichever other choice was blocking it. Disabling these instead would trap a
  customer who happened to pick their size before their colour.
- **out of stock** — a real combination with no stock. Selectable, so its price stays
  visible.

### Guest carts

Anonymous shoppers get a cart keyed by a random id in an httpOnly cookie — forcing an
account before the bag is the single largest source of abandonment. On sign-in the
guest bag is **merged** into the account cart, summing duplicate lines and capping each
at live stock. A merge failure is logged and swallowed: losing a cart is far better
than being unable to log in.

Cart reads never trust stored prices. Every line is re-priced from the live product on
every read, and a changed price is surfaced to the customer rather than silently
applied.

### Session hint

The refresh token is httpOnly and unreadable by scripts, so the SPA cannot tell whether
one exists. A non-secret `has_session` cookie says so, and the axios interceptor only
attempts a token refresh when it is present. Without it, every anonymous page load
fired a guaranteed-to-fail `POST /auth/refresh` — two wasted round trips on the most
common kind of visit.

---

## Admin panel

`/admin` is a lazily-loaded route subtree behind a role guard. Customers never download
it — the dashboard chunk alone (recharts) is ~100 kB gzipped, which no shopper should
pay for.

**The guard is UX, not security.** Every route the admin pages call is authorized
independently on the server, and `tests/integration/adminAuthz.test.ts` asserts a 403
for a customer token on all 46 of them, plus the correct 403 for a `support` account on
every route it must not reach. Bypassing the client guard in devtools yields an empty
shell, not data.

Navigation is filtered by **permission**, not role, so `support` sees Orders, Products,
Inventory, Customers and Reviews but not the dashboard or coupons — the same matrix the
server enforces, read from `/auth/me`.

### Analytics

Every figure is computed in MongoDB, never by loading orders into Node. Two rules govern
what the numbers mean:

- **Only realised revenue counts.** An order in `pending_payment` has taken no money;
  counting it would flatter every abandoned checkout. Refunds are subtracted, so revenue
  is what the business kept.
- **Each metric carries the preceding window of equal length.** "₹2.4L" says little;
  "₹2.4L, up 12%" says whether the week went well. A zero baseline reports _no_ change
  rather than +∞%.

Two subtleties worth knowing, both of which shipped as bugs and are now regression-tested:

- The daily series is bucketed by **local** calendar day on both sides. Grouping with an
  unqualified `$dateToString` (which is UTC) while deriving the window from local
  midnights put every order in the wrong bucket and dropped today's entirely — the chart
  read as a flat zero line beneath a summary showing real revenue.
- The category mix attributes a sale to the product's **first** category, rolled up to
  the top of its tree. Unwinding every category a product belongs to double-counts its
  line total, and the pie would then exceed the revenue printed directly above it.

### Guards that mirror the server

Where the server refuses something, the UI hides the control rather than letting an
admin discover the rule by triggering an error: you cannot change your own role or
status, and the last remaining admin cannot be demoted or disabled.

---

## Search and filtering

A listing request is **one aggregation**. `$facet` returns the page of results, the
total count and every facet bucket together, so the grid, the result count and the
sidebar are a single round trip rather than six.

Filtering, sorting and pagination all execute in MongoDB. Nothing is loaded into Node
to be filtered there — that pattern survives a seeded catalog and collapses on a real one.

Two details worth knowing:

**Facets exclude their own dimension.** Brand counts are computed _without_ the brand
filter applied. After ticking "Lumen" you can still see how many Stride products are
available; a facet that collapsed to only the current selection would make a
multi-select filter impossible to widen again.

**Every sort ends with `_id` as a tiebreaker.** Without it, documents with equal sort
keys can be ordered differently between page 1 and page 2, so items appear twice or
vanish while paging.

The `SearchService` interface exists because MongoDB `$text` is the weakest part of
this stack — no typo tolerance, no synonyms. Autocomplete deliberately does _not_ use
it (a text index matches whole words, so typing "lin" would find nothing until the user
finished "linen") and uses a substring regex instead, which is O(collection) and is
exactly the point at which an Atlas Search or Elasticsearch adapter replaces this one,
with no change above the interface.

---

## Media uploads

The flow is **presign → direct browser PUT → confirm**, so image bytes never pass
through Node.

The security consequence is that the server never sees the upload, so `confirm`
re-verifies everything the client claimed against the object that actually landed: its
real size, and its **magic bytes**. Trusting the declared `Content-Type` would let a
renamed script be served from our own origin. Anything that fails verification is
deleted from the bucket, not merely rejected.

Confirmed uploads then get three responsive WebP derivatives and a base64 blur
placeholder generated in the background, so the admin sees the image immediately rather
than waiting on three resizes.

---

## Testing

```bash
pnpm test           # backend + frontend unit and integration suites
pnpm test:backend   # 331 tests: services, routes, authorization, security, indexes
pnpm test:e2e       # 26 Playwright tests: journeys, accessibility, responsiveness
```

`pnpm test` is safe to run anywhere: it uses an in-memory database and needs no
infrastructure. `pnpm test:e2e` deliberately does not — it drives a real browser
against a running stack (`pnpm docker:up && pnpm seed && pnpm dev`), because the bugs
it exists to catch only appear once the pieces are joined up. Keeping it separate means
`pnpm test` never fails for want of a Docker daemon, which is the failure mode that
teaches people to ignore a suite.

Integration tests run against an in-memory **`MongoMemoryReplSet`**, not a standalone
server — otherwise the transaction-based inventory logic, which is the single most
important thing to test, could not be exercised at all.

Email is captured rather than sent: under `NODE_ENV=test` the `EmailProvider` resolves to
an in-memory recorder, so tests can assert that a message was sent and read the one-time
token out of its body — exactly as a real user does by clicking the link. Tokens are
stored hashed, so the email really is the only place the plaintext exists.

The suite deliberately encodes security properties, not just happy paths: refresh-token
reuse revoking a whole family, login not leaking which emails have accounts, a
`{"$ne": null}` payload failing validation before it reaches Mongoose, and a
client-supplied `role: "admin"` being stripped at registration.

`adminAuthz.test.ts` enumerates **every** admin route and asserts 401 for anonymous
callers, 403 for customers, and 403 for `support` on each write endpoint. The list is
exhaustive rather than sampled on purpose: an unguarded admin endpoint is the single
worst bug this codebase could ship, and a sample would let one through.

`security.test.ts` is written as attacks rather than features — an operator object in
place of an email, a role smuggled into a registration payload, one customer reaching
for another's address, a forged CSRF token, a regex metacharacter in a search box. Each
one would be a real vulnerability if it passed.

`indexes.test.ts` asserts the index topology, which sounds like plumbing and is not.
The suite had been running for seven phases against databases carrying only `_id_` on
every collection: Mongoose builds indexes in the background and the tests were winning
that race. Unique constraints were therefore never actually enforced during a test, and
a `$text` search failed outright. The helper now awaits `syncIndexes()` before the first
test, and these assertions stop it regressing — including an `explain()` check that a
catalogue listing uses an `IXSCAN` rather than a collection scan.

### End-to-end and accessibility

`pnpm test:e2e` covers the shopping journey, the admin journeys, and two gates that are
easy to lose without one:

- **Accessibility.** Every storefront and admin page is scanned with axe in _both_
  themes. Light passing says nothing about dark: `--warning-foreground` is dark by
  design, and it was measuring 1.35:1 against its own dark tint.
- **Responsiveness.** No page may scroll sideways at 375, 768, 1024, 1440 or 1920px.

Sign-in happens once per role and is reused via stored session state — across runs, not
just across tests. That is not only faster: `authLimiter` permits ten attempts per
fifteen minutes per (IP, email), and a suite that signs in afresh every time trips it,
then fails later tests with a 429 that looks like a broken login.

The same lesson applies more broadly, and cost an hour to learn. A rate-limited write
does not surface as an error the user sees — the optimistic update simply rolls back, so
an add-to-basket click appears to do nothing at all. `globalLimiter` and `writeLimiter`
are therefore raised outside production (3,000 and 600 per minute rather than 300 and
60), because one developer with hot reload plus a browser suite loading sixty pages
legitimately exceeds a production ceiling from a single loopback address. They stay in
the request path, so a runaway loop is still caught.

The auth, email and checkout limiters are **not** relaxed. Their numbers describe what
abuse looks like rather than what a busy developer looks like, and a test suite has no
business exceeding them.

---

## Troubleshooting

**`MongoDB transactions unavailable: server is not a replica set`**
The `mongo-init` container did not run. `pnpm docker:ps` should show it as `Exited (0)`.
Re-run with `pnpm docker:reset`.

**API exits at boot with "Invalid environment configuration"**
Expected behaviour — the message lists exactly which variables are missing or malformed.
Copy `.env.example` to `.env`.

**`Blocked by CORS` in the API log**
The browser origin is not in `CORS_ORIGINS`. Credentials are enabled, so a wildcard is
not permitted; add the exact origin.

**Uploads fail from the browser with a CORS error**
MinIO's allowed origins come from `MINIO_API_CORS_ALLOW_ORIGIN`, which Compose reads
from `CORS_ORIGINS`. Restart MinIO after changing it.

**Port already in use**
Ports needed: 4000, 5173, 27017, 6379, 9000, 9001, 1025, 8025, 8081.
Check with `lsof -i :<port>`.
