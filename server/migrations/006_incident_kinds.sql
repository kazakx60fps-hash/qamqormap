-- 006: оқиғалар картасы — табиғи апаттардан бөлек «оқиға» түрлері (өрт, авария, басқа мәселе).
-- Бар деректер өзгермейді: барлық бұрынғы түрлер kind='natural' болып қалады.
ALTER TABLE disaster_types ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'natural';
DO $$ BEGIN
  ALTER TABLE disaster_types ADD CONSTRAINT disaster_types_kind_check CHECK (kind IN ('natural', 'incident'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
