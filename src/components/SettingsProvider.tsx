'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { locationData, SECTORS } from '@/lib/location-data';

export interface SubCityData {
  id: string;
  name: string;
  areas: string[];
}

export interface CategoryData {
  id: string;
  name: string;
}

interface CachedSettings {
  subCities: SubCityData[];
  categories: CategoryData[];
}

interface SettingsContextValue extends CachedSettings {
  loading: boolean;
  /** Industry category names — convenience for form dropdowns. */
  sectors: string[];
  /** Areas for a sub-city name (empty string-safe). */
  areasFor: (subCityName: string) => string[];
  /** Reload lists from the server (e.g. after admin edits). */
  reload: () => Promise<void>;
}

const CACHE_KEY = 'app_settings_cache_v2';

// Hardcoded defaults — used before the first fetch resolves and whenever the
// network is unavailable with no cached copy (e.g. first-ever offline visit).
// Their ids ("default-N") are NOT real database ids, so lists shown from them
// must never be used for edits (PUT/DELETE would 404).
const FALLBACK: CachedSettings = {
  subCities: locationData.subCities.map((sc, i) => ({
    id: `default-${i}`,
    name: sc.name,
    areas: sc.areas,
  })),
  categories: SECTORS.map((s, i) => ({ id: `default-${i}`, name: s })),
};

/** True when a list is empty or still comes from the hardcoded defaults. */
function isFallbackList(list: SubCityData[]): boolean {
  return list.length === 0 || list.some((s) => s.id.startsWith('default-'));
}

/** Merges freshly fetched lists into the settings cache without losing the other list. */
function persistCache(subCities: SubCityData[] | null, categories: CategoryData[] | null): void {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    const cached = raw ? (JSON.parse(raw) as Partial<CachedSettings>) : {};
    const next: CachedSettings = {
      subCities: subCities ?? cached.subCities ?? FALLBACK.subCities,
      categories: categories ?? cached.categories ?? FALLBACK.categories,
    };
    localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch {
    // storage full or corrupted — non-fatal
  }
}

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [subCities, setSubCities] = useState<SubCityData[]>(FALLBACK.subCities);
  const [categories, setCategories] = useState<CategoryData[]>(FALLBACK.categories);
  const [loading, setLoading] = useState(true);

  const loadFromCache = useCallback(() => {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return false;
      const cached = JSON.parse(raw) as CachedSettings;
      if (Array.isArray(cached.subCities) && cached.subCities.length > 0) {
        setSubCities(cached.subCities);
        setCategories(
          Array.isArray(cached.categories) && cached.categories.length > 0
            ? cached.categories
            : FALLBACK.categories
        );
        return true;
      }
    } catch {
      // corrupted cache — ignore
    }
    return false;
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [scRes, catRes] = await Promise.all([
        fetch('/api/sub-cities', { cache: 'no-store' }),
        fetch('/api/industry-categories', { cache: 'no-store' }),
      ]);

      // Parse each response independently — a failure in one list (e.g. the
      // categories endpoint erroring) must NOT throw away the other list.
      let nextSubCities: SubCityData[] | null = null;
      let nextCategories: CategoryData[] | null = null;

      if (scRes.ok) {
        try {
          const scData = await scRes.json();
          if (Array.isArray(scData.subCities) && scData.subCities.length > 0) {
            nextSubCities = scData.subCities;
            setSubCities(nextSubCities);
          }
        } catch {
          // malformed body — treat as failed
        }
      }
      if (catRes.ok) {
        try {
          const catData = await catRes.json();
          if (Array.isArray(catData.categories) && catData.categories.length > 0) {
            nextCategories = catData.categories;
            setCategories(nextCategories);
          }
        } catch {
          // malformed body — treat as failed
        }
      }

      if (nextSubCities || nextCategories) {
        // At least one list refreshed — cache what we have (successful lists
        // replace their cache entry, the other one keeps its cached copy).
        persistCache(nextSubCities, nextCategories);
      } else if (scRes.status === 401 || catRes.status === 401) {
        // Session expired — keep whatever we have (cached or defaults)
        loadFromCache();
      } else {
        // Both failed (server error / offline) — refresh from cache, but never
        // overwrite server-backed data with the hardcoded defaults, otherwise
        // edit dialogs would show fake ids and saves would 404.
        if (!loadFromCache()) {
          setSubCities((cur) => (isFallbackList(cur) ? FALLBACK.subCities : cur));
          setCategories((cur) =>
            cur.length === 0 || cur.some((c) => c.id.startsWith('default-'))
              ? FALLBACK.categories
              : cur
          );
        }
      }
    } catch {
      // Network error / offline — same policy as both requests failing
      if (!loadFromCache()) {
        setSubCities((cur) => (isFallbackList(cur) ? FALLBACK.subCities : cur));
        setCategories((cur) =>
          cur.length === 0 || cur.some((c) => c.id.startsWith('default-'))
            ? FALLBACK.categories
            : cur
        );
      }
    } finally {
      setLoading(false);
    }
  }, [loadFromCache]);

  useEffect(() => {
    // Instant paint from cache, then refresh from the server
    loadFromCache();
    reload();
  }, [loadFromCache, reload]);

  const sectors = useMemo(() => categories.map((c) => c.name), [categories]);

  const areasFor = useCallback(
    (subCityName: string) => subCities.find((sc) => sc.name === subCityName)?.areas ?? [],
    [subCities]
  );

  const value = useMemo(
    () => ({ subCities, categories, sectors, loading, areasFor, reload }),
    [subCities, categories, sectors, loading, areasFor, reload]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return ctx;
}
