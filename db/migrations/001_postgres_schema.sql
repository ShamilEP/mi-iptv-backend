-- =============================================================================
-- Mi IPTV / Media Center — PostgreSQL schema (MVP)            proposal v0.1
-- =============================================================================
-- Target      : PostgreSQL 15+ (recommended: 17 or 18 on RDS / Cloud SQL), UTF8, timezone UTC
--               ALTER DATABASE <db> SET timezone = 'UTC';
-- Run as      : the migration/owner role, in ONE transaction (or let the migration tool wrap it)
-- Status      : NOT yet executed against a live server -> run it in CI first (tracker BE-121)
-- Tracker refs: BE-010..013, BE-029, BE-047/048, BE-060..066, BE-075, BE-090/091, PRD-013/023/024
--
-- Conventions
--  * Server clock only. Every timestamp comes from the DB; client clocks are informational.
--  * Synced entities (favorites, playback_states, sources) carry:
--      sync_version  per-row counter (optimistic concurrency, returned to clients)
--      change_seq    per-ACCOUNT monotonic clock allocated from accounts.change_seq
--      deleted_at    tombstone (so other devices learn about deletions)
--    Delta pull = "rows of this account with change_seq > cursor" (see app.sync_delta).
--  * CHECK constraints instead of ENUM types: adding a value later is a one-line migration.
--  * Ingestion must never fail on messy third-party metadata, so no CHECKs on year/rating/etc.
--  * Secrets are never stored in clear: *_enc columns hold AES-256-GCM ciphertext produced by the
--    application with a KMS-wrapped data key (Security spec §5). The DB never sees the key.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS app;
CREATE SCHEMA IF NOT EXISTS telemetry;

CREATE EXTENSION IF NOT EXISTS citext   WITH SCHEMA public;  -- case-insensitive email
CREATE EXTENSION IF NOT EXISTS pg_trgm  WITH SCHEMA public;  -- prefix / fuzzy search
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;  -- diacritic-insensitive search

-- -----------------------------------------------------------------------------
-- 0. Helpers
-- -----------------------------------------------------------------------------

-- Single source of truth for search normalisation (ingest + queries use the same function).
-- unaccent() is only STABLE, so it is wrapped and declared IMMUTABLE to be usable in generated
-- columns and indexes. Re-index if the unaccent rules file is ever changed.
CREATE OR REPLACE FUNCTION app.norm_text(t text) RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE STRICT AS $$
  SELECT btrim(regexp_replace(
           lower(public.unaccent('public.unaccent'::regdictionary, t)),
           '[^[:alnum:]]+', ' ', 'g'))
$$;

CREATE OR REPLACE FUNCTION app.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();   -- clients can never set it
  RETURN NEW;
END $$;

-- The BFF runs `SET LOCAL app.account_id = '<uuid from the JWT>'` at the start of every request
-- transaction. Row-level security (section 10) and the sync functions rely on it.
CREATE OR REPLACE FUNCTION app.current_account_id() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('app.account_id', true), '')::uuid
$$;

-- -----------------------------------------------------------------------------
-- 1. Identity & access
-- -----------------------------------------------------------------------------

CREATE TABLE app.accounts (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  email                 citext      NOT NULL UNIQUE,
  password_hash         text        NOT NULL,              -- Argon2id (preferred) / bcrypt cost>=12, full PHC string
  role                  text        NOT NULL DEFAULT 'user'   CHECK (role   IN ('user','support','admin')),
  status                text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','pending_deletion')),
  email_verified_at     timestamptz,                       -- not required in MVP; ready for it
  change_seq            bigint      NOT NULL DEFAULT 0,    -- per-account sync clock (see app.next_change_seq)
  tombstone_floor       bigint      NOT NULL DEFAULT 0,    -- tombstones <= this seq were purged: older cursors must full-resync
  deletion_requested_at timestamptz,
  last_login_at         timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);
-- Release 1 (social login): password_hash -> DROP NOT NULL + app.auth_identities(account_id, provider, subject).

CREATE TABLE app.profiles (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid        NOT NULL REFERENCES app.accounts(id) ON DELETE CASCADE,
  name           text        NOT NULL,
  avatar         text,
  language       text        NOT NULL DEFAULT 'es',        -- BCP-47; placeholder until PRD-012
  region         text,
  is_default     boolean     NOT NULL DEFAULT false,
  autoplay       boolean     NOT NULL DEFAULT true,
  subtitle_prefs jsonb       NOT NULL DEFAULT '{}'::jsonb,
  restrictions   jsonb       NOT NULL DEFAULT '{}'::jsonb, -- Release 1 (parental); PIN hash column is added then
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, account_id)                                  -- target of composite FKs (profile must belong to the account)
);
-- Multi-profile ready, MVP = one profile (created at registration, BE-029); enforced by the app, not the schema.
CREATE UNIQUE INDEX uq_profiles_one_default ON app.profiles (account_id) WHERE is_default;
CREATE INDEX ix_profiles_account ON app.profiles (account_id);

CREATE TABLE app.devices (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id   uuid        NOT NULL REFERENCES app.accounts(id) ON DELETE CASCADE,
  device_type  text        NOT NULL CHECK (device_type IN ('tv','companion')),
  platform     text        NOT NULL CHECK (platform IN ('android_tv','android','ios')),
  name         text,                                       -- e.g. 'Salón · Android TV'
  model        text,
  app_version  text,
  os_version   text,
  push_token   text,                                       -- FCM / APNs (companion)
  paired_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,                                -- coarse; live presence lives in Valkey, flushed rarely
  revoked_at   timestamptz,
  UNIQUE (id, account_id)
);
CREATE INDEX ix_devices_account ON app.devices (account_id) WHERE revoked_at IS NULL;

