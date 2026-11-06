-- QamqorMap: негізгі схема.
-- Барлық нысандар IF NOT EXISTS арқылы жасалады, сондықтан бұрын бар деректер сақталады.

CREATE TABLE IF NOT EXISTS cities (
  id          integer PRIMARY KEY,
  name_kk     text NOT NULL,
  name_ru     text NOT NULL,
  region_kk   text NOT NULL,
  region_ru   text NOT NULL,
  lat         double precision NOT NULL CHECK (lat BETWEEN 40 AND 56),
  lng         double precision NOT NULL CHECK (lng BETWEEN 46 AND 88),
  zoom        smallint NOT NULL DEFAULT 12,
  is_major    boolean NOT NULL DEFAULT false,
  search_text text NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS help_categories (
  id       serial PRIMARY KEY,
  code     text NOT NULL UNIQUE,
  name_kk  text NOT NULL,
  short_kk text NOT NULL,
  color    text NOT NULL,
  icon     text NOT NULL,
  sort     smallint NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS users (
  id             serial PRIMARY KEY,
  email          text NOT NULL,
  full_name      text NOT NULL CHECK (char_length(full_name) BETWEEN 2 AND 80),
  phone          text,
  password_hash  text NOT NULL,
  is_coordinator boolean NOT NULL DEFAULT false,
  city_id        integer REFERENCES cities(id),
  is_demo        boolean NOT NULL DEFAULT false,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uq ON users (lower(email));

CREATE TABLE IF NOT EXISTS sessions (
  id          text PRIMARY KEY,            -- токеннің SHA-256 хэші
  user_id     integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  csrf_token  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  user_agent  text
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS volunteer_profiles (
  user_id         integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  bio             text NOT NULL DEFAULT '',
  city_id         integer NOT NULL REFERENCES cities(id),
  district        text NOT NULL DEFAULT '',
  base_lat        double precision,
  base_lng        double precision,
  radius_km       numeric(5,1) NOT NULL DEFAULT 5 CHECK (radius_km BETWEEN 0.5 AND 100),
  available_days  smallint[] NOT NULL DEFAULT '{}',   -- 1 = дүйсенбі … 7 = жексенбі
  time_from       time,
  time_to         time,
  is_active       boolean NOT NULL DEFAULT true,
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CHECK ((base_lat IS NULL) = (base_lng IS NULL)),
  CHECK (time_from IS NULL OR time_to IS NULL OR time_from < time_to)
);
CREATE INDEX IF NOT EXISTS volunteer_profiles_city_idx ON volunteer_profiles (city_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS volunteer_categories (
  user_id     integer NOT NULL REFERENCES volunteer_profiles(user_id) ON DELETE CASCADE,
  category_id integer NOT NULL REFERENCES help_categories(id),
  PRIMARY KEY (user_id, category_id)
);

CREATE TABLE IF NOT EXISTS help_requests (
  id                 serial PRIMARY KEY,
  author_id          integer NOT NULL REFERENCES users(id),
  city_id            integer NOT NULL REFERENCES cities(id),
  category_id        integer NOT NULL REFERENCES help_categories(id),
  title              text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 120),
  description        text NOT NULL CHECK (char_length(description) BETWEEN 20 AND 2000),
  district           text NOT NULL DEFAULT '',
  public_place       text NOT NULL DEFAULT '',
  approx_lat         double precision NOT NULL,
  approx_lng         double precision NOT NULL,
  needed_from        timestamptz,
  needed_to          timestamptz,
  needed_note        text NOT NULL DEFAULT '',
  urgency            text NOT NULL DEFAULT 'normal' CHECK (urgency IN ('low','normal','high')),
  moderation_status  text NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('draft','pending','approved','rejected')),
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open','assigned','in_progress','awaiting_confirmation','completed','cancelled')),
  rejection_reason   text,
  cancel_reason      text,
  dispute_note       text,
  disputed_at        timestamptz,
  duplicate_of       integer REFERENCES help_requests(id),
  is_demo            boolean NOT NULL DEFAULT false,
  submitted_at       timestamptz,
  published_at       timestamptz,
  first_assigned_at  timestamptz,
  completed_at       timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CHECK (needed_to IS NULL OR needed_from IS NULL OR needed_from <= needed_to),
  -- Бекітілмеген өтініш орындалу кезеңіне өте алмайды
  CHECK (moderation_status = 'approved' OR status IN ('open','cancelled')),
  CHECK (status <> 'completed' OR completed_at IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS help_requests_public_idx ON help_requests (city_id, status) WHERE moderation_status = 'approved';
CREATE INDEX IF NOT EXISTS help_requests_moderation_idx ON help_requests (moderation_status, city_id);
CREATE INDEX IF NOT EXISTS help_requests_author_idx ON help_requests (author_id);
CREATE INDEX IF NOT EXISTS help_requests_category_idx ON help_requests (category_id);

-- Жеке деректер жария кестеден бөлек сақталады
CREATE TABLE IF NOT EXISTS request_private (
  request_id    integer PRIMARY KEY REFERENCES help_requests(id) ON DELETE CASCADE,
  address       text NOT NULL CHECK (char_length(address) BETWEEN 5 AND 200),
  exact_lat     double precision NOT NULL,
  exact_lng     double precision NOT NULL,
  contact_phone text NOT NULL
);

CREATE TABLE IF NOT EXISTS applications (
  id            serial PRIMARY KEY,
  request_id    integer NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,
  volunteer_id  integer NOT NULL REFERENCES users(id),
  message       text NOT NULL DEFAULT '' CHECK (char_length(message) <= 600),
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','withdrawn','accepted','declined')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
-- Бір ерікті бір өтінішке бір ғана белсенді ұсыныс жібере алады
CREATE UNIQUE INDEX IF NOT EXISTS applications_one_active_uq
  ON applications (request_id, volunteer_id) WHERE status IN ('active','accepted');
CREATE INDEX IF NOT EXISTS applications_volunteer_idx ON applications (volunteer_id);

CREATE TABLE IF NOT EXISTS assignments (
  id            serial PRIMARY KEY,
  request_id    integer NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,
  volunteer_id  integer NOT NULL REFERENCES users(id),
  application_id integer REFERENCES applications(id),
  assigned_by   integer NOT NULL REFERENCES users(id),
  is_active     boolean NOT NULL DEFAULT true,
  assigned_at   timestamptz NOT NULL DEFAULT now(),
  ended_at      timestamptz,
  end_reason    text,
  CHECK (is_active OR ended_at IS NOT NULL)
);
-- Бір өтінішке бір ғана белсенді орындаушы
CREATE UNIQUE INDEX IF NOT EXISTS assignments_one_active_uq ON assignments (request_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS assignments_volunteer_idx ON assignments (volunteer_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS request_events (
  id          bigserial PRIMARY KEY,
  request_id  integer NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,
  actor_id    integer REFERENCES users(id),
  event_type  text NOT NULL,
  from_status text,
  to_status   text,
  note        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS request_events_request_idx ON request_events (request_id, created_at);
-- Растау оқиғасы бір өтінішке бір рет қана жазылады (статистика қайталанбауы үшін)
CREATE UNIQUE INDEX IF NOT EXISTS request_events_completed_once_uq
  ON request_events (request_id) WHERE event_type = 'completed';

CREATE TABLE IF NOT EXISTS messages (
  id          bigserial PRIMARY KEY,
  request_id  integer NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,
  sender_id   integer NOT NULL REFERENCES users(id),
  body        text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_request_idx ON messages (request_id, id);

CREATE TABLE IF NOT EXISTS attachments (
  id            serial PRIMARY KEY,
  request_id    integer NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,
  uploader_id   integer NOT NULL REFERENCES users(id),
  storage_key   text NOT NULL UNIQUE,
  original_name text NOT NULL,
  mime_type     text NOT NULL CHECK (mime_type IN ('image/webp','image/jpeg','image/png')),
  size_bytes    integer NOT NULL CHECK (size_bytes > 0),
  width         integer,
  height        integer,
  visibility    text NOT NULL DEFAULT 'participants' CHECK (visibility IN ('public','participants')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS attachments_request_idx ON attachments (request_id);

CREATE TABLE IF NOT EXISTS notifications (
  id          bigserial PRIMARY KEY,
  user_id     integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  request_id  integer REFERENCES help_requests(id) ON DELETE CASCADE,
  type        text NOT NULL,
  title       text NOT NULL,
  body        text NOT NULL DEFAULT '',
  read_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);

-- Қашықтықты PostGIS-сіз есептеу: гаверсинус формуласы, километрмен
CREATE OR REPLACE FUNCTION qm_distance_km(lat1 double precision, lng1 double precision,
                                          lat2 double precision, lng2 double precision)
RETURNS double precision LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT 2 * 6371.0088 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ))
$$;
