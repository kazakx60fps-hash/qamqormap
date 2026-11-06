-- 003: үш тілге қолдау және табиғи апаттар бөлімі.
-- Бар кестелерге тек жаңа бағандар қосылады; бұрынғы жазбалар өзгеріссіз сақталады.

-- ───── Тіл ─────
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_lang text;
DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_preferred_lang_chk CHECK (preferred_lang IS NULL OR preferred_lang IN ('kk','ru','en'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ішкі хабарламалар енді түр + параметрлер ретінде сақталады (мәтінді алушының тілінде frontend құрастырады)
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS params jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Қолданушы мәтінінің тілі (автоматты аударма жасалмайды, тек белгі)
ALTER TABLE help_requests ADD COLUMN IF NOT EXISTS content_lang text NOT NULL DEFAULT 'kk';
DO $$ BEGIN
  ALTER TABLE help_requests ADD CONSTRAINT help_requests_content_lang_chk CHECK (content_lang IN ('kk','ru','en'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ───── Облыстар және қалалардың ағылшынша атаулары ─────
CREATE TABLE IF NOT EXISTS regions (
  code     text PRIMARY KEY,
  name_kk  text NOT NULL,
  name_ru  text NOT NULL,
  name_en  text NOT NULL,
  sort     smallint NOT NULL DEFAULT 0
);
ALTER TABLE cities ADD COLUMN IF NOT EXISTS name_en text NOT NULL DEFAULT '';
ALTER TABLE cities ADD COLUMN IF NOT EXISTS region_code text REFERENCES regions(code);
CREATE INDEX IF NOT EXISTS cities_region_idx ON cities (region_code);

-- ───── Көмек санаттарының бағыты: күнделікті көмек / табиғи апаттар ─────
ALTER TABLE help_categories ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'everyday';
DO $$ BEGIN
  ALTER TABLE help_categories ADD CONSTRAINT help_categories_direction_chk CHECK (direction IN ('everyday','disaster'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Ерікті апатқа қатысты көмектің қауіпсіздік ережесімен келісті ме
ALTER TABLE volunteer_profiles ADD COLUMN IF NOT EXISTS disaster_support boolean NOT NULL DEFAULT false;

-- ───── Табиғи апаттар ─────
CREATE TABLE IF NOT EXISTS disaster_types (
  id     serial PRIMARY KEY,
  code   text NOT NULL UNIQUE,
  color  text NOT NULL,
  icon   text NOT NULL,
  sort   smallint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS disaster_events (
  id                  serial PRIMARY KEY,
  type_id             integer NOT NULL REFERENCES disaster_types(id),
  title               text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 140),
  description         text NOT NULL CHECK (char_length(description) BETWEEN 10 AND 3000),
  content_lang        text NOT NULL DEFAULT 'kk' CHECK (content_lang IN ('kk','ru','en')),
  lat                 double precision,
  lng                 double precision,
  radius_km           numeric(6,1) CHECK (radius_km IS NULL OR radius_km BETWEEN 0.1 AND 500),
  location_note       text NOT NULL DEFAULT '' CHECK (char_length(location_note) <= 200),
  source_name         text NOT NULL DEFAULT '' CHECK (char_length(source_name) <= 160),
  source_url          text NOT NULL DEFAULT '' CHECK (char_length(source_url) <= 300),
  started_at          timestamptz NOT NULL,
  ended_at            timestamptz,
  verification_status text NOT NULL DEFAULT 'unverified' CHECK (verification_status IN ('unverified','verified')),
  activity_status     text NOT NULL DEFAULT 'active' CHECK (activity_status IN ('active','resolved')),
  verified_by         integer REFERENCES users(id),
  verified_at         timestamptz,
  created_by          integer NOT NULL REFERENCES users(id),
  updated_by          integer REFERENCES users(id),
  is_demo             boolean NOT NULL DEFAULT false,
  demo_key            text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  CHECK ((lat IS NULL) = (lng IS NULL)),
  CHECK (lat IS NULL OR (lat BETWEEN 40 AND 56 AND lng BETWEEN 46 AND 88)),
  CHECK (verification_status = 'unverified' OR (verified_by IS NOT NULL AND verified_at IS NOT NULL)),
  CHECK (activity_status = 'active' OR ended_at IS NOT NULL),
  CHECK (ended_at IS NULL OR ended_at >= started_at)
);
CREATE UNIQUE INDEX IF NOT EXISTS disaster_events_demo_key_uq ON disaster_events (demo_key) WHERE demo_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS disaster_events_filter_idx ON disaster_events (activity_status, verification_status, type_id);

-- Бір апат бірнеше қалаға немесе тұтас облысқа әсер етуі мүмкін
CREATE TABLE IF NOT EXISTS disaster_event_areas (
  id          serial PRIMARY KEY,
  event_id    integer NOT NULL REFERENCES disaster_events(id) ON DELETE CASCADE,
  city_id     integer REFERENCES cities(id),
  region_code text REFERENCES regions(code),
  CHECK ((city_id IS NULL) <> (region_code IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS disaster_event_areas_city_uq ON disaster_event_areas (event_id, city_id) WHERE city_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS disaster_event_areas_region_uq ON disaster_event_areas (event_id, region_code) WHERE region_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS disaster_event_areas_city_idx ON disaster_event_areas (city_id);

-- Оқиға өзгерістерінің тарихы (кім, қашан, не өзгертті)
CREATE TABLE IF NOT EXISTS disaster_event_history (
  id          bigserial PRIMARY KEY,
  event_id    integer NOT NULL REFERENCES disaster_events(id) ON DELETE CASCADE,
  actor_id    integer REFERENCES users(id),
  action      text NOT NULL,
  changes     jsonb NOT NULL DEFAULT '{}'::jsonb,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS disaster_event_history_idx ON disaster_event_history (event_id, created_at);

-- Қолданушылардың ықтимал апат туралы хабарлары: жария емес, тек координатор қарайды
CREATE TABLE IF NOT EXISTS disaster_reports (
  id           serial PRIMARY KEY,
  reporter_id  integer NOT NULL REFERENCES users(id),
  type_id      integer NOT NULL REFERENCES disaster_types(id),
  city_id      integer REFERENCES cities(id),
  lat          double precision,
  lng          double precision,
  description  text NOT NULL CHECK (char_length(description) BETWEEN 20 AND 2000),
  source_name  text NOT NULL DEFAULT '' CHECK (char_length(source_name) <= 160),
  source_url   text NOT NULL DEFAULT '' CHECK (char_length(source_url) <= 300),
  content_lang text NOT NULL DEFAULT 'kk' CHECK (content_lang IN ('kk','ru','en')),
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','linked','dismissed')),
  event_id     integer REFERENCES disaster_events(id),
  handled_by   integer REFERENCES users(id),
  handled_at   timestamptz,
  handle_note  text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CHECK ((lat IS NULL) = (lng IS NULL)),
  CHECK (status = 'pending' OR handled_by IS NOT NULL),
  CHECK (status <> 'linked' OR event_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS disaster_reports_status_idx ON disaster_reports (status, created_at);

-- Өтінішті апат оқиғасымен байланыстыру міндетті емес
ALTER TABLE help_requests ADD COLUMN IF NOT EXISTS disaster_event_id integer REFERENCES disaster_events(id);
CREATE INDEX IF NOT EXISTS help_requests_event_idx ON help_requests (disaster_event_id) WHERE disaster_event_id IS NOT NULL;
