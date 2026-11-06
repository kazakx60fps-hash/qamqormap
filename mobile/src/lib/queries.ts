import type { Filters } from './filters';

/** /api/requests сүзгісі — сайттағы параметрлермен бірдей */
export function requestQuery(cityId: number | null, f: Filters, limit = 200) {
  return {
    city_id: cityId ?? undefined,
    region: cityId == null ? f.region ?? undefined : undefined,
    direction: f.direction === 'all' ? undefined : f.direction,
    category_id: f.categoryId ?? undefined,
    urgency: f.urgency ?? undefined,
    status: f.status,
    q: f.q || undefined,
    event_id: f.eventId ?? undefined,
    disaster_type: f.direction !== 'everyday' ? f.disasterType ?? undefined : undefined,
    limit,
  };
}

/** /api/events сүзгісі */
export function eventQuery(cityId: number | null, f: Filters) {
  return {
    city_id: cityId ?? undefined,
    region: cityId == null ? f.region ?? undefined : undefined,
    type: f.disasterType ?? undefined,
    activity: f.activity ?? undefined,
    verification: f.verification ?? undefined,
  };
}
