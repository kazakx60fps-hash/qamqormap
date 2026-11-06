// Сайтпен ортақ API жауаптарының түрлері (идентификаторлар мен кодтар өзгермейді).
export type City = {
  id: number; name_kk: string; name_ru: string; name_en: string; region_code: string | null;
  region_kk: string; region_ru: string; lat: number; lng: number; zoom: number; is_major: boolean;
  search_text: string; active_count: number;
};
export type Region = { code: string; name_kk: string; name_ru: string; name_en: string; sort: number };
export type Category = { id: number; code: string; name_kk: string; short_kk: string; color: string; icon: string; direction: 'everyday' | 'disaster' };
export type DisasterType = { id: number; code: string; color: string; icon: string; kind?: 'natural' | 'incident' };
export type DisasterGroup = { code: string; types: string[] };
export type DisasterReport = {
  id: number; description: string; status: 'pending' | 'linked' | 'dismissed'; event_id: number | null; created_at: string;
  city_id: number | null; lat: number | null; lng: number | null; type_code: string; reporter_name?: string;
};
export type MapConfig = { tilesUrl: string; attribution: string; maxZoom: number };

export type User = {
  id: number; email: string; full_name: string; phone: string | null; is_coordinator: boolean;
  city_id: number | null; is_volunteer: boolean; preferred_lang: 'kk' | 'ru' | 'en' | null;
  orgs?: OrgRef[];
};
export type OrgRef = { id: number; name: string; city_id: number | null; is_demo: boolean; role: 'coordinator' | 'volunteer' };

export type RequestItem = {
  id: number; title: string; summary?: string; content_lang: string; city_id: number; city_name?: string;
  category_id?: number; category_code: string; category_name?: string; category_color: string; direction: 'everyday' | 'disaster';
  district: string | null; public_place?: string | null; approx_lat?: number; approx_lng?: number;
  needed_from?: string | null; needed_to?: string | null; needed_note?: string | null;
  urgency: 'low' | 'normal' | 'high'; status: string; moderation_status: string; is_demo: boolean;
  created_at: string; published_at?: string | null; completed_at?: string | null; updated_at?: string;
  disaster_event_id: number | null; disaster_type_code?: string | null; applications_count?: number;
  rejection_reason?: string | null; disputed?: boolean;
  // кабинет тізімдерінде
  application_id?: number; application_status?: string; assigned_at?: string; is_active?: boolean;
  author_name?: string; assignee_name?: string | null; duplicates?: unknown[];
  quantity?: number | null; quantity_unit?: string | null; org_id?: number | null; org_accepted_at?: string | null;
  need_state?: NeedState; team_offers?: TeamOffer[]; other_offers?: number;
};
export type NeedState = 'need_executor' | 'assigned' | 'awaiting' | 'confirmed';
export type TeamOffer = { application_id: number; request_id: number; message: string; volunteer_id: number; full_name: string;
  volunteer_city_id: number | null; category_match: boolean; categories: string[] };

export type EventArea = { city_id: number | null; region_code: string | null };
export type DisasterEvent = {
  id: number; title: string; summary?: string; description?: string; content_lang: string; type_code: string; type_color: string;
  lat: number | null; lng: number | null; radius_km: number | null; location_note: string | null;
  verification_status: 'verified' | 'unverified'; activity_status: 'active' | 'resolved';
  started_at: string; ended_at: string | null; updated_at: string; created_at: string; is_demo: boolean;
  areas: EventArea[]; requests_count: number; open_requests_count: number;
  source_name?: string | null; source_url?: string | null; verified_at?: string | null; verified_by_name?: string | null;
};

export type Notification = {
  id: number; request_id: number | null; type: string; title: string; body: string;
  params: Record<string, any>; read_at: string | null; created_at: string;
};

export type ChatItem = {
  id: number; title: string; status: string; content_lang: string; city_id: number; category_code: string; category_color: string;
  direction: string; last_id: number | null; last_body: string | null; last_at: string | null; last_mine: boolean | null;
  i_am_author: boolean; unread: number;
};

export type Message = { id: number; body: string; created_at: string; sender_id: number; sender_name: string; sender_role: string };

export type Stats = { completed: number; active: number; volunteers: number; helpers: number; demo_completed?: number; [k: string]: unknown };