-- Refresh tokens are authoritative HERE (hashed), not in Redis/Valkey: losing the cache must never
-- resurrect a revoked session. Valkey only holds a deny-list of revoked *access* tokens.
CREATE TABLE app.refresh_tokens (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id     uuid        NOT NULL,
  device_id      uuid        NOT NULL,
  family_id      uuid        NOT NULL,                     -- one family per login; replay of a rotated token revokes the family
  token_hash     bytea       NOT NULL UNIQUE,              -- SHA-256 of the token; the token itself is never stored
  issued_at      timestamptz NOT NULL DEFAULT now(),
  expires_at     timestamptz NOT NULL,                     -- 30 days
  used_at        timestamptz,                              -- set when rotated
  replaced_by    uuid,
  revoked_at     timestamptz,
  revoked_reason text,                                     -- logout | logout_all | reuse_detected | password_reset | device_unlinked
  FOREIGN KEY (device_id, account_id) REFERENCES app.devices (id, account_id) ON DELETE CASCADE
);
CREATE INDEX ix_refresh_family  ON app.refresh_tokens (family_id);
CREATE INDEX ix_refresh_device  ON app.refresh_tokens (device_id) WHERE revoked_at IS NULL;
CREATE INDEX ix_refresh_expires ON app.refresh_tokens (expires_at);

CREATE TABLE app.password_reset_tokens (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id  uuid        NOT NULL REFERENCES app.accounts(id) ON DELETE CASCADE,
  token_hash  bytea       NOT NULL UNIQUE,                 -- single use, short lived, hashed (SEC-014)
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz
);
CREATE INDEX ix_pwreset_account ON app.password_reset_tokens (account_id);

-- -----------------------------------------------------------------------------
-- 2. Sources & canonical catalog
-- -----------------------------------------------------------------------------
-- Model:
--   catalog_providers  proprietary catalog operators (system rows, shared by all accounts)
--   sources            what an ACCOUNT has configured: M3U / Xtream (secret) or the proprietary catalog (no secret)
--   catalog_items      canonical content. Either SHARED (provider_id) or PRIVATE to one account (account_id).
--                      Private items are de-duplicated across the account's sources so a channel can carry
--                      several streams -> "switch source" on failure (US-04, BE-048).
--   catalog_streams    playable references. Never returned by list endpoints; resolved at play time.

CREATE TABLE app.catalog_providers (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  code          text        NOT NULL UNIQUE,               -- e.g. 'miiptv'
  name          text        NOT NULL,
  api_base_url  text,
  status        text        NOT NULL DEFAULT 'active' CHECK (status IN ('active','disabled')),
  created_at    timestamptz NOT NULL DEFAULT now()
);
-- Seed example (contract pending, PRD-002):
-- INSERT INTO app.catalog_providers (code, name) VALUES ('miiptv', 'Mi IPTV Catalog');

CREATE TABLE app.sources (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid        NOT NULL REFERENCES app.accounts(id) ON DELETE CASCADE,
  kind             text        NOT NULL CHECK (kind IN ('m3u','xtream','proprietary')),
  provider_id      uuid        REFERENCES app.catalog_providers(id),    -- proprietary only
  name             text        NOT NULL,
  display_host     text,                                                -- non-secret host for UI/diagnostics
  uri_enc          bytea,                                               -- M3U URL / Xtream server URL (encrypted)
  credentials_enc  bytea,                                               -- Xtream user/password JSON (encrypted)
  enc_key_id       text,                                                -- KMS key / data-key id (rotation)
  priority         int         NOT NULL DEFAULT 100,                    -- lower = preferred
  enabled          boolean     NOT NULL DEFAULT true,
  status           text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','ok','degraded','error')),
  status_reason    text,                                                -- unreachable | auth_failed | invalid_playlist | timeout ...
  content_hash     text,                                                -- ETag / hash for change detection (BE-049)
  item_count       int,
  last_tested_at   timestamptz,
  last_ingested_at timestamptz,
  sync_version     int         NOT NULL DEFAULT 1,
  change_seq       bigint      NOT NULL,                                -- allocate with app.next_change_seq()
  deleted_at       timestamptz,                                         -- tombstone; secrets are wiped on delete
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'proprietary') = (provider_id IS NOT NULL)),
  CHECK (kind = 'proprietary' OR deleted_at IS NOT NULL OR uri_enc IS NOT NULL)
);
CREATE UNIQUE INDEX uq_sources_account_provider ON app.sources (account_id, provider_id)
  WHERE provider_id IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX ix_sources_account_priority ON app.sources (account_id, priority) WHERE deleted_at IS NULL;
CREATE INDEX ix_sources_delta ON app.sources (account_id, change_seq);

CREATE TABLE app.catalog_items (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),       -- = contentId in the API
  provider_id    uuid        REFERENCES app.catalog_providers(id) ON DELETE CASCADE,  -- shared catalog
  account_id     uuid        REFERENCES app.accounts(id)          ON DELETE CASCADE,  -- private catalog
  item_key       text        NOT NULL,   -- stable identity inside the scope: provider asset id, or account-level
                                         -- dedupe key ('tvg:espn.us' / 'name:espn hd'). Keeps the UUID stable across refreshes.
  type           text        NOT NULL CHECK (type IN ('channel','movie','series','episode')),
                                         -- 'episode' is an addition to the canonical model (PRD-013 pending)
  parent_id      uuid        REFERENCES app.catalog_items(id) ON DELETE CASCADE,      -- episode -> series
  title          text        NOT NULL,
  title_norm     text        GENERATED ALWAYS AS (app.norm_text(title)) STORED,
  subtitle       text,
  synopsis       text,
  artwork        jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- {poster, banner, logo, backdrop}
  genres         text[]      NOT NULL DEFAULT '{}',          -- canonical slugs ('sports', 'action')
  language       text,
  country        text,
  year           smallint,
  rating         text,
  duration_sec   int,
  channel_number int,                                        -- live
  group_title    text,                                       -- live (M3U group-title)
  epg_ref        text,                                       -- live (tvg-id); used by EPG matching in Release 1
  season_number  smallint,                                   -- episodes
  episode_number smallint,
  search_text    text        NOT NULL DEFAULT '',            -- app.norm_text() of aliases / people / keywords (Release 1)
  search_tsv     tsvector    GENERATED ALWAYS AS
                   (to_tsvector('simple', app.norm_text(title) || ' ' || search_text)) STORED,
  metadata       jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- original attributes, people, anything not modelled
  available      boolean     NOT NULL DEFAULT true,          -- INGEST RULE: never DELETE on refresh, flip this flag
  last_seen_at   timestamptz NOT NULL DEFAULT now(),         --   (favorites / progress reference these rows; FR-034)
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK ((provider_id IS NULL) <> (account_id IS NULL)),
  CHECK ((type = 'episode') = (parent_id IS NOT NULL))
);
CREATE UNIQUE INDEX uq_items_provider_key ON app.catalog_items (provider_id, type, item_key) WHERE provider_id IS NOT NULL;
CREATE UNIQUE INDEX uq_items_account_key  ON app.catalog_items (account_id,  type, item_key) WHERE account_id  IS NOT NULL;
CREATE INDEX ix_items_account_type  ON app.catalog_items (account_id, type, channel_number) WHERE account_id  IS NOT NULL;
CREATE INDEX ix_items_provider_type ON app.catalog_items (provider_id, type)                WHERE provider_id IS NOT NULL;
CREATE INDEX ix_items_episodes      ON app.catalog_items (parent_id, season_number, episode_number) WHERE parent_id IS NOT NULL;
CREATE INDEX ix_items_title_prefix  ON app.catalog_items (title_norm text_pattern_ops);                  -- MVP: exact + prefix
CREATE INDEX ix_items_title_trgm    ON app.catalog_items USING gin (title_norm public.gin_trgm_ops);     -- Release 1: typo tolerance
CREATE INDEX ix_items_tsv           ON app.catalog_items USING gin (search_tsv);
CREATE INDEX ix_items_genres        ON app.catalog_items USING gin (genres);

