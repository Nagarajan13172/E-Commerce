import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'aurora.recentlyViewed';
const MAX_ITEMS = 8;

export interface RecentlyViewedEntry {
  slug: string;
  name: string;
  thumbnail?: string;
  price: number;
  viewedAt: number;
}

/**
 * Recently-viewed products, kept in localStorage.
 *
 * Deliberately client-side and per-device. This is a browsing convenience, not
 * account data: sending every product view to the server would mean a write on
 * every page load and would tie a behavioural trail to the account for a feature
 * nobody expects to be portable.
 *
 * Every access is wrapped because storage does not merely return null when
 * disabled — it throws.
 */
function read(): RecentlyViewedEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as RecentlyViewedEntry[]) : [];
  } catch {
    return [];
  }
}

export function useRecentlyViewed() {
  const [items, setItems] = useState<RecentlyViewedEntry[]>([]);

  useEffect(() => {
    setItems(read());
  }, []);

  const record = useCallback((entry: Omit<RecentlyViewedEntry, 'viewedAt'>) => {
    try {
      const existing = read().filter((item) => item.slug !== entry.slug);
      const next = [{ ...entry, viewedAt: Date.now() }, ...existing].slice(0, MAX_ITEMS);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setItems(next);
    } catch {
      // Storage unavailable — the feature simply does nothing.
    }
  }, []);

  return { items, record };
}
