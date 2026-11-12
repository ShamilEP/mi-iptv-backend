-- QA contract-test seed (BE-007). Idempotent. Placeholder password_hash is not a real login (BE-021).

INSERT INTO app.accounts (
  id,
  email,
  password_hash,
  role,
  status,
  email_verified_at
) VALUES (
  '33333333-3333-4333-8333-333333333333',
  'qa.contract@mi-iptv.example',
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
  '44444444-4444-4444-8444-444444444444',
  '33333333-3333-4333-8333-333333333333',
  'QA Contract',
  'es',
  true
)
ON CONFLICT (id) DO NOTHING;
