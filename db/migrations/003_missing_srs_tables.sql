-- =============================================================================
-- BE-011: Missing SRS §6 tables / columns (gap polish on 001 + 002)
-- =============================================================================
-- DoD: favorites (+ type), settings, sync_log, password_reset_tokens,
--      refresh-token metadata — aligned with SRS §6 and ADR-006.
-- Already present in 001: favorites (sans type), sync_events, password_reset_tokens,
--      refresh_tokens. This migration fills true gaps and SRS naming aliases.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. favorites.type (SRS / Backend sync contract: channel | vod)
-- -----------------------------------------------------------------------------
ALTER TABLE app.favorites
  ADD COLUMN IF NOT EXISTS type text;

UPDATE app.favorites f
   SET type = CASE
     WHEN i.type = 'channel' THEN 'channel'
     ELSE 'vod'
   END
  FROM app.catalog_items i
 WHERE f.item_id = i.id
   AND f.type IS NULL;

UPDATE app.favorites
   SET type = 'vod'
 WHERE type IS NULL;

ALTER TABLE app.favorites
  ALTER COLUMN type SET NOT NULL,
  ALTER COLUMN type SET DEFAULT 'vod';

DO $body$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'favorites_type_check'
       AND conrelid = 'app.favorites'::regclass
  ) THEN
    ALTER TABLE app.favorites
      ADD CONSTRAINT favorites_type_check
      CHECK (type IN ('channel', 'vod'));
  END IF;
END $body$;

COMMENT ON COLUMN app.favorites.type IS
  'Client-facing favorite kind (channel|vod). BE-011 / SRS §6.';

-- -----------------------------------------------------------------------------
-- 2. profile_settings (syncable settings — ADR-006 dedicated table)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS app.profile_settings (
  profile_id    uuid        NOT NULL,
  account_id    uuid        NOT NULL,
  payload       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  sync_version  int         NOT NULL DEFAULT 1,
  change_seq    bigint      NOT NULL,
  deleted_at    timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id),
  FOREIGN KEY (profile_id, account_id) REFERENCES app.profiles (id, account_id)
    ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS ix_profile_settings_delta
  ON app.profile_settings (account_id, change_seq);

CREATE INDEX IF NOT EXISTS ix_profile_settings_delta_updated
  ON app.profile_settings (account_id, updated_at);

CREATE INDEX IF NOT EXISTS ix_profile_settings_delta_sync_version
  ON app.profile_settings (account_id, sync_version);

COMMENT ON TABLE app.profile_settings IS
  'Syncable per-profile settings (SRS settings). MVP payload JSON; BE-011.';

GRANT SELECT, INSERT, UPDATE, DELETE ON app.profile_settings
  TO mi_iptv_api, mi_iptv_worker;

-- Seed one settings row per existing profile (idempotent).
INSERT INTO app.profile_settings (profile_id, account_id, payload, sync_version, change_seq)
SELECT p.id,
       p.account_id,
       jsonb_build_object(
         'autoplay', p.autoplay,
         'subtitlePrefs', p.subtitle_prefs,
         'restrictions', p.restrictions,
         'language', p.language
       ),
       1,
       0
  FROM app.profiles p
ON CONFLICT (profile_id) DO NOTHING;

DROP TRIGGER IF EXISTS trg_profile_settings_timestamps ON app.profile_settings;
CREATE TRIGGER trg_profile_settings_timestamps
  BEFORE INSERT OR UPDATE ON app.profile_settings
  FOR EACH ROW EXECUTE FUNCTION app.force_row_timestamps();

ALTER TABLE app.profile_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON app.profile_settings;
CREATE POLICY tenant_isolation ON app.profile_settings FOR ALL TO mi_iptv_api
  USING (account_id = app.current_account_id())
  WITH CHECK (account_id = app.current_account_id());

DROP POLICY IF EXISTS worker_all ON app.profile_settings;
CREATE POLICY worker_all ON app.profile_settings FOR ALL TO mi_iptv_worker
  USING (true) WITH CHECK (true);

-- Allow settings in the sync ledger entity enum.
ALTER TABLE app.sync_events DROP CONSTRAINT IF EXISTS sync_events_entity_check;
ALTER TABLE app.sync_events
  ADD CONSTRAINT sync_events_entity_check
  CHECK (entity IN ('playback_state', 'favorite', 'source', 'setting'));

-- -----------------------------------------------------------------------------
-- 3. sync_log alias (SRS name → physical sync_events)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW app.sync_log AS
  SELECT *
    FROM app.sync_events;

COMMENT ON VIEW app.sync_log IS
  'SRS §6 sync_log alias of app.sync_events (BE-011 / ADR-006).';

GRANT SELECT ON app.sync_log TO mi_iptv_api, mi_iptv_worker;

COMMENT ON TABLE app.sync_events IS
  'Idempotency + conflict audit ledger (SRS sync_log). Physical name sync_events.';

-- -----------------------------------------------------------------------------
-- 4. Confirm password_reset_tokens + refresh_tokens metadata (already in 001)
-- -----------------------------------------------------------------------------
COMMENT ON TABLE app.password_reset_tokens IS
  'Hashed single-use password-reset tokens (SRS §6). BE-011 confirms presence.';

COMMENT ON TABLE app.refresh_tokens IS
  'Hashed refresh-token metadata: family, device binding, rotation, revocation (SRS §6).';

COMMENT ON COLUMN app.refresh_tokens.family_id IS
  'Rotation family; reuse of a spent token revokes the family.';
COMMENT ON COLUMN app.refresh_tokens.token_hash IS
  'SHA-256 of refresh token; clear token never stored.';
COMMENT ON COLUMN app.refresh_tokens.revoked_reason IS
  'logout | logout_all | reuse_detected | password_reset | device_unlinked';
