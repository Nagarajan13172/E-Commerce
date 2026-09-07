# 1. Variants embedded in the product document

**Status:** Accepted

## Context

A product has variants — a shirt in three colours and five sizes is fifteen
sellable things, each with its own SKU, price and stock. They could live in a
separate `variants` collection referenced by product, or as an array inside the
product document.

Two operations dominate: reading a product (listing grids and the detail page,
the hottest paths in the application) and mutating stock during checkout (the
operation that must never be wrong).

## Decision

Embed variants as an array on `Product`.

## Consequences

**What this buys.** Stock mutation becomes single-document atomic, which is the
whole argument:

```js
Product.updateOne(
  { _id, 'variants._id': variantId, 'variants.stock.available': { $gte: qty } },
  { $inc: { 'variants.$.stock.available': -qty, 'variants.$.stock.reserved': qty } },
);
```

The `$gte` guard and the `$inc` are one operation. Under N concurrent buyers of
the last unit, MongoDB serialises the writes and exactly one matches — no
read-modify-write, no lost update, no application-level lock. A separate
collection would still be atomic per variant document, but the guard against
overselling would then be spread across two collections and need the transaction
to carry more weight.

Reads also stop needing a `$lookup` or a second query: a listing page of 24
products with variants is one round trip rather than 25.

**What this costs.** A practical ceiling around 100 variants per product, from
MongoDB's 16 MB document limit and the cost of rewriting a large document on
every stock change. A catalogue with thousand-variant products would need the
separate collection.

That migration is deliberately cheap: every stock mutation goes through
`InventoryService`, and `stockPaths()` already abstracts whether a line refers
to a variant or a simple product. Moving to a `variants` collection changes that
service and nothing above it.

## Alternatives considered

**Separate collection, referenced.** Rejected for the two reasons above. Would
be the right call above the variant ceiling.

**Cartesian generation at read time.** Rejected outright: variants differ in
price, stock, SKU, barcode and images. They are entities, not a product of
their axes.
