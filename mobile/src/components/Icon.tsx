import { SvgXml } from 'react-native-svg';
import { ICONS, CATEGORY_ICON, DISASTER_ICON } from '../shared/icons.js';

const SVG = (inner: string, stroke = 2) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;

// Мобильді қосымшаға ғана керек қосымша иконкалар (сол сызықтық стильде)
const EXTRA: Record<string, string> = {
  minus: '<path d="M5 12h14"/>',
  login: '<path d="M10 4h8.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H10M4 12h11M11 8l4 4-4 4"/>',
  camera: '<path d="M4 8.5A1.5 1.5 0 0 1 5.5 7H8l1.5-2.5h5L16 7h2.5A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5Z"/><circle cx="12" cy="13" r="3.5"/>',
};

export type IconName = keyof typeof ICONS | string;

export function Icon({ name, size = 22, color = '#13203F', stroke = 2 }: { name: IconName; size?: number; color?: string; stroke?: number }) {
  const inner = (ICONS as Record<string, string>)[name] ?? EXTRA[name] ?? ICONS.info;
  return <SvgXml xml={SVG(inner, stroke)} width={size} height={size} color={color} />;
}

export const categoryIcon = (code?: string | null) => (code && (CATEGORY_ICON as Record<string, string>)[code]) || 'heart';
export const disasterIcon = (code?: string | null) => (code && (DISASTER_ICON as Record<string, string>)[code]) || 'alert';