CREATE TABLE app.catalog_streams (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id        uuid        NOT NULL REFERENCES app.catalog_items(id) ON DELETE CASCADE,
  source_id      uuid        REFERENCES app.sources(id)           ON DELETE CASCADE,  -- user source (m3u / xtream)
  provider_id    uuid        REFERENCES app.catalog_providers(id) ON DELETE CASCADE,  -- proprietary catalog
  stream_key     text        NOT NULL,       -- stable id inside the source (xtream stream_id / hash of M3U URL / asset id)
  external_ref   text,                       -- what the playback resolver needs (xtream stream_id, provider asset id)
  uri_enc        bytea,                      -- M3U only: encrypted full URL. NULL for xtream/proprietary: URL is built
                                             -- or signed at play time from external_ref + the source's credentials.
  protocol       text        NOT NULL DEFAULT 'unknown' CHECK (protocol IN ('hls','dash','ts','mp4','unknown')),
  container_ext  text,
  quality        text,
  priority       int         NOT NULL DEFAULT 100,   -- tie-break inside the same source
  available      boolean     NOT NULL DEFAULT true,
  last_seen_at   timestamptz NOT NULL DEFAULT now(),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK ((source_id IS NULL) <> (provider_id IS NULL))
);
CREATE UNIQUE INDEX uq_streams_source   ON app.catalog_streams (item_id, source_id,   stream_key) WHERE source_id   IS NOT NULL;
CREATE UNIQUE INDEX uq_streams_provider ON app.catalog_streams (item_id, provider_id, stream_key) WHERE provider_id IS NOT NULL;
CREATE INDEX ix_streams_source ON app.catalog_streams (source_id) WHERE source_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 3. Per-profile user state (synced)
-- -----------------------------------------------------------------------------
-- account_id is denormalised on purpose: it makes delta queries and RLS single-table, and the composite FK
-- guarantees the profile really belongs to that account.

CREATE TABLE app.favorites (
  profile_id    uuid        NOT NULL,
  account_id    uuid        NOT NULL,
  item_id       uuid        NOT NULL REFERENCES app.catalog_items(id) ON DELETE CASCADE,
  sort_order    int         NOT NULL DEFAULT 0,
  sync_version  int         NOT NULL DEFAULT 1,
  change_seq    bigint      NOT NULL,
  deleted_at    timestamptz,                                  -- tombstone = "removed"; re-adding revives the row
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, item_id),
  FOREIGN KEY (profile_id, account_id) REFERENCES app.profiles (id, account_id) ON DELETE CASCADE
);
CREATE INDEX ix_favorites_delta ON app.favorites (account_id, change_seq);
CREATE INDEX ix_favorites_list  ON app.favorites (profile_id, sort_order, created_at) WHERE deleted_at IS NULL;

CREATE TABLE app.playback_states (
  profile_id      uuid        NOT NULL,
  account_id      uuid        NOT NULL,
  content_id      uuid        NOT NULL REFERENCES app.catalog_items(id) ON DELETE CASCADE,  -- movie or episode (VOD)
  source_id       uuid        REFERENCES app.sources(id) ON DELETE SET NULL,
  position_sec    int         NOT NULL CHECK (position_sec >= 0),
  duration_sec    int         CHECK (duration_sec >= 0),
  completed       boolean     NOT NULL DEFAULT false,
  last_device_id  uuid        REFERENCES app.devices(id) ON DELETE SET NULL,  -- who wrote it (conflict rule needs this)
  sync_version    int         NOT NULL DEFAULT 1,
  change_seq      bigint      NOT NULL,
  deleted_at      timestamptz,                                -- Release 1: "remove from Continue Watching" / clear history
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),         -- = lastPlayedAt in the SRS (last ACCEPTED write)
  PRIMARY KEY (profile_id, content_id),
  FOREIGN KEY (profile_id, account_id) REFERENCES app.profiles (id, account_id) ON DELETE CASCADE
) WITH (fillfactor = 80);
CREATE INDEX ix_playback_delta    ON app.playback_states (account_id, change_seq);
CREATE INDEX ix_playback_continue ON app.playback_states (profile_id, updated_at DESC)
  WHERE deleted_at IS NULL AND NOT completed AND position_sec > 0;

-- -----------------------------------------------------------------------------
-- 4. Sync engine support
-- -----------------------------------------------------------------------------

