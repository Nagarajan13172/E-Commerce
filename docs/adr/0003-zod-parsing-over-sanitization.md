# 3. Strict Zod parsing instead of a NoSQL sanitizer

**Status:** Accepted

## Context

`{"email": {"$ne": null}}` posted to a login endpoint that passes the body
straight to `User.findOne` matches the first user in the collection. The usual
mitigation is `express-mongo-sanitize`, which strips keys beginning with `$`
or containing `.`.

Two problems with reaching for it here. It mutates `req.query`, which Express 5
exposes as a getter — assigning to it throws. And it is a blacklist: it removes
the operators someone thought of.

## Decision

No sanitizer. Every request is parsed by a Zod schema that declares exactly what
it accepts, and the result is written to `req.validated` rather than back onto
`req.query`.

## Consequences

Whitelisting is strictly stronger than blacklisting. `z.string()` given
`{$ne: null}` fails because the value is an object, not because anyone
enumerated `$ne`. `z.coerce.number()` given `{$gt: 0}` yields `NaN` and fails.
Unknown keys are dropped rather than forwarded. There is no operator to escape
because there is no path by which an object reaches a query at all.

Because schemas live in `@ecom/shared`, the same definition validates the API
request, drives the React Hook Form resolver, and types the axios response —
so the client cannot send a shape the server rejects without the mismatch being
a type error first.

Writing to `req.validated` is not only an Express 5 workaround. Handlers read
parsed, typed data at a different property from the raw input, so it is visible
at a glance whether a handler is using validated input.

There is a structural guarantee underneath this. Express 5's default query
parser is `simple`, which does not build nested objects at all: `?a[$ne]=1`
arrives as the flat key `"a[$ne]"` and the schema drops it. The schemas would
reject the nested form anyway — this is defence in depth, not the primary
mechanism — but switching the parser to `extended` re-enables a class of input
the schemas are then solely responsible for, so it should not change without a
deliberate re-audit. `security.test.ts` asserts the parser mode for that reason.

## Notes

The same test file asserts the login bypass fails, that bracketed operators in a
query string change nothing, and that unknown parameters are dropped.

Regex is the one place raw user input still reaches a query, in the admin search
boxes and typeahead. Every such site routes through `escapeRegex()`
(`backend/src/utils/regex.ts`) — unescaped, `.*` matches the whole collection,
`(a+)+$` is a denial of service, and an unbalanced `[` is a 500.
