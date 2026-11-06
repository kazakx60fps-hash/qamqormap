// Көмек санаттарының анықтамалығы. code — тұрақты кілт (frontend оны kk/ru/en тілдеріне аударады).
// direction: everyday — күнделікті көмек, disaster — табиғи апатқа байланысты көмек.
export const CATEGORIES = [
  { code: 'food', name_kk: 'Азық-түлік жеткізу', short_kk: 'Азық-түлік', color: '#FF7856', icon: 'basket', sort: 1, direction: 'everyday' },
  { code: 'clothes', name_kk: 'Киім және тұрмыстық заттар', short_kk: 'Киім, заттар', color: '#8B5CF6', icon: 'shirt', sort: 2, direction: 'everyday' },
  { code: 'transport', name_kk: 'Тасымалдауға көмек', short_kk: 'Тасымал', color: '#2457F5', icon: 'truck', sort: 3, direction: 'everyday' },
  { code: 'household', name_kk: 'Үйдегі тұрмыстық көмек', short_kk: 'Тұрмыстық', color: '#0EA5A4', icon: 'home', sort: 4, direction: 'everyday' },
  { code: 'community', name_kk: 'Қоғамдық бастама', short_kk: 'Бастама', color: '#E0A100', icon: 'people', sort: 5, direction: 'everyday' },
  // Табиғи апаттар бағыты
  { code: 'evacuation', name_kk: 'Эвакуацияға және тасымалға көмек', short_kk: 'Эвакуация', color: '#C2410C', icon: 'truck', sort: 11, direction: 'disaster' },
  { code: 'shelter', name_kk: 'Уақытша баспана', short_kk: 'Баспана', color: '#7C3AED', icon: 'bed', sort: 12, direction: 'disaster' },
  { code: 'water_food', name_kk: 'Су және азық-түлік жеткізу', short_kk: 'Су, азық', color: '#0284C7', icon: 'droplet', sort: 13, direction: 'disaster' },
  { code: 'essentials', name_kk: 'Киім және қажетті заттар', short_kk: 'Қажетті заттар', color: '#BE185D', icon: 'shirt', sort: 14, direction: 'disaster' },
  { code: 'safe_place', name_kk: 'Қолжетімді қауіпсіз орын табуға көмек', short_kk: 'Қауіпсіз орын', color: '#15803D', icon: 'compass', sort: 15, direction: 'disaster' },
  { code: 'volunteer_support', name_kk: 'Еріктілер көмегін ұйымдастыру', short_kk: 'Еріктілер', color: '#B45309', icon: 'people', sort: 16, direction: 'disaster' },
];

// Табиғи апат түрлері. code — тұрақты кілт.
export const DISASTER_TYPES = [
  { code: 'flood', color: '#2563EB', icon: 'waves', sort: 1 },
  { code: 'earthquake', color: '#7C3AED', icon: 'quake', sort: 2 },
  { code: 'wildfire', color: '#DC2626', icon: 'flame', sort: 3 },
  { code: 'mudflow', color: '#92400E', icon: 'mudflow', sort: 4 },
  { code: 'landslide', color: '#A16207', icon: 'landslide', sort: 5 },
  { code: 'avalanche', color: '#0891B2', icon: 'mountain', sort: 6 },
  { code: 'blizzard', color: '#475569', icon: 'wind', sort: 7 },
  { code: 'drought_heat', color: '#EA580C', icon: 'sun', sort: 8 },
  // Табиғи емес оқиғалар (миграция 006): картада бөлек сүзгімен көрсетіледі
  { code: 'fire', color: '#B91C1C', icon: 'flame', sort: 9, kind: 'incident' },
  { code: 'accident', color: '#334155', icon: 'car', sort: 10, kind: 'incident' },
  { code: 'incident_other', color: '#64748B', icon: 'alert', sort: 11, kind: 'incident' },
];
for (const d of DISASTER_TYPES) d.kind ||= 'natural';

/**
 * Оқиғалар картасындағы сүзгі топтары: әр топ бір немесе бірнеше түрді біріктіреді.
 * (сайт пен мобильді қосымшада бірдей қолданылады)
 */
export const INCIDENT_GROUPS = [
  { code: 'fire', types: ['wildfire', 'fire'] },
  { code: 'flood', types: ['flood', 'mudflow'] },
  { code: 'earthquake', types: ['earthquake'] },
  { code: 'accident', types: ['accident'] },
  { code: 'misc', types: ['landslide', 'avalanche', 'blizzard', 'drought_heat', 'incident_other'] },
];
