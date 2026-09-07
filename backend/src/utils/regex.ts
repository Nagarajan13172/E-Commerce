/**
 * Escape every regex metacharacter in a user-supplied search term.
 *
 * Interpolating raw input into a `$regex` is a real vulnerability, not a
 * cosmetic one: `.*` quietly matches the whole collection, `(a+)+$` is a
 * catastrophic-backtracking denial of service, and an unbalanced `[` throws,
 * turning a search box into a 500.
 *
 * This lives in one place on purpose. It was previously reimplemented in three
 * services with the same character class copied by hand — the kind of
 * duplication where one copy eventually gets edited and the others silently
 * rot.
 */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
