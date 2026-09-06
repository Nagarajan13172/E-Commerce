import { useCallback, useMemo, useState } from 'react';
import type { ProductDetail, ProductVariant } from '@/types/catalog';

export interface VariantOptionValue {
  value: string;
  /** False when no variant has this value AT ALL — genuinely not sold. */
  existsAtAll: boolean;
  /** False when no variant matches this value *given the other selections*. */
  isAvailable: boolean;
  /** True when a matching variant exists but every one is out of stock. */
  isOutOfStock: boolean;
}

export interface VariantSelection {
  selected: Record<string, string>;
  variant: ProductVariant | undefined;
  /** True once every declared option has a value chosen. */
  isComplete: boolean;
  optionValues: Record<string, VariantOptionValue[]>;
  select: (optionName: string, value: string) => void;
  price: number;
  compareAtPrice: number | undefined;
  availableStock: number;
  sku: string;
}

/**
 * Variant selection.
 *
 * The hard part of a variant picker is not tracking the choice — it is telling
 * the customer which combinations exist *before* they try one. A picker that
 * lets you choose Red, then Size 9, then says "unavailable" wastes two clicks
 * and reads as a broken shop.
 *
 * So for every option value this computes availability against the *other*
 * current selections: choosing Red immediately marks the sizes Red does not come
 * in, and choosing Size 9 marks the colours that do not come in a 9.
 *
 * Three distinct states, and the distinction matters:
 *
 *   existsAtAll: false  — no variant has this value. Genuinely not sold; disabled.
 *   isAvailable: false  — exists, but not with the OTHER current choices. Still
 *                         clickable: selecting it clears the conflicting choice
 *                         (see `select`). Disabling these instead would trap a
 *                         customer who picked Size 7 first and now wants a colour
 *                         that starts at Size 8 — they would have to work out
 *                         for themselves that the size is what is blocking them.
 *   isOutOfStock: true  — exists and matches, but has no stock. Selectable, so
 *                         the price and the fact it is a real option stay visible.
 */
export function useVariantSelection(product: ProductDetail | undefined): VariantSelection {
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [initialisedFor, setInitialisedFor] = useState<string | undefined>();

  /**
   * Seed the selection once the product arrives.
   *
   * A `useState` initializer cannot do this: it runs on the first render, when
   * the query is still loading and `product` is undefined, and never runs again.
   * Adjusting state during render (rather than in an effect) is React's own
   * recommendation for deriving state from changed props — it re-renders before
   * painting, so the picker never flashes an unselected state.
   *
   * Keyed on the product id so navigating between products re-seeds correctly.
   */
  if (product && initialisedFor !== product._id) {
    setInitialisedFor(product._id);
    setSelected(pickInitialSelection(product));
  }

  const activeVariants = useMemo(
    () => (product?.variants ?? []).filter((variant) => variant.isActive),
    [product],
  );

  const variant = useMemo(() => {
    if (!product?.options.length) return undefined;
    return activeVariants.find((candidate) =>
      candidate.optionValues.every((option) => selected[option.name] === option.value),
    );
  }, [activeVariants, product, selected]);

  const optionValues = useMemo(() => {
    const result: Record<string, VariantOptionValue[]> = {};
    if (!product) return result;

    for (const option of product.options) {
      // Availability for THIS option is judged against every other selection,
      // not against the full selection — otherwise the currently-chosen value
      // would be the only one ever marked available.
      const otherSelections = Object.entries(selected).filter(([name]) => name !== option.name);

      result[option.name] = option.values.map((value) => {
        const hasValue = (candidate: ProductVariant) =>
          candidate.optionValues.some((ov) => ov.name === option.name && ov.value === value);

        const matching = activeVariants.filter(
          (candidate) =>
            hasValue(candidate) &&
            otherSelections.every(([name, chosen]) =>
              candidate.optionValues.some((ov) => ov.name === name && ov.value === chosen),
            ),
        );

        return {
          value,
          existsAtAll: activeVariants.some(hasValue),
          isAvailable: matching.length > 0,
          isOutOfStock: matching.length > 0 && matching.every((m) => m.stock.available === 0),
        };
      });
    }

    return result;
  }, [product, activeVariants, selected]);

  const select = useCallback(
    (optionName: string, value: string) => {
      setSelected((current) => {
        const next = { ...current, [optionName]: value };
        if (!product) return next;

        // Drop any other selection that this choice has made impossible, so the
        // picker cannot be left describing a combination that does not exist.
        for (const option of product.options) {
          if (option.name === optionName) continue;
          const chosen = next[option.name];
          if (!chosen) continue;

          const stillPossible = activeVariants.some(
            (candidate) =>
              candidate.optionValues.some((ov) => ov.name === optionName && ov.value === value) &&
              candidate.optionValues.some((ov) => ov.name === option.name && ov.value === chosen),
          );
          if (!stillPossible) delete next[option.name];
        }

        return next;
      });
    },
    [product, activeVariants],
  );

  const isComplete = Boolean(
    product && product.options.every((option) => Boolean(selected[option.name])),
  );

  return {
    selected,
    variant,
    isComplete: product?.options.length ? isComplete : true,
    optionValues,
    select,
    price: variant?.price ?? product?.price ?? 0,
    compareAtPrice: variant?.compareAtPrice ?? product?.compareAtPrice,
    availableStock: variant ? variant.stock.available : (product?.totalStock ?? 0),
    sku: variant?.sku ?? product?.sku ?? '',
  };
}

/**
 * Preselect the first in-stock variant.
 *
 * Landing on a page with nothing chosen means the price shown is a range and the
 * buy button is disabled — an unnecessary step when a sensible default exists.
 * Preferring an in-stock variant avoids opening on "Out of stock".
 */
function pickInitialSelection(product: ProductDetail): Record<string, string> {
  if (!product.options.length) return {};

  const active = product.variants.filter((variant) => variant.isActive);
  const preferred = active.find((variant) => variant.stock.available > 0) ?? active[0];
  if (!preferred) return {};

  return Object.fromEntries(preferred.optionValues.map((option) => [option.name, option.value]));
}
