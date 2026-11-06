-- 005: еріктілер ұйымдары (ұйым кабинеті), ұйымның өтінішті қабылдауы және қажет ресурс мөлшері.
-- Бар кестелерге тек жаңа бағандар қосылады; бұрынғы жазбалар өзгермейді.

CREATE TABLE IF NOT EXISTS organizations (
  id          serial PRIMARY KEY,
  name        text NOT NULL CHECK (char_length(name) BETWEEN 3 AND 160),
  description text,
  city_id     integer REFERENCES cities(id),
  is_demo     boolean NOT NULL DEFAULT false,
  demo_key    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS organizations_demo_key_uq ON organizations (demo_key) WHERE demo_key IS NOT NULL;

-- Ұйым мүшелері: координатор (ұйымның тапсырмаларын басқарады) немесе ерікті (команда мүшесі).
-- Ұйым координаторының құқығы тек өз ұйымына қатысты; платформа координаторы (users.is_coordinator) бөлек.
CREATE TABLE IF NOT EXISTS organization_members (
  org_id     integer NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id    integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role       text NOT NULL CHECK (role IN ('coordinator', 'volunteer')),
  joined_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);
CREATE INDEX IF NOT EXISTS organization_members_user_idx ON organization_members (user_id);

-- Өтінішті ұйым жұмысқа қабылдауы: бір өтініш — ең көбі бір ұйым
ALTER TABLE help_requests ADD COLUMN IF NOT EXISTS org_id integer REFERENCES organizations(id);
ALTER TABLE help_requests ADD COLUMN IF NOT EXISTS org_accepted_at timestamptz;
ALTER TABLE help_requests ADD COLUMN IF NOT EXISTS org_accepted_by integer REFERENCES users(id);
DO $$ BEGIN
  ALTER TABLE help_requests ADD CONSTRAINT help_requests_org_accept_chk
    CHECK ((org_id IS NULL AND org_accepted_at IS NULL) OR (org_id IS NOT NULL AND org_accepted_at IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS help_requests_org_idx ON help_requests (org_id) WHERE org_id IS NOT NULL;

-- Қажет ресурс мөлшері (міндетті емес). Әр түрлі өлшем бірліктері ешқашан бір санға қосылмайды.
ALTER TABLE help_requests ADD COLUMN IF NOT EXISTS quantity numeric(10,2);
ALTER TABLE help_requests ADD COLUMN IF NOT EXISTS quantity_unit text;
DO $$ BEGIN
  ALTER TABLE help_requests ADD CONSTRAINT help_requests_quantity_chk CHECK (
    (quantity IS NULL AND quantity_unit IS NULL) OR
    (quantity > 0 AND quantity_unit IN ('bottle','liter','kg','pack','set','item','person','bed','trip'))
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
