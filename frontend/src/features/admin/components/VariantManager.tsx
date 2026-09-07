import { useState } from 'react';
import { Plus, Sparkles, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

export interface ProductOption {
  name: string;
  values: string[];
  position: number;
}

export interface ProductVariant {
  _id?: string;
  sku: string;
  optionValues: { name: string; value: string }[];
  price: number;
  compareAtPrice?: number;
  stock: { available: number; lowStockThreshold: number };
  images: string[];
  barcode?: string;
  isActive: boolean;
}

interface VariantManagerProps {
  options: ProductOption[];
  variants: ProductVariant[];
  basePrice: number;
  baseCompareAtPrice?: number;
  baseSku: string;
  onOptionsChange: (options: ProductOption[]) => void;
  onVariantsChange: (variants: ProductVariant[]) => void;
}

/**
 * Option axes and the variants they produce.
 *
 * Options are the axes ("Colour", "Size"); variants are the sellable
 * combinations. The server enforces that every variant carries a value for
 * every declared option — a variant that does not is unresolvable by the
 * storefront's picker — so this generates the full cross product rather than
 * letting rows be added by hand and drift out of shape.
 *
 * Generating **preserves existing rows** by matching on their option values.
 * Regenerating after adding a size must not reset the prices and stock levels
 * already entered for the others, and must certainly not orphan a variant that
 * currently holds reserved stock.
 */
export function VariantManager({
  options,
  variants,
  basePrice,
  baseCompareAtPrice,
  baseSku,
  onOptionsChange,
  onVariantsChange,
}: VariantManagerProps) {
  const [newOptionName, setNewOptionName] = useState('');
  const [valueDrafts, setValueDrafts] = useState<Record<number, string>>({});

  const addOption = () => {
    const name = newOptionName.trim();
    if (!name) return;
    if (options.some((o) => o.name.toLowerCase() === name.toLowerCase())) {
      toast.error(`There is already an option called ${name}`);
      return;
    }
    if (options.length >= 4) {
      toast.error('A product may have at most 4 option axes');
      return;
    }
    onOptionsChange([...options, { name, values: [], position: options.length }]);
    setNewOptionName('');
  };

  const addValue = (index: number) => {
    const value = (valueDrafts[index] ?? '').trim();
    if (!value) return;
    const option = options[index]!;
    if (option.values.some((v) => v.toLowerCase() === value.toLowerCase())) return;
    onOptionsChange(
      options.map((o, i) => (i === index ? { ...o, values: [...o.values, value] } : o)),
    );
    setValueDrafts((current) => ({ ...current, [index]: '' }));
  };

  const removeValue = (optionIndex: number, value: string) => {
    onOptionsChange(
      options.map((o, i) =>
        i === optionIndex ? { ...o, values: o.values.filter((v) => v !== value) } : o,
      ),
    );
  };

  const removeOption = (index: number) => {
    onOptionsChange(options.filter((_, i) => i !== index).map((o, i) => ({ ...o, position: i })));
  };

  /** Cartesian product of every option's values. */
  const generate = () => {
    const usable = options.filter((o) => o.values.length > 0);
    if (usable.length === 0) {
      toast.error('Add at least one option with values first');
      return;
    }

    let combinations: { name: string; value: string }[][] = [[]];
    for (const option of usable) {
      combinations = combinations.flatMap((partial) =>
        option.values.map((value) => [...partial, { name: option.name, value }]),
      );
    }

    if (combinations.length > 100) {
      toast.error(`That would make ${combinations.length} variants; the limit is 100`);
      return;
    }

    // Match by option values, so regenerating keeps prices, stock and — most
    // importantly — the `_id` of a variant that may hold reserved stock.
    const keyOf = (values: { name: string; value: string }[]) =>
      [...values]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((v) => `${v.name}=${v.value}`)
        .join('|');
    const existing = new Map(variants.map((v) => [keyOf(v.optionValues), v]));

    const next = combinations.map((optionValues) => {
      const kept = existing.get(keyOf(optionValues));
      if (kept) return { ...kept, optionValues };

      const suffix = optionValues
        .map((v) => v.value.toUpperCase().replace(/[^A-Z0-9]+/g, ''))
        .join('-');

      return {
        sku: `${baseSku || 'SKU'}-${suffix}`.slice(0, 48),
        optionValues,
        // Seeded from the product's own pricing, including compare-at. Once a
        // product has variants the rollups are computed from THEM, so a
        // compare-at set on the Pricing tab and not carried down here would
        // silently yield a 0% discount and no sale badge.
        price: basePrice,
        compareAtPrice: baseCompareAtPrice,
        stock: { available: 0, lowStockThreshold: 5 },
        images: [],
        isActive: true,
      } satisfies ProductVariant;
    });

    const dropped =
      variants.length - next.filter((v) => existing.has(keyOf(v.optionValues))).length;
    onVariantsChange(next);
    toast.success(
      dropped > 0
        ? `${next.length} variants — ${dropped} no longer match the options and were removed`
        : `${next.length} variants ready`,
    );
  };

  const updateVariant = (index: number, patch: Partial<ProductVariant>) => {
    onVariantsChange(variants.map((v, i) => (i === index ? { ...v, ...patch } : v)));
  };

  return (
    <div className="space-y-6">
      <section className="space-y-4">
        <div>
          <h3 className="text-sm font-medium">Options</h3>
          <p className="text-muted-foreground text-xs">
            The axes a customer chooses along — Colour, Size, Storage. Leave this empty for a
            product sold as a single item.
          </p>
        </div>

        {options.map((option, index) => (
          <div key={option.name} className="rounded-lg border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium">{option.name}</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeOption(index)}>
                <Trash2 className="size-4" aria-hidden="true" />
                <span className="sr-only">Remove the {option.name} option</span>
              </Button>
            </div>

            <div className="mb-2 flex flex-wrap gap-1.5">
              {option.values.map((value) => (
                <Badge key={value} variant="secondary" className="gap-1">
                  {value}
                  <button
                    type="button"
                    onClick={() => removeValue(index, value)}
                    className="hover:text-destructive"
                  >
                    <X className="size-3" aria-hidden="true" />
                    <span className="sr-only">
                      Remove {value} from {option.name}
                    </span>
                  </button>
                </Badge>
              ))}
              {option.values.length === 0 && (
                <span className="text-muted-foreground text-xs">No values yet</span>
              )}
            </div>

            <div className="flex gap-2">
              <Input
                value={valueDrafts[index] ?? ''}
                onChange={(event) =>
                  setValueDrafts((current) => ({ ...current, [index]: event.target.value }))
                }
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    addValue(index);
                  }
                }}
                placeholder={`Add a ${option.name.toLowerCase()} value`}
                aria-label={`Add a value to ${option.name}`}
                className="h-8"
              />
              {/* The visible label is just "Add" — short, and unambiguous
                  beside its own input. With several options on screen a screen
                  reader would otherwise announce "Add, button" repeatedly with
                  nothing to tell them apart, so the accessible name carries the
                  option. */}
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label={`Add value to ${option.name}`}
                onClick={() => addValue(index)}
              >
                Add
              </Button>
            </div>
          </div>
        ))}

        <div className="flex gap-2">
          <Input
            value={newOptionName}
            onChange={(event) => setNewOptionName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                addOption();
              }
            }}
            placeholder="New option name, e.g. Colour"
            aria-label="New option name"
          />
          <Button type="button" variant="outline" onClick={addOption}>
            <Plus className="size-4" aria-hidden="true" />
            Add option
          </Button>
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">Variants</h3>
            <p className="text-muted-foreground text-xs">
              {variants.length === 0
                ? 'Generate the combinations once the options are set.'
                : `${variants.length} sellable combination${variants.length === 1 ? '' : 's'}`}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={generate}>
            <Sparkles className="size-4" aria-hidden="true" />
            Generate from options
          </Button>
        </div>

        {variants.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="px-3 py-2 font-medium">Variant</th>
                  <th className="px-3 py-2 font-medium">SKU</th>
                  <th className="px-3 py-2 text-right font-medium">Price</th>
                  <th className="px-3 py-2 text-right font-medium">Stock</th>
                  <th className="px-3 py-2 text-right font-medium">Low at</th>
                </tr>
              </thead>
              <tbody>
                {variants.map((variant, index) => (
                  <tr
                    key={variant._id ?? variant.optionValues.map((v) => v.value).join('-')}
                    className="border-t"
                  >
                    <td className="px-3 py-2 whitespace-nowrap">
                      {variant.optionValues.map((v) => v.value).join(' · ')}
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        value={variant.sku}
                        onChange={(event) => updateVariant(index, { sku: event.target.value })}
                        aria-label={`SKU for ${variant.optionValues.map((v) => v.value).join(' ')}`}
                        className="h-8 min-w-36 font-mono text-xs"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        step="0.01"
                        value={variant.price}
                        onChange={(event) =>
                          updateVariant(index, { price: Number(event.target.value) })
                        }
                        aria-label={`Price for ${variant.optionValues.map((v) => v.value).join(' ')}`}
                        className="h-8 w-24 text-right"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        value={variant.stock.available}
                        onChange={(event) =>
                          updateVariant(index, {
                            stock: { ...variant.stock, available: Number(event.target.value) },
                          })
                        }
                        aria-label={`Stock for ${variant.optionValues.map((v) => v.value).join(' ')}`}
                        className="h-8 w-20 text-right"
                        // Editing stock here only applies to a NEW variant. For
                        // one that already exists the inventory endpoints own
                        // the number, because they write a ledger entry and keep
                        // `reserved` consistent.
                        disabled={Boolean(variant._id)}
                        title={variant._id ? 'Adjust existing stock from Inventory' : undefined}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <Input
                        type="number"
                        value={variant.stock.lowStockThreshold}
                        onChange={(event) =>
                          updateVariant(index, {
                            stock: {
                              ...variant.stock,
                              lowStockThreshold: Number(event.target.value),
                            },
                          })
                        }
                        aria-label={`Low stock threshold for ${variant.optionValues.map((v) => v.value).join(' ')}`}
                        className="h-8 w-20 text-right"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {variants.some((v) => v._id) && (
          <p className="text-muted-foreground text-xs">
            Stock for existing variants is adjusted from Inventory, so every change leaves a ledger
            entry and cannot desynchronise reserved units.
          </p>
        )}
      </section>
    </div>
  );
}
