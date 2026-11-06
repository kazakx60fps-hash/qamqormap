// Таңдалған қала және карта/тізім сүзгілері. Қала құрылғыда сақталады;
// тіл ауысқанда бұл күй өзгермейді (React күйі сақталады).
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

export type Direction = 'all' | 'everyday' | 'disaster';
export type Filters = {
  direction: Direction;
  categoryId: number | null;
  urgency: 'low' | 'normal' | 'high' | null;
  status: 'active' | 'open' | 'progress' | 'completed' | 'all';
  activity: 'active' | 'resolved' | null;
  verification: 'verified' | 'unverified' | null;
  disasterType: string | null;
  region: string | null;
  q: string;
  eventId: number | null;
};

export const DEFAULT_FILTERS: Filters = {
  direction: 'all', categoryId: null, urgency: null, status: 'active', activity: 'active',
  verification: null, disasterType: null, region: null, q: '', eventId: null,
};

type Ctx = {
  cityId: number | null; // null — «Бүкіл Қазақстан»
  setCityId: (id: number | null) => void;
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;
  resetFilters: () => void;
  activeFilterCount: number;
};

const FCtx = createContext<Ctx | null>(null);
const CITY_KEY = 'qm_city';

export function FiltersProvider({ children }: { children: React.ReactNode }) {
  const [cityId, setCity] = useState<number | null>(1);
  const [filters, setF] = useState<Filters>(DEFAULT_FILTERS);
  useEffect(() => {
    AsyncStorage.getItem(CITY_KEY).then((v) => {
      if (v === 'all') setCity(null);
      else if (v && Number(v)) setCity(Number(v));
    }).catch(() => {});
  }, []);
  const setCityId = useCallback((id: number | null) => {
    setCity(id);
    setF((f) => ({ ...f, region: null, eventId: null }));
    AsyncStorage.setItem(CITY_KEY, id ? String(id) : 'all').catch(() => {});
  }, []);
  const setFilters = useCallback((p: Partial<Filters>) => setF((f) => ({ ...f, ...p })), []);
  const resetFilters = useCallback(() => setF((f) => ({ ...DEFAULT_FILTERS, direction: f.direction })), []);
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.categoryId) n++;
    if (filters.urgency) n++;
    if (filters.status !== 'active') n++;
    if (filters.activity !== 'active') n++;
    if (filters.verification) n++;
    if (filters.disasterType) n++;
    if (filters.region) n++;
    if (filters.eventId) n++;
    return n;
  }, [filters]);
  const value = useMemo(() => ({ cityId, setCityId, filters, setFilters, resetFilters, activeFilterCount }),
    [cityId, setCityId, filters, setFilters, resetFilters, activeFilterCount]);
  return <FCtx.Provider value={value}>{children}</FCtx.Provider>;
}

export function useFilters() {
  const c = useContext(FCtx);
  if (!c) throw new Error('FiltersProvider жоқ');
  return c;
}
