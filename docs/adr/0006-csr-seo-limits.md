# 6. Client-side rendering, with its SEO limits accepted

**Status:** Accepted

## Context

The brief specified React + Vite. E-commerce is one of the categories where
search visibility has direct commercial value, and a client-rendered SPA serves
an empty shell to anything that does not execute JavaScript.

## Decision

Ship a client-rendered SPA, do everything achievable within that, and state the
limits plainly rather than implying parity.

What is done:

- React 19 hoists `<title>` and `<meta>` rendered anywhere in the tree, so each
  route sets its own metadata without a helmet library.
- JSON-LD for Product, BreadcrumbList and Organization. Google executes
  JavaScript, so structured data on a rendered page is generally read.
- A dynamic `sitemap.xml` served by the API from live catalogue data, clean
  slug URLs, canonical links, Open Graph tags.
- Filter state in the URL, so a filtered listing is linkable and indexable.
- Route-level code splitting, so the shell paints quickly.

What is not achieved: crawlers that do not execute JavaScript see nothing.
Google usually does; many others — including several social preview fetchers —
do not or do so inconsistently. Rendering also happens on a second pass, so
indexing is slower than for server-rendered HTML.

## Consequences

If organic search becomes a primary channel, this needs prerendering or SSR.
The upgrade path is kept open deliberately: all data access lives in feature
`api/` modules and services rather than inside components, and no component
reaches for `window` during render. Moving to a server-rendering setup is a
change of shell, not a rewrite of the application.

The honest summary: this is the right call for a Vite SPA and the wrong call for
a storefront whose traffic depends on organic search. Which of those this is
should be decided before launch, not after.
