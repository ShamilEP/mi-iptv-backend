-- BE-037 / FR-023: parental PIN (hashed) for kid profiles.
-- restrictions jsonb already exists on app.profiles (kidMode, maxRating, source allow/deny).

ALTER TABLE app.profiles
  ADD COLUMN IF NOT EXISTS pin_hash text;

COMMENT ON COLUMN app.profiles.pin_hash IS
  'Argon2id PHC of parental PIN (BE-037). Never expose in API responses or logs.';
