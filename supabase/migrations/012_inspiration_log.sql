-- ============================================================================
-- 012 — Inspiration Log
--
-- Stores viral videos saved via the Telegram bot or dashboard "Analyze"
-- button. Each row represents one saved video with its full Claude analysis
-- plus a short summary suitable for sending back to Telegram.
--
-- The pipeline (yt-dlp → ffmpeg → Whisper → Claude) still runs via
-- video_analyses. When that job completes the inspiration_log row is
-- updated with the analysis output and a generated summary.
-- ============================================================================

CREATE TABLE IF NOT EXISTS inspiration_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Source video
  url           TEXT        NOT NULL,
  platform      TEXT,                          -- 'instagram' | 'tiktok' | 'youtube' | 'other'
  creator_handle TEXT,                         -- @handle extracted from URL or metadata
  video_title   TEXT,                          -- from yt-dlp metadata

  -- Where it was saved from
  source        TEXT        NOT NULL DEFAULT 'dashboard',  -- 'telegram' | 'dashboard'
  telegram_chat_id TEXT,                       -- Telegram chat to reply to when done

  -- Processing state
  status        TEXT        NOT NULL DEFAULT 'processing',
  -- processing → complete | failed

  -- Linked pipeline job (video_analyses row)
  video_analysis_id UUID    REFERENCES video_analyses(id) ON DELETE SET NULL,

  -- Output
  -- Short 2-3 sentence summary for Telegram reply + dashboard preview
  summary       TEXT,
  -- Full structured output from claude-analyze.ts
  analysis      JSONB,
  -- Keyframe URLs (copy from video_analyses for convenience)
  keyframe_urls TEXT[]      NOT NULL DEFAULT '{}',

  error_message TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Fast lookups by owner, sorted newest first
CREATE INDEX IF NOT EXISTS inspiration_log_owner_created
  ON inspiration_log (owner_id, created_at DESC);

-- Status polling by the Telegram bot or dashboard
CREATE INDEX IF NOT EXISTS inspiration_log_status
  ON inspiration_log (owner_id, status);

-- RLS: users can only see their own entries
ALTER TABLE inspiration_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owners can manage inspiration_log"
  ON inspiration_log FOR ALL
  USING  (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- Keep updated_at fresh
CREATE OR REPLACE FUNCTION touch_inspiration_log()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

CREATE TRIGGER inspiration_log_updated_at
  BEFORE UPDATE ON inspiration_log
  FOR EACH ROW EXECUTE FUNCTION touch_inspiration_log();
