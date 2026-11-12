-- DEV smoke seed (BE-007). Idempotent. Placeholder password_hash is not a real login (BE-021).
-- Fixed UUIDs keep local/CI fixtures stable.

INSERT INTO app.accounts (
  id,
  email,
  password_hash,
  role,
  status,
  email_verified_at
) VALUES (
  '11111111-1111-4111-8111-111111111111',
  'dev.smoke@mi-iptv.example',
  '$argon2id$v=19$m=16,t=2,p=1$c2FsdHNhbHQ$cGxhY2Vob2xkZXJoYXNo',
  'user',
  'active',
  now()
)
ON CONFLICT (email) DO NOTHING;

INSERT INTO app.profiles (
  id,
  account_id,
  name,
  language,
  is_default
) VALUES (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'DEV Smoke',
  'es',
  true
)
ON CONFLICT (id) DO NOTHING;
