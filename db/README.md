# ReVisit Cloud Database

## Apply the schema

Against your self-hosted Supabase Postgres:

```bash
psql "<your connection string>" -f db/schema.sql
```

Or paste the contents of `db/schema.sql` into the Supabase SQL editor and run it.

## Tables

- `bookmarks` — one row per bookmark (UUID `id`, original id preserved in `legacy_id`).
- `categories` — per-user categories, PK `(user_id, name)`.
- `transcripts` — per-user video transcripts, PK `(video_id, user_id)`.
- `user_settings` — one row per user; non-secret settings in `data` (jsonb, plaintext), encrypted secrets in `secrets` (jsonb), KDF salt in `enc_salt`.

All tables use `updated_at` (last-write-wins key) and `deleted_at` (soft-delete tombstone), and enforce Row-Level Security (`user_id = auth.uid()`).

## GoTrue (Auth) environment

Confirm these on the self-hosted instance:

- `GOTRUE_MAILER_AUTOCONFIRM=true` — email confirmation off (no SMTP needed).
- `GOTRUE_JWT_EXP` — access-token lifetime (seconds).
- Long refresh-token validity for persistent sessions.

The instance URL and anon key belong in `db/CONFIG.local.md` (gitignored), not in this file.
