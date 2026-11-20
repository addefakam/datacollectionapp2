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
const FALLBACK: CachedSettings = {
  subCities: locationData.subCities.map((sc, i) => ({
    id: `default-${i}`,
    name: sc.name,
    areas: sc.areas,
  })),
  categories: SECTORS.map((s, i) => ({ id: `default-${i}`, name: s })),
};

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

      if (scRes.ok && catRes.ok) {
        const scData = await scRes.json();
        const catData = await catRes.json();
        const nextSubCities: SubCityData[] = Array.isArray(scData.subCities)
          ? scData.subCities
          : FALLBACK.subCities;
        const nextCategories: CategoryData[] = Array.isArray(catData.categories)
          ? catData.categories
          : FALLBACK.categories;

        setSubCities(nextSubCities);
        setCategories(nextCategories);
        try {
          localStorage.setItem(
            CACHE_KEY,
            JSON.stringify({ subCities: nextSubCities, categories: nextCategories })
          );
        } catch {
          // storage full — non-fatal
        }
      } else if (scRes.status === 401 || catRes.status === 401) {
        // Session expired — keep whatever we have (cached or defaults)
        loadFromCache();
      } else {
        // Server error / offline — fall back to cache, then defaults
        if (!loadFromCache()) {
          setSubCities(FALLBACK.subCities);
          setCategories(FALLBACK.categories);
        }
      }
    } catch {
      // Network error / offline — fall back to cache, then defaults
      if (!loadFromCache()) {
        setSubCities(FALLBACK.subCities);
        setCategories(FALLBACK.categories);
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
