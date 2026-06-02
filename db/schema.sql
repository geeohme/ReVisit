-- ReVisit cloud schema. Apply with: psql "<connection string>" -f db/schema.sql
-- Or paste into the Supabase SQL editor.

create extension if not exists "pgcrypto";

-- ── bookmarks ───────────────────────────────────────────────
create table if not exists public.bookmarks (
  id              uuid primary key,
  legacy_id       text,
  user_id         uuid not null references auth.users(id) on delete cascade,
  url             text,
  title           text,
  category        text,
  summary         text,
  tags            text[],
  user_notes      text,
  added_timestamp bigint,
  revisit_by      timestamptz,
  status          text,
  history         jsonb,
  is_youtube      boolean,
  metadata        jsonb,
  updated_at      timestamptz not null,
  deleted_at      timestamptz
);
create index if not exists bookmarks_user_updated on public.bookmarks (user_id, updated_at);
create index if not exists bookmarks_user_legacy  on public.bookmarks (user_id, legacy_id);

-- ── categories ──────────────────────────────────────────────
create table if not exists public.categories (
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  priority    int,
  updated_at  timestamptz not null,
  deleted_at  timestamptz,
  primary key (user_id, name)
);

-- ── transcripts ─────────────────────────────────────────────
create table if not exists public.transcripts (
  video_id    text not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  raw         text,
  formatted   text,
  updated_at  timestamptz not null,
  deleted_at  timestamptz,
  primary key (video_id, user_id)
);
create index if not exists transcripts_user_updated on public.transcripts (user_id, updated_at);

-- ── user_settings ───────────────────────────────────────────
create table if not exists public.user_settings (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  data        jsonb,
  secrets     jsonb,
  enc_salt    text,
  updated_at  timestamptz not null
);

-- ── Row-Level Security: each user sees only their own rows ──
alter table public.bookmarks     enable row level security;
alter table public.categories    enable row level security;
alter table public.transcripts   enable row level security;
alter table public.user_settings enable row level security;

do $$
declare t text;
begin
  foreach t in array array['bookmarks','categories','transcripts','user_settings'] loop
    execute format('drop policy if exists rls_select on public.%I;', t);
    execute format('drop policy if exists rls_modify on public.%I;', t);
    execute format($f$create policy rls_select on public.%I for select using (user_id = auth.uid());$f$, t);
    execute format($f$create policy rls_modify on public.%I for all   using (user_id = auth.uid()) with check (user_id = auth.uid());$f$, t);
  end loop;
end $$;
