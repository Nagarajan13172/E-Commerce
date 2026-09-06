import slugify from 'slugify';

/**
 * URL slugs.
 *
 * Slugs are part of the public URL and of the SEO surface, so they must be
 * stable, readable and unique. `strict` drops characters that would need
 * percent-encoding; `locale: 'en'` gives predictable transliteration.
 */
export function toSlug(value: string): string {
  return slugify(value, {
    lower: true,
    strict: true,
    trim: true,
    locale: 'en',
  }).slice(0, 120);
}

/**
 * A slug that is not already taken, suffixing `-2`, `-3`, … as needed.
 *
 * `excludeId` matters on update: without it, editing a product without changing
 * its name would see its own slug as a collision and rename it to `name-2`,
 * silently breaking every existing link to that page.
 *
 * This is a convenience, not the uniqueness guarantee — the unique index is.
 * Under concurrency the insert can still lose a race, which the duplicate-key
 * handler turns into a clean 409.
 */
interface SlugCheckable {
  exists(filter: Record<string, unknown>): { then: Promise<unknown>['then'] };
}

export async function uniqueSlug(
  model: SlugCheckable,
  desired: string,
  excludeId?: string,
): Promise<string> {
  const base = toSlug(desired) || 'item';
  let candidate = base;

  for (let suffix = 2; suffix < 100; suffix += 1) {
    const filter: Record<string, unknown> = { slug: candidate };
    if (excludeId) filter._id = { $ne: excludeId };

    const clash = await model.exists(filter);
    if (!clash) return candidate;

    candidate = `${base}-${suffix}`;
  }

  // Astronomically unlikely; a timestamp guarantees progress rather than looping.
  return `${base}-${Date.now().toString(36)}`;
}
