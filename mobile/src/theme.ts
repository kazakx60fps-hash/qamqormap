// QamqorMap мобильді дизайн жүйесі: түстер, өлшемдер, радиустар, көлеңкелер.
// Ашық фон, қою көк мәтін, көк-күлгін екпін; табиғи апаттар — қызғылт сары (орандж).
import { Platform, type TextStyle, type ViewStyle } from 'react-native';

export const C = {
  bg: '#F5F6FB',
  surface: '#FFFFFF',
  surface2: '#EFF1F8',
  border: '#E1E5F0',
  borderStrong: '#C9D0E0',
  ink: '#13203F',
  ink2: '#36446A',
  muted: '#5A6688',
  subtle: '#8792AE',
  primary: '#2F56F0',
  primaryDark: '#1D3FC7',
  primary50: '#ECF0FF',
  primary100: '#DAE2FF',
  violet: '#6B4EF0',
  violet50: '#F0ECFF',
  disaster: '#E8590C',
  disasterDark: '#B9450A',
  disaster50: '#FFF1E7',
  disaster100: '#FFE0C8',
  green: '#12804A',
  green50: '#E6F6EC',
  amber: '#9A6200',
  amber50: '#FDF3DF',
  red: '#C62F3B',
  red50: '#FCEBEC',
  white: '#FFFFFF',
  overlay: 'rgba(19,32,63,0.45)',
  demo: '#7A4B00',
  demo50: '#FFF6D9',
} as const;

/** Орындалу мәртебесінің түсі (түс әрқашан мәтінмен бірге көрсетіледі) */
export const STATUS_COLOR: Record<string, { fg: string; bg: string }> = {
  open: { fg: C.primaryDark, bg: C.primary50 },
  assigned: { fg: C.violet, bg: C.violet50 },
  in_progress: { fg: C.amber, bg: C.amber50 },
  awaiting_confirmation: { fg: '#B43D14', bg: '#FFEDE5' },
  completed: { fg: C.green, bg: C.green50 },
  cancelled: { fg: C.muted, bg: C.surface2 },
};
export const MODERATION_COLOR: Record<string, { fg: string; bg: string }> = {
  draft: { fg: C.muted, bg: C.surface2 },
  pending: { fg: C.amber, bg: C.amber50 },
  approved: { fg: C.green, bg: C.green50 },
  rejected: { fg: C.red, bg: C.red50 },
};

export const S = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32 } as const;
export const R = { sm: 8, md: 12, lg: 16, xl: 22, pill: 999 } as const;

/** Ең кіші басу аймағы (WCAG / Material: 48dp, iOS: 44pt) */
export const HIT = 48;

// Қазақ әріптері толық болуы үшін жүйелік шрифт қолданылады (Roboto / San Francisco).
export const F: Record<'h1' | 'h2' | 'h3' | 'lg' | 'md' | 'sm' | 'xs', TextStyle> = {
  h1: { fontSize: 26, lineHeight: 32, fontWeight: '800', letterSpacing: -0.4 },
  h2: { fontSize: 21, lineHeight: 27, fontWeight: '800', letterSpacing: -0.2 },
  h3: { fontSize: 18, lineHeight: 24, fontWeight: '700' },
  lg: { fontSize: 17, lineHeight: 24, fontWeight: '500' },
  md: { fontSize: 16, lineHeight: 23, fontWeight: '400' },
  sm: { fontSize: 14.5, lineHeight: 20, fontWeight: '500' },
  xs: { fontSize: 13, lineHeight: 17, fontWeight: '600' },
};

export const shadow = (level: 1 | 2 | 3 = 1): ViewStyle =>
  Platform.select<ViewStyle>({
    web: { boxShadow: ['0 1px 3px rgba(19,32,63,.08)', '0 6px 18px rgba(19,32,63,.12)', '0 -8px 28px rgba(19,32,63,.16)'][level - 1] } as ViewStyle,
    android: { elevation: [2, 6, 14][level - 1] },
    default: {
      shadowColor: '#13203F',
      shadowOpacity: [0.08, 0.12, 0.16][level - 1],
      shadowRadius: [3, 10, 18][level - 1],
      shadowOffset: { width: 0, height: level === 3 ? -6 : [1, 4][level - 1] },
    },
  }) as ViewStyle;