-- SRS "SyncLog": idempotency ledger + conflict audit. Short retention (see app.purge_ephemeral).
CREATE TABLE app.sync_events (
  account_id          uuid        NOT NULL REFERENCES app.accounts(id) ON DELETE CASCADE,
  client_event_id     uuid        NOT NULL,                  -- generated on the device, reused on every retry
  device_id           uuid        REFERENCES app.devices(id) ON DELETE SET NULL,
  entity              text        NOT NULL CHECK (entity    IN ('playback_state','favorite','source')),
  entity_id           text        NOT NULL,                  -- 'profileId:contentId' etc.
  operation           text        NOT NULL CHECK (operation IN ('upsert','delete','reset')),
  accepted            boolean     NOT NULL,
  resolved_by         text        NOT NULL CHECK (resolved_by IN ('accepted','lww','max_position','force_reset')),
  result_version      int,
  change_seq          bigint,                                -- NULL when the write was rejected
  client_reported_at  timestamptz,                           -- informational only (clock-skew debugging, QA-030)
  created_at          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (account_id, client_event_id)
);
CREATE INDEX ix_sync_events_created ON app.sync_events (created_at);

CREATE TYPE app.sync_result AS (
  accepted         boolean,
  resolved_by      text,       -- accepted | lww | max_position | force_reset  (drives the 'Sync Conflict' toast)
  current_version  int,
  change_seq       bigint,
  server_ts        timestamptz
);

-- Allocates the next value of the account's sync clock. Call it inside the same transaction as the write
-- (used directly by /sources CRUD). The UPDATE row-locks the account, so writers of ONE account are
-- serialised and change_seq order == commit order (no "late commit with a lower seq" holes).
CREATE OR REPLACE FUNCTION app.next_change_seq(p_account_id uuid) RETURNS bigint
LANGUAGE sql AS $$
  UPDATE app.accounts a SET change_seq = a.change_seq + 1 WHERE a.id = p_account_id RETURNING a.change_seq
$$;

-- Reference implementation of POST /sync/playback-state (Backend spec §3.1).
--   p_base_version = the sync_version the client last saw ("syncVersion" in the request). If it equals the
--                    server's, nobody wrote in between -> accept (a lower position is a legitimate rewind).
--   Otherwise it is a concurrent write: another device wrote within 60 s with a HIGHER position -> keep the
--   higher one (resolved_by = max_position, incoming rejected); else last-write-wins by SERVER arrival time.
--   p_force_reset always wins. Duplicate p_client_event_id returns the original outcome.
-- NOTE: LWW by arrival time means an offline-queued event replayed late beats a newer online edit. That is the
-- consequence of "server clock is authoritative"; hybrid logical clocks would be needed to change it.
CREATE OR REPLACE FUNCTION app.upsert_playback_state(
  p_account_id uuid, p_profile_id uuid, p_device_id uuid, p_client_event_id uuid,
  p_content_id uuid, p_source_id uuid,
  p_position_sec int, p_duration_sec int, p_completed boolean,
  p_base_version int DEFAULT 0, p_force_reset boolean DEFAULT false,
  p_client_reported_at timestamptz DEFAULT NULL
) RETURNS app.sync_result
LANGUAGE plpgsql AS $$
DECLARE
  v_seq      bigint;
  v_now      timestamptz := clock_timestamp();
  v_prev     app.sync_events;
  v_cur      app.playback_states;
  v_exists   boolean;
  v_accept   boolean := true;
  v_resolved text := 'accepted';
  v_version  int;
BEGIN
  IF p_account_id IS DISTINCT FROM app.current_account_id() THEN
    RAISE EXCEPTION 'account context mismatch' USING ERRCODE = '42501';
  END IF;

  -- (1) serialise this account's sync writes and read its clock
  SELECT a.change_seq INTO v_seq FROM app.accounts a WHERE a.id = p_account_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown account'; END IF;

  -- (2) idempotency
  SELECT * INTO v_prev FROM app.sync_events e
   WHERE e.account_id = p_account_id AND e.client_event_id = p_client_event_id;
  IF FOUND THEN
    SELECT ps.sync_version INTO v_version FROM app.playback_states ps
     WHERE ps.profile_id = p_profile_id AND ps.content_id = p_content_id;
    RETURN ROW(v_prev.accepted, v_prev.resolved_by, COALESCE(v_version, 0), v_prev.change_seq, v_now)::app.sync_result;
  END IF;

  -- (3) conflict resolution
  SELECT * INTO v_cur FROM app.playback_states ps
   WHERE ps.profile_id = p_profile_id AND ps.content_id = p_content_id FOR UPDATE;
  v_exists := FOUND;
  IF v_exists THEN
    IF p_force_reset THEN
      v_resolved := 'force_reset';
    ELSIF p_base_version = v_cur.sync_version THEN
      v_resolved := 'accepted';
    ELSIF v_cur.updated_at >= v_now - interval '60 seconds'
          AND v_cur.last_device_id IS DISTINCT FROM p_device_id
          AND p_position_sec < v_cur.position_sec THEN
      v_accept := false;
      v_resolved := 'max_position';
    ELSE
      v_resolved := 'lww';
    END IF;
  END IF;

  -- (4) apply
  IF v_accept THEN
    v_seq := v_seq + 1;
    UPDATE app.accounts a SET change_seq = v_seq WHERE a.id = p_account_id;
    IF v_exists THEN
      UPDATE app.playback_states ps
         SET source_id = p_source_id, position_sec = p_position_sec, duration_sec = p_duration_sec,
             completed = p_completed, last_device_id = p_device_id,
             sync_version = ps.sync_version + 1, change_seq = v_seq, deleted_at = NULL
       WHERE ps.profile_id = p_profile_id AND ps.content_id = p_content_id
      RETURNING ps.sync_version INTO v_version;
    ELSE
      INSERT INTO app.playback_states
        (profile_id, account_id, content_id, source_id, position_sec, duration_sec, completed,
         last_device_id, sync_version, change_seq)
      VALUES
        (p_profile_id, p_account_id, p_content_id, p_source_id, p_position_sec, p_duration_sec, p_completed,
         p_device_id, 1, v_seq)
      RETURNING sync_version INTO v_version;
    END IF;
  ELSE
    v_version := v_cur.sync_version;
  END IF;

  -- (5) ledger
  INSERT INTO app.sync_events
    (account_id, client_event_id, device_id, entity, entity_id, operation,
     accepted, resolved_by, result_version, change_seq, client_reported_at)
  VALUES
    (p_account_id, p_client_event_id, p_device_id, 'playback_state',
     p_profile_id::text || ':' || p_content_id::text,
     CASE WHEN p_force_reset THEN 'reset' ELSE 'upsert' END,
     v_accept, v_resolved, v_version, CASE WHEN v_accept THEN v_seq END, p_client_reported_at);

  RETURN ROW(v_accept, v_resolved, v_version, CASE WHEN v_accept THEN v_seq END, v_now)::app.sync_result;
