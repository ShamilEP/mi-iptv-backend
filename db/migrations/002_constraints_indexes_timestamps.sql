-- =============================================================================
-- BE-012: Constraints, indexes, and server-side timestamps
-- =============================================================================
-- Additive polish on top of 001_postgres_schema.sql (Backend §3.1 / §5.1):
--   * Unique email on accounts (idempotent guard)
--   * FK cascade / restrict policy for tenant and catalog edges
--   * Indexes for delta lookups on updated_at and sync_version
--   * Timestamps forced by the DB on INSERT/UPDATE (clients cannot set them)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Unique email
-- -----------------------------------------------------------------------------
-- 001 already defines `email citext NOT NULL UNIQUE` (constraint accounts_email_key).
-- This block fails closed if that uniqueness is ever lost.
DO $body$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_constraint c
     WHERE c.conrelid = 'app.accounts'::regclass
       AND c.contype = 'u'
       AND pg_get_constraintdef(c.oid) ILIKE '%(email)%'
  ) THEN
    ALTER TABLE app.accounts ADD CONSTRAINT uq_accounts_email UNIQUE (email);
  END IF;
END $body$;

COMMENT ON COLUMN app.accounts.email IS
  'Login identity; UNIQUE citext (case-insensitive). BE-012.';

-- -----------------------------------------------------------------------------
-- 2. Foreign key cascades
-- -----------------------------------------------------------------------------
-- refresh_tokens.account_id was only constrained via the composite device FK;
-- add a direct account cascade so account deletion cleans sessions without
-- relying solely on the devices path.
DO $body$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'fk_refresh_tokens_account'
       AND conrelid = 'app.refresh_tokens'::regclass
  ) THEN
    ALTER TABLE app.refresh_tokens
      ADD CONSTRAINT fk_refresh_tokens_account
      FOREIGN KEY (account_id) REFERENCES app.accounts(id) ON DELETE CASCADE;
  END IF;
END $body$;

-- Proprietary provider FK: reject deleting a provider that still has sources.
DO $body$
DECLARE
  v_con text;
BEGIN
  SELECT c.conname INTO v_con
    FROM pg_constraint c
   WHERE c.conrelid = 'app.user_sources'::regclass
     AND c.contype = 'f'
     AND pg_get_constraintdef(c.oid) ILIKE '%provider_id%catalog_providers%';

  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE app.user_sources DROP CONSTRAINT %I', v_con);
  END IF;

  ALTER TABLE app.user_sources
    ADD CONSTRAINT fk_user_sources_provider
    FOREIGN KEY (provider_id) REFERENCES app.catalog_providers(id) ON DELETE RESTRICT;
END $body$;

-- -----------------------------------------------------------------------------
-- 3. Delta-query indexes (updated_at, sync_version) — Backend §3.1
-- -----------------------------------------------------------------------------
-- change_seq indexes from 001 remain the primary sync cursor path; these support
-- version/time delta scans and conflict tooling that filter by sync_version /
-- updated_at.

CREATE INDEX IF NOT EXISTS ix_playback_states_delta_updated
  ON app.playback_states (account_id, updated_at);

CREATE INDEX IF NOT EXISTS ix_playback_states_delta_sync_version
  ON app.playback_states (account_id, sync_version);

CREATE INDEX IF NOT EXISTS ix_favorites_delta_updated
  ON app.favorites (account_id, updated_at);

CREATE INDEX IF NOT EXISTS ix_favorites_delta_sync_version
  ON app.favorites (account_id, sync_version);

CREATE INDEX IF NOT EXISTS ix_user_sources_delta_updated
  ON app.user_sources (account_id, updated_at);

CREATE INDEX IF NOT EXISTS ix_user_sources_delta_sync_version
  ON app.user_sources (account_id, sync_version);

-- -----------------------------------------------------------------------------
-- 4. Server-assigned timestamps only
-- -----------------------------------------------------------------------------
-- Overwrite any client-supplied created_at / updated_at. created_at is immutable
-- after insert; updated_at always advances on write via the server clock.

CREATE OR REPLACE FUNCTION app.force_row_timestamps() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.created_at := clock_timestamp();
    NEW.updated_at := NEW.created_at;
  ELSE
    NEW.created_at := OLD.created_at;
    NEW.updated_at := clock_timestamp();
  END IF;
  RETURN NEW;
END $$;

-- Keep the older helper as a thin alias for any external references.
CREATE OR REPLACE FUNCTION app.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := clock_timestamp();
  IF TG_OP = 'UPDATE' THEN
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END $$;

DO $body$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'accounts',
    'profiles',
    'user_sources',
    'catalog_items',
    'catalog_streams',
    'favorites',
    'playback_states'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_touch ON app.%1$I', t);
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%1$s_timestamps ON app.%1$I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_timestamps
         BEFORE INSERT OR UPDATE ON app.%1$I
         FOR EACH ROW EXECUTE FUNCTION app.force_row_timestamps()',
      t
    );
  END LOOP;
END $body$;
