// Анықтамалықтар: барлық қала, облыстар, санаттар, апат түрлері — сайттағыдай серверден жүктеледі.
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from './api';
import type { Category, City, DisasterGroup, DisasterType, MapConfig, Region } from './types';

type Meta = {
  status: 'loading' | 'ready' | 'error';
  error: unknown;
  cities: City[];
  citiesById: Map<number, City>;
  regions: Region[];
  regionsByCode: Map<string, Region>;
  categories: Category[];
  categoriesById: Map<number, Category>;
  categoriesByCode: Map<string, Category>;
  disasterTypes: DisasterType[];
  /** Оқиғалар картасының сүзгі топтары (өрт, су тасқыны, жер сілкінісі, авария, басқа) */
  disasterGroups: DisasterGroup[];
  mapConfig: MapConfig | null;
  reload: () => void;
  refreshCounts: () => void;
};

const MetaCtx = createContext<Meta | null>(null);

export function MetaProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Meta['status']>('loading');
  const [error, setError] = useState<unknown>(null);
  const [cities, setCities] = useState<City[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [disasterTypes, setTypes] = useState<DisasterType[]>([]);
  const [disasterGroups, setGroups] = useState<DisasterGroup[]>([]);
  const [mapConfig, setMapConfig] = useState<MapConfig | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const [c, r, cat, dt, mc] = await Promise.all([
        api<{ items: City[] }>('/cities'),
        api<{ items: Region[] }>('/regions'),
        api<{ items: Category[] }>('/categories'),
        api<{ items: DisasterType[]; groups?: DisasterGroup[] }>('/disaster-types'),
        api<MapConfig>('/map-config').catch(() => null),
      ]);
      setCities(c.items);
      setRegions(r.items);
      setCategories(cat.items);
      setTypes(dt.items);
      setGroups(dt.groups ?? []);
      setMapConfig(mc);
      setStatus('ready');
    } catch (e) {
      setError(e);
      setStatus('error');
    }
  }, []);

  const refreshCounts = useCallback(() => {
    api<{ items: City[] }>('/cities').then((c) => setCities(c.items)).catch(() => {});
  }, []);

  useEffect(() => { load(); }, [load]);

  const value = useMemo<Meta>(() => ({
    status, error, cities, regions, categories, disasterTypes, disasterGroups, mapConfig,
    citiesById: new Map(cities.map((c) => [c.id, c])),
    regionsByCode: new Map(regions.map((r) => [r.code, r])),
    categoriesById: new Map(categories.map((c) => [c.id, c])),
    categoriesByCode: new Map(categories.map((c) => [c.code, c])),
    reload: load,
    refreshCounts,
  }), [status, error, cities, regions, categories, disasterTypes, disasterGroups, mapConfig, load, refreshCounts]);

  return <MetaCtx.Provider value={value}>{children}</MetaCtx.Provider>;
}

export function useMeta() {
  const c = useContext(MetaCtx);
  if (!c) throw new Error('MetaProvider жоқ');
  return c;
}