END $$;

-- Reference implementation of POST /sync/favorites. Plain last-write-wins by server arrival time;
-- remove writes a tombstone, add revives it.
CREATE OR REPLACE FUNCTION app.set_favorite(
  p_account_id uuid, p_profile_id uuid, p_device_id uuid, p_client_event_id uuid,
  p_item_id uuid, p_add boolean,
  p_base_version int DEFAULT 0, p_sort_order int DEFAULT NULL,
  p_client_reported_at timestamptz DEFAULT NULL
) RETURNS app.sync_result
LANGUAGE plpgsql AS $$
DECLARE
  v_seq      bigint;
  v_now      timestamptz := clock_timestamp();
  v_prev     app.sync_events;
  v_cur_ver  int;
  v_version  int;
  v_resolved text := 'accepted';
BEGIN
  IF p_account_id IS DISTINCT FROM app.current_account_id() THEN
    RAISE EXCEPTION 'account context mismatch' USING ERRCODE = '42501';
  END IF;

  SELECT a.change_seq INTO v_seq FROM app.accounts a WHERE a.id = p_account_id FOR NO KEY UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown account'; END IF;

  SELECT * INTO v_prev FROM app.sync_events e
   WHERE e.account_id = p_account_id AND e.client_event_id = p_client_event_id;
  IF FOUND THEN
    SELECT f.sync_version INTO v_version FROM app.favorites f
     WHERE f.profile_id = p_profile_id AND f.item_id = p_item_id;
    RETURN ROW(v_prev.accepted, v_prev.resolved_by, COALESCE(v_version, 0), v_prev.change_seq, v_now)::app.sync_result;
  END IF;

  SELECT f.sync_version INTO v_cur_ver FROM app.favorites f
   WHERE f.profile_id = p_profile_id AND f.item_id = p_item_id FOR UPDATE;
  IF FOUND AND p_base_version <> v_cur_ver THEN v_resolved := 'lww'; END IF;

  v_seq := v_seq + 1;
  UPDATE app.accounts a SET change_seq = v_seq WHERE a.id = p_account_id;

  INSERT INTO app.favorites (profile_id, account_id, item_id, sort_order, sync_version, change_seq, deleted_at)
  VALUES (p_profile_id, p_account_id, p_item_id, COALESCE(p_sort_order, 0), 1, v_seq,
          CASE WHEN p_add THEN NULL ELSE v_now END)
  ON CONFLICT (profile_id, item_id) DO UPDATE
     SET deleted_at   = EXCLUDED.deleted_at,
         sort_order   = COALESCE(p_sort_order, app.favorites.sort_order),
         sync_version = app.favorites.sync_version + 1,
         change_seq   = EXCLUDED.change_seq
  RETURNING sync_version INTO v_version;

  INSERT INTO app.sync_events
    (account_id, client_event_id, device_id, entity, entity_id, operation,
     accepted, resolved_by, result_version, change_seq, client_reported_at)
  VALUES
    (p_account_id, p_client_event_id, p_device_id, 'favorite',
     p_profile_id::text || ':' || p_item_id::text,
     CASE WHEN p_add THEN 'upsert' ELSE 'delete' END,
     true, v_resolved, v_version, v_seq, p_client_reported_at);

  RETURN ROW(true, v_resolved, v_version, v_seq, v_now)::app.sync_result;
END $$;

-- GET /sync/state?cursor=N  (resolves PRD-023: sources travel in the same delta as favorites and progress).
-- The API must first compare the cursor with accounts.tombstone_floor: if cursor < floor, answer
-- "full resync required". Paginate with the last returned seq. Sources are projected explicitly so that
-- no secret column can ever leak through this endpoint.
CREATE OR REPLACE FUNCTION app.sync_delta(p_account_id uuid, p_cursor bigint, p_limit int DEFAULT 500)
RETURNS TABLE (entity text, seq bigint, deleted boolean, payload jsonb)
LANGUAGE sql STABLE AS $$
  SELECT d.entity, d.seq, d.deleted, d.payload
  FROM (
    SELECT 'playback_state'::text AS entity, ps.change_seq AS seq, (ps.deleted_at IS NOT NULL) AS deleted,
           jsonb_build_object('profileId', ps.profile_id, 'contentId', ps.content_id, 'sourceId', ps.source_id,
                              'position', ps.position_sec, 'duration', ps.duration_sec, 'completed', ps.completed,
                              'syncVersion', ps.sync_version, 'updatedAt', ps.updated_at) AS payload
      FROM app.playback_states ps
     WHERE ps.account_id = p_account_id AND ps.change_seq > p_cursor
    UNION ALL
    SELECT 'favorite', f.change_seq, (f.deleted_at IS NOT NULL),
           jsonb_build_object('profileId', f.profile_id, 'itemId', f.item_id, 'sortOrder', f.sort_order,
                              'syncVersion', f.sync_version, 'updatedAt', f.updated_at)
      FROM app.favorites f
     WHERE f.account_id = p_account_id AND f.change_seq > p_cursor
    UNION ALL
    SELECT 'source', s.change_seq, (s.deleted_at IS NOT NULL),
           jsonb_build_object('id', s.id, 'kind', s.kind, 'name', s.name, 'displayHost', s.display_host,
                              'priority', s.priority, 'enabled', s.enabled, 'status', s.status,
                              'statusReason', s.status_reason, 'itemCount', s.item_count,
                              'lastIngestedAt', s.last_ingested_at, 'syncVersion', s.sync_version)
      FROM app.sources s
     WHERE s.account_id = p_account_id AND s.change_seq > p_cursor
  ) d
  ORDER BY d.seq
  LIMIT p_limit
$$;

-- -----------------------------------------------------------------------------
-- 5. Device commands (send-to-TV only)
-- -----------------------------------------------------------------------------
-- D-pad / keyboard / transport commands are NOT persisted: they travel over the realtime channel
-- (Valkey pub/sub) and are fire-and-forget. Only 'play' (send-to-TV) is stored, so it survives a TV that is
-- briefly offline, can be expired, and is auditable (PRD-026, SEC-035).

