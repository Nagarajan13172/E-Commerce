# @ecom/shared

Zod schemas, inferred types and constants used by **both** the API and the web
app. One definition validates the request, drives the React Hook Form resolver
and types the axios response, so the three cannot drift apart.

## `sideEffects: false`

The package declares this because it is true: every module is pure schema, type
and constant declarations with no top-level effects.

The measured saving is modest — roughly 10 kB uncompressed off a login page
load. What it mainly buys is granularity: without the declaration the bundler
must keep the package whole, and it emitted a single 100 kB chunk that every
entry point pulled in regardless of which schemas it used. Now the schemas
split with the code that imports them, so a page pays for what it uses and the
chunks cache independently.

Adding a module with a genuine top-level effect here would silently break that,
so keep this package declarative.
