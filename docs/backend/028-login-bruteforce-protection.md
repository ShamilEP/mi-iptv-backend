# BE-028 — Brute-force protection on `/auth/login`

- **Status:** Implemented (in review)
- **Refs:** Security §4.1; NFR-013; INF-022

## Rules

- Max **5** failed logins per **IP** and per **account** in a **15-minute** window.
- Further attempts → HTTP **429** with **`Retry-After`** (seconds remaining on the Redis TTL).
- Lockouts are logged (`Login lockout triggered`) without passwords or full emails (account key is SHA-256).

## Redis keys (session instance)

| Key | TTL | Purpose |
| --- | --- | --- |
| `rl:login:ip:{ip}` | 900 s from first failure | Failure counter |
| `rl:login:acct:{sha256(email)}` | 900 s from first failure | Failure counter |

Successful login clears both counters for that IP + email.
