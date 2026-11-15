-- BE-105 / FR-021: per-profile watch history (separate from Continue Watching)
-- plus privacy toggle on profiles.

ALTER TABLE app.profiles
  ADD COLUMN IF NOT EXISTS history_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN app.profiles.history_enabled IS
  'FR-021 privacy toggle: when false, history is not recorded or listed (BE-105).';

CREATE TABLE IF NOT EXISTS app.watch_history (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid        NOT NULL,
  account_id    uuid        NOT NULL,
  content_id    uuid        NOT NULL,
  source_id     uuid        REFERENCES app.user_sources(id) ON DELETE SET NULL,
  position_sec  int         CHECK (position_sec IS NULL OR position_sec >= 0),
  duration_sec  int         CHECK (duration_sec IS NULL OR duration_sec >= 0),
  completed     boolean     NOT NULL DEFAULT false,
  watched_at    timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (profile_id, account_id) REFERENCES app.profiles (id, account_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_watch_history_profile_watched
  ON app.watch_history (profile_id, watched_at DESC);

CREATE INDEX IF NOT EXISTS ix_watch_history_account
  ON app.watch_history (account_id, watched_at DESC);

COMMENT ON TABLE app.watch_history IS
  'Append-only per-profile watch history (FR-021). Separate from app.playback_states / Continue Watching.';

GRANT SELECT, INSERT, UPDATE, DELETE ON app.watch_history
  TO mi_iptv_api, mi_iptv_worker;

ALTER TABLE app.watch_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON app.watch_history;
CREATE POLICY tenant_isolation ON app.watch_history FOR ALL TO mi_iptv_api
  USING (account_id = app.current_account_id())
  WITH CHECK (account_id = app.current_account_id());

DROP POLICY IF EXISTS worker_all ON app.watch_history;
CREATE POLICY worker_all ON app.watch_history FOR ALL TO mi_iptv_worker
  USING (true) WITH CHECK (true);