CREATE TABLE app.device_commands (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id       uuid        NOT NULL REFERENCES app.accounts(id) ON DELETE CASCADE,
  sender_device_id uuid        NOT NULL,
  target_device_id uuid        NOT NULL,
  command          text        NOT NULL CHECK (command IN ('play')),
  payload          jsonb       NOT NULL,                       -- {contentId, sourceId, startPositionSec?}
  status           text        NOT NULL DEFAULT 'queued'
                               CHECK (status IN ('queued','delivered','acked','expired','failed')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  delivered_at     timestamptz,
  acked_at         timestamptz,
  expires_at       timestamptz NOT NULL DEFAULT now() + interval '10 minutes',
  -- both devices must belong to the SAME account as the command (IDOR / BOLA guard, SEC-015)
  FOREIGN KEY (sender_device_id, account_id) REFERENCES app.devices (id, account_id) ON DELETE CASCADE,
  FOREIGN KEY (target_device_id, account_id) REFERENCES app.devices (id, account_id) ON DELETE CASCADE
);
CREATE INDEX ix_device_commands_pending ON app.device_commands (target_device_id, created_at)
  WHERE status IN ('queued','delivered');
CREATE INDEX ix_device_commands_expiry ON app.device_commands (expires_at);

-- -----------------------------------------------------------------------------
-- 6. Convenience views (security_invoker: they respect the caller's RLS)
-- -----------------------------------------------------------------------------

-- Home "Continuar viendo" (US-05, BE-066).  Usage: WHERE profile_id = $1 ORDER BY last_played_at DESC LIMIT 20
-- Extra thresholds (minimum progress, completion %) are application settings (PRD-014).
CREATE VIEW app.v_continue_watching WITH (security_invoker = true) AS
SELECT ps.profile_id, ps.account_id, ps.content_id,
       i.type, i.title, i.artwork, i.parent_id, i.season_number, i.episode_number,
       ps.position_sec, ps.duration_sec,
       CASE WHEN ps.duration_sec > 0 THEN round(100.0 * ps.position_sec / ps.duration_sec, 1) END AS progress_pct,
       ps.source_id, ps.updated_at AS last_played_at, ps.sync_version
  FROM app.playback_states ps
  JOIN app.catalog_items i ON i.id = ps.content_id
 WHERE ps.deleted_at IS NULL AND NOT ps.completed AND ps.position_sec > 0 AND i.available;

-- Ordered candidate streams for an item, for THIS account: its enabled sources, then provider catalog.
-- Usage: WHERE item_id = $1 ORDER BY source_priority, stream_priority   (switch-source on failure, BE-048)
CREATE VIEW app.v_item_streams WITH (security_invoker = true) AS
SELECT st.id AS stream_id, st.item_id, s.account_id, s.id AS source_id, s.kind,
       s.priority AS source_priority, st.priority AS stream_priority,
       st.protocol, st.external_ref, (st.uri_enc IS NOT NULL) AS has_stored_uri
  FROM app.catalog_streams st
  JOIN app.sources s ON s.id = st.source_id
 WHERE st.available AND s.enabled AND s.deleted_at IS NULL
UNION ALL
SELECT st.id, st.item_id, s.account_id, s.id, s.kind,
       s.priority, st.priority,
       st.protocol, st.external_ref, (st.uri_enc IS NOT NULL)
  FROM app.catalog_streams st
  JOIN app.sources s ON s.provider_id = st.provider_id
 WHERE st.available AND s.enabled AND s.deleted_at IS NULL;

-- -----------------------------------------------------------------------------
-- 7. Maintenance (schedule with pg_cron, or from the worker's scheduler)
-- -----------------------------------------------------------------------------

-- Purges soft-deleted rows older than the retention and records the floor, so a client whose cursor is older
-- than the floor knows it must do a full resync instead of silently missing deletions.   e.g. daily
CREATE OR REPLACE FUNCTION app.purge_tombstones(p_retention interval DEFAULT interval '90 days') RETURNS void
LANGUAGE sql AS $$
  WITH f AS (DELETE FROM app.favorites       WHERE deleted_at < now() - p_retention RETURNING account_id, change_seq),
       p AS (DELETE FROM app.playback_states WHERE deleted_at < now() - p_retention RETURNING account_id, change_seq),
       s AS (DELETE FROM app.sources         WHERE deleted_at < now() - p_retention RETURNING account_id, change_seq),
       m AS (SELECT account_id, max(change_seq) AS max_seq
               FROM (SELECT * FROM f UNION ALL SELECT * FROM p UNION ALL SELECT * FROM s) x
              GROUP BY account_id)
  UPDATE app.accounts a SET tombstone_floor = greatest(a.tombstone_floor, m.max_seq)
    FROM m WHERE a.id = m.account_id
$$;

-- Short-lived tables.   e.g. every 15 minutes
CREATE OR REPLACE FUNCTION app.purge_ephemeral() RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  -- idempotency keys only need to outlive client retries; conflicts are kept longer for audit
  DELETE FROM app.sync_events
   WHERE created_at < now() - interval '30 days'
      OR (resolved_by = 'accepted' AND created_at < now() - interval '48 hours');

  UPDATE app.device_commands SET status = 'expired'
   WHERE status IN ('queued','delivered') AND expires_at < now();
  DELETE FROM app.device_commands WHERE expires_at < now() - interval '7 days';

  DELETE FROM app.password_reset_tokens WHERE expires_at < now() - interval '1 day';
  -- keep rotated/revoked tokens until they would have expired anyway: reuse detection needs them
  DELETE FROM app.refresh_tokens WHERE expires_at < now() - interval '7 days';
END $$;

-- -----------------------------------------------------------------------------
-- 8. Telemetry (QoE) — anonymous, no FK to accounts, separate schema and privileges
-- -----------------------------------------------------------------------------
-- anon_install_id is a random UUID generated on the device at install time; it is NOT devices.id and is not
-- linkable to the email (SEC-041). Events are not stored when the user opted out (BE-093) — enforced in the API.
-- Retention is pending (PRD-004): the default below keeps 90 days. If volume outgrows Postgres, move this
-- table to ClickHouse behind the same ingestion endpoint; dashboards only need the hourly rollup.

CREATE TABLE telemetry.qoe_events (
  received_at     timestamptz NOT NULL DEFAULT now(),
  occurred_at     timestamptz,                -- client-reported, informational
  anon_install_id uuid        NOT NULL,
  session_id      uuid        NOT NULL,
  event_type      text        NOT NULL CHECK (event_type IN
                    ('playback_start','channel_switch','rebuffer','stream_error','session_summary')),
  app_version     text,
  platform        text,
  device_model    text,
  os_version      text,
  network_type    text,                       -- wifi | ethernet | cellular | unknown
  content_kind    text CHECK (content_kind IN ('live','vod')),
  source_kind     text CHECK (source_kind  IN ('m3u','xtream','proprietary')),
  provider_code   text,                       -- catalog_providers.code only; never a user's private host
  ttff_ms         int  CHECK (ttff_ms >= 0),  -- time to first frame
  rebuffer_count  int,
  rebuffer_ms     int,
  watch_ms        int,
  dropped_frames  int,
  error_code      text,
  props           jsonb NOT NULL DEFAULT '{}'::jsonb   -- Release 1 extended metrics without a migration
) PARTITION BY RANGE (received_at);

CREATE INDEX ix_qoe_type_time ON telemetry.qoe_events (event_type, received_at);
CREATE INDEX ix_qoe_version   ON telemetry.qoe_events (app_version, platform, received_at);

-- Safety net so a missed partition never makes ingestion fail; keep it empty (alert if it grows).
CREATE TABLE telemetry.qoe_events_default PARTITION OF telemetry.qoe_events DEFAULT;

CREATE OR REPLACE FUNCTION telemetry.ensure_partition(p_month date) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_from date := date_trunc('month', p_month)::date;
  v_to   date := (date_trunc('month', p_month) + interval '1 month')::date;
  v_name text := 'qoe_events_' || to_char(v_from, 'YYYY_MM');
BEGIN
  EXECUTE format('CREATE TABLE IF NOT EXISTS telemetry.%I PARTITION OF telemetry.qoe_events FOR VALUES FROM (%L) TO (%L)',
                 v_name, v_from, v_to);
  RETURN v_name;
END $$;

CREATE OR REPLACE FUNCTION telemetry.drop_old_partitions(p_keep interval DEFAULT interval '90 days') RETURNS int
LANGUAGE plpgsql AS $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT c.relname
      FROM pg_inherits i
      JOIN pg_class c      ON c.oid = i.inhrelid
      JOIN pg_class p      ON p.oid = i.inhparent
      JOIN pg_namespace ns ON ns.oid = p.relnamespace
     WHERE ns.nspname = 'telemetry' AND p.relname = 'qoe_events'
       AND c.relname ~ '^qoe_events_[0-9]{4}_[0-9]{2}$'
  LOOP
    IF to_date(right(r.relname, 7), 'YYYY_MM') + interval '1 month' < now() - p_keep THEN
      EXECUTE format('DROP TABLE telemetry.%I', r.relname);
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;

-- current + next month; the scheduler calls ensure_partition(next month) monthly afterwards
DO $body$
BEGIN
  PERFORM telemetry.ensure_partition(current_date);
  PERFORM telemetry.ensure_partition((current_date + interval '1 month')::date);
END $body$;

-- Pre-aggregated series for Grafana (P50/P95 per version, device, network, provider — BE-091, INF-052)
CREATE TABLE telemetry.qoe_hourly (
  hour            timestamptz NOT NULL,
  app_version     text        NOT NULL,
  platform        text        NOT NULL,
  device_model    text        NOT NULL,
  network_type    text        NOT NULL,
  content_kind    text        NOT NULL,
  source_kind     text        NOT NULL,
  provider_code   text        NOT NULL,
  sessions        int         NOT NULL,
  events          int         NOT NULL,
  ttff_p50_ms     int,
  ttff_p95_ms     int,
  rebuffer_events bigint      NOT NULL DEFAULT 0,
  rebuffer_ms     bigint      NOT NULL DEFAULT 0,
  watch_ms        bigint      NOT NULL DEFAULT 0,
  errors          int         NOT NULL DEFAULT 0,
  PRIMARY KEY (hour, app_version, platform, device_model, network_type, content_kind, source_kind, provider_code)
);

-- Idempotent: re-running an hour replaces its rows.   e.g. hourly, for the previous hour
CREATE OR REPLACE FUNCTION telemetry.rollup_hour(p_hour timestamptz) RETURNS void
LANGUAGE sql AS $$
  INSERT INTO telemetry.qoe_hourly
    (hour, app_version, platform, device_model, network_type, content_kind, source_kind, provider_code,
     sessions, events, ttff_p50_ms, ttff_p95_ms, rebuffer_events, rebuffer_ms, watch_ms, errors)
  SELECT date_trunc('hour', p_hour),
         app_version, platform, device_model, network_type, content_kind, source_kind, provider_code,
         count(DISTINCT session_id), count(*),
         round(percentile_cont(0.50) WITHIN GROUP (ORDER BY ttff_ms))::int,
         round(percentile_cont(0.95) WITHIN GROUP (ORDER BY ttff_ms))::int,
         coalesce(sum(rebuffer_count), 0), coalesce(sum(rebuffer_ms), 0), coalesce(sum(watch_ms), 0),
         count(*) FILTER (WHERE event_type = 'stream_error')
    FROM (SELECT coalesce(app_version, 'unknown')  AS app_version,
                 coalesce(platform, 'unknown')     AS platform,
                 coalesce(device_model, 'unknown') AS device_model,
                 coalesce(network_type, 'unknown') AS network_type,
                 coalesce(content_kind, 'unknown') AS content_kind,
                 coalesce(source_kind, 'unknown')  AS source_kind,
                 coalesce(provider_code, '')       AS provider_code,
                 session_id, event_type, ttff_ms, rebuffer_count, rebuffer_ms, watch_ms
            FROM telemetry.qoe_events
           WHERE received_at >= date_trunc('hour', p_hour)
             AND received_at <  date_trunc('hour', p_hour) + interval '1 hour') e
   GROUP BY app_version, platform, device_model, network_type, content_kind, source_kind, provider_code
  ON CONFLICT (hour, app_version, platform, device_model, network_type, content_kind, source_kind, provider_code)
  DO UPDATE SET sessions = EXCLUDED.sessions, events = EXCLUDED.events,
                ttff_p50_ms = EXCLUDED.ttff_p50_ms, ttff_p95_ms = EXCLUDED.ttff_p95_ms,
                rebuffer_events = EXCLUDED.rebuffer_events, rebuffer_ms = EXCLUDED.rebuffer_ms,
                watch_ms = EXCLUDED.watch_ms, errors = EXCLUDED.errors
$$;

-- -----------------------------------------------------------------------------
-- 9. updated_at triggers
-- -----------------------------------------------------------------------------
DO $body$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','sources','catalog_items','catalog_streams','favorites','playback_states']
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%1$s_touch BEFORE UPDATE ON app.%1$I
                    FOR EACH ROW EXECUTE FUNCTION app.touch_updated_at()', t);
  END LOOP;
END $body$;

-- -----------------------------------------------------------------------------
-- 10. Roles, privileges and row-level security (defence in depth for BOLA / IDOR, SEC-015)
-- -----------------------------------------------------------------------------
-- NOLOGIN group roles: grant them to the real login users / IAM-mapped users per environment.
--   mi_iptv_api       the BFF. Sees only the current account's rows (RLS) and cannot write the catalog.
--   mi_iptv_worker    ingestion / EPG / maintenance jobs. Bypasses the tenant policies.
--   mi_iptv_readonly  Grafana. Telemetry schema only — it cannot read accounts, sources or anything personal.
-- The owner (migration role) is not subject to RLS; keep the API off the owner role.
-- accounts, refresh_tokens and password_reset_tokens have no RLS (the login flow runs before an account
-- context exists); only the auth module should touch them.

DO $body$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mi_iptv_api')      THEN CREATE ROLE mi_iptv_api      NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mi_iptv_worker')   THEN CREATE ROLE mi_iptv_worker   NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'mi_iptv_readonly') THEN CREATE ROLE mi_iptv_readonly NOLOGIN; END IF;
END $body$;

GRANT USAGE ON SCHEMA app, telemetry TO mi_iptv_api, mi_iptv_worker;
GRANT USAGE ON SCHEMA telemetry      TO mi_iptv_readonly;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO mi_iptv_api, mi_iptv_worker;
REVOKE INSERT, UPDATE, DELETE ON app.catalog_items, app.catalog_streams, app.catalog_providers FROM mi_iptv_api;
ALTER DEFAULT PRIVILEGES IN SCHEMA app GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mi_iptv_api, mi_iptv_worker;

GRANT INSERT ON telemetry.qoe_events TO mi_iptv_api;                   -- ingestion endpoint: insert-only
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA telemetry TO mi_iptv_worker;
GRANT SELECT ON ALL TABLES IN SCHEMA telemetry TO mi_iptv_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA telemetry GRANT SELECT ON TABLES TO mi_iptv_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA telemetry GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO mi_iptv_worker;

-- Tenant isolation on every table that has account_id and is user data
DO $body$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['profiles','devices','sources','favorites','playback_states','device_commands','sync_events']
  LOOP
    EXECUTE format('ALTER TABLE app.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('CREATE POLICY tenant_isolation ON app.%I FOR ALL TO mi_iptv_api
                      USING (account_id = app.current_account_id())
                      WITH CHECK (account_id = app.current_account_id())', t);
    EXECUTE format('CREATE POLICY worker_all ON app.%I FOR ALL TO mi_iptv_worker
                      USING (true) WITH CHECK (true)', t);
  END LOOP;
END $body$;

-- Catalog: shared items are visible to everyone, private items only to their account
ALTER TABLE app.catalog_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY item_read   ON app.catalog_items FOR SELECT TO mi_iptv_api
  USING (provider_id IS NOT NULL OR account_id = app.current_account_id());
CREATE POLICY item_worker ON app.catalog_items FOR ALL TO mi_iptv_worker USING (true) WITH CHECK (true);

-- Streams inherit visibility from their item (the sub-select is itself filtered by the policy above)
ALTER TABLE app.catalog_streams ENABLE ROW LEVEL SECURITY;
CREATE POLICY stream_read   ON app.catalog_streams FOR SELECT TO mi_iptv_api
  USING (EXISTS (SELECT 1 FROM app.catalog_items i WHERE i.id = catalog_streams.item_id));
CREATE POLICY stream_worker ON app.catalog_streams FOR ALL TO mi_iptv_worker USING (true) WITH CHECK (true);

-- =============================================================================
-- Companion data stores (documented here so the whole data layer lives in one place)
-- =============================================================================
-- VALKEY (BSD fork of Redis) — ephemeral only, never a source of truth
--   rl:login:ip:{ip} / rl:login:acct:{sha256(email)}   INCR + EXPIRE 900      5 failures / 15 min  (BE-028)
--   rl:api:{accountId}                                  sliding window 60 s    100 req/min          (BE-008)
--   jwt:deny:{jti}                                      TTL = remaining life   revoked access tokens
--   presence:{deviceId}                                 TTL ~45 s, set by heartbeat; value = realtime node id
--   cache:catalog:{scope}:{queryHash}                   TTL minutes            Home rows / listings
--   pub/sub  dev:{deviceId}                             D-pad, keyboard, transport commands (not persisted)
--   Run cache and session/presence data as two logical instances: allkeys-lru for the cache, noeviction for
--   deny-list/presence (INF-022). Cache and pub/sub must not share an eviction policy.
--
-- DEVICE (SQLite / Room): see mi_iptv_02_local_sqlite_schema.sql
--
-- RELEASE 1 additions (nothing in this file blocks them)
--   epg_programs (channel epg_ref + time range, partitioned by day, 7-14 day TTL), epg_mappings (matching overrides),
--   watch_history (append-only, separate from playback_states), profile_settings (syncable, same change_seq clock),
--   profiles.pin_hash + parental rules, auth_identities (social login), pairing codes (Valkey, TTL 5 min).
-- =============================================================================
