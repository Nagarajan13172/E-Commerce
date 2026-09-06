import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind classes with correct conflict resolution.
 *
 * `clsx` handles conditionals; `twMerge` makes later classes win over earlier
 * ones in the same category, so a caller's `className="p-8"` actually overrides
 * a component's default `p-4` instead of both landing in the class list and
 * letting source order decide.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
