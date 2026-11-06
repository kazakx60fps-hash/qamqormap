-- 004: мобильді қосымша (React Native + Expo) үшін.
-- Бар кестелерге тек жаңа бағандар мен кесте қосылады; бұрынғы жазбалар өзгермейді.

-- Сессияның түрі: сайт (HttpOnly cookie) немесе мобильді қосымша (Authorization: Bearer токені).
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS client text NOT NULL DEFAULT 'web';
DO $$ BEGIN
  ALTER TABLE sessions ADD CONSTRAINT sessions_client_chk CHECK (client IN ('web','mobile'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- Чаттағы оқылу күйі: әр қатысушы өтініш бойынша қай хабарламаға дейін оқығаны.
CREATE TABLE IF NOT EXISTS message_reads (
  request_id    integer NOT NULL REFERENCES help_requests(id) ON DELETE CASCADE,
  user_id       integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_id  bigint  NOT NULL DEFAULT 0 CHECK (last_read_id >= 0),
  read_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (request_id, user_id)
);
CREATE INDEX IF NOT EXISTS message_reads_user_idx ON message_reads (user_id);
