# 4. TanStack Query owns server state; Redux owns client state

**Status:** Accepted

## Context

The brief asked for Redux Toolkit and for TanStack Query. Both are described as
state management, and using both without a boundary produces the worst of each:
data fetched by Query, copied into Redux by an effect, and then two sources of
truth that drift.

## Decision

A single rule: **if it came from the server, TanStack Query owns it. If it never
leaves the browser, Redux owns it.**

| State                                            | Owner                      |
| ------------------------------------------------ | -------------------------- |
| Products, cart, orders, wishlist, all admin data | TanStack Query             |
| The signed-in user                               | TanStack Query (`useAuth`) |
| Filters, sort, page, search term                 | URL search params          |
| Cart drawer open, filter sheet, theme            | Redux (`ui`)               |
| In-progress checkout step and selections         | Redux (`checkout`)         |
| Form fields                                      | React Hook Form            |

Redux's root reducer is `{ ui, checkout }`. Nothing else.

## Consequences

Query gets what it is for — caching, deduplication, revalidation, stale-while-
revalidate, optimistic updates with rollback. Redux gets what it is for —
synchronous client state that several distant components share.

Two specific consequences worth stating, because both were initially got wrong:

**The session is not mirrored into Redux.** An `authSlice` holding a copy of the
current user was written and then deleted. It needed an effect to stay in step
with the query cache, and the two could disagree — which is exactly the failure
this boundary exists to prevent. `useAuth()` reads the query cache and is the
only source of truth. Deduplication by key means N components calling it share
one request.

**The cart is not client state.** It is a server resource with optimistic
mutations and rollback. A client-side cart drifts from real stock and prices,
does not survive a device change, and desynchronises between tabs. The server
is the only correct owner of what someone is about to buy.

## Alternatives considered

**RTK Query instead of TanStack Query.** Coherent, and it would have kept
everything in one library. Rejected because TanStack Query was also requested,
and running both fetching layers would be the exact duplication this decision
exists to avoid.

**Everything in Redux.** Would mean hand-writing caching, invalidation and
request deduplication that Query already does.
