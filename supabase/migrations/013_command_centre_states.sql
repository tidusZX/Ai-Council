CREATE TABLE IF NOT EXISTS command_centre_states (
  id          TEXT PRIMARY KEY,
  payload     JSONB NOT NULL DEFAULT '{}',
  updated_by  TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);
