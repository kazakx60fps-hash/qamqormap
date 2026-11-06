import type { StyleProp, ViewStyle } from 'react-native';
import type { DisasterEvent, MapConfig, RequestItem } from '../lib/types';

export type MapReport = { id: number; lat: number; lng: number; type_code: string; type_color?: string; mine?: boolean; title?: string };

export type MapHandle = {
  /** Бүкіл Қазақстанды көрсету */
  kz: () => void;
  zoom: (dir: 1 | -1) => void;
  focus: (lat: number, lng: number, zoom?: number) => void;
  setView: (center: [number, number], zoom: number, animate?: boolean) => void;
  fit: () => void;
  invalidate: () => void;
};

export type MapProps = {
  requests?: RequestItem[];
  events?: DisasterEvent[];
  /** Тексерілмеген хабарламалар (тек автор мен координаторға) */
  reports?: MapReport[];
  /** Офлайн демо карта үшін қалалар (тайлдар жүктелмесе көрсетіледі) */
  cities?: { lat: number; lng: number; name: string; major: boolean }[];
  selectedKey?: string | null;
  initialView: { center: [number, number]; zoom: number };
  tiles: MapConfig | null;
  demoLabel: string;
  fitOnData?: boolean;
  pick?: { enabled: boolean; lat?: number | null; lng?: number | null };
  bottomInset?: number;
  topInset?: number;
  onSelect?: (kind: 'request' | 'event' | 'report', id: number) => void;
  onPick?: (lat: number, lng: number) => void;
  onTap?: () => void;
  onTilesFailed?: () => void;
  onReady?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
};

export const OSM_DEFAULT: MapConfig = {
  tilesUrl: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '© OpenStreetMap',
  maxZoom: 19,
};

/** Картаға тек қажет жария өрістер жіберіледі (жеке деректер ешқашан картаға түспейді) */
export function mapPayload(requests: RequestItem[] = [], events: DisasterEvent[] = [], reports: MapReport[] = []) {
  return {
    requests: requests.filter((r) => r.approx_lat != null).map((r) => ({
      id: r.id, title: r.title, approx_lat: r.approx_lat, approx_lng: r.approx_lng, category_code: r.category_code,
      category_color: r.category_color, status: r.status, urgency: r.urgency, direction: r.direction,
    })),
    events: events.map((e) => ({
      id: e.id, title: e.title, lat: e.lat, lng: e.lng, radius_km: e.radius_km, type_code: e.type_code, type_color: e.type_color,
      activity_status: e.activity_status, verification_status: e.verification_status, is_demo: e.is_demo,
    })),
    reports: reports.filter((r) => r.lat != null && r.lng != null),
  };
}

/** OSM атрибуциясынан HTML белгілерін алып тастау (Leaflet өзі көрсетеді) */
export const plainAttribution = (s: string) => s.replace(/<[^>]+>/g, '').replace('&copy;', '©');
