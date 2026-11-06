-- Демо жазбаларды қайталамай қайта толтыру үшін тұрақты кілт
ALTER TABLE help_requests ADD COLUMN IF NOT EXISTS demo_key text;
CREATE UNIQUE INDEX IF NOT EXISTS help_requests_demo_key_uq ON help_requests (demo_key) WHERE demo_key IS NOT NULL;
