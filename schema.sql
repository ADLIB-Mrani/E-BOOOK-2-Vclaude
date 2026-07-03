-- ============================================================
-- L'Atelier (Ebook-V-001) — Schéma de base de données Supabase
-- À exécuter UNE FOIS dans : Dashboard Supabase -> SQL Editor
-- ============================================================

-- Table : un enregistrement JSON par utilisateur (plans, e-books,
-- activité, conversations du coach, réglages).
create table if not exists public.user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- Sécurité : Row Level Security — chaque utilisateur ne peut lire
-- et écrire QUE sa propre ligne.
alter table public.user_data enable row level security;

drop policy if exists "select_own" on public.user_data;
create policy "select_own" on public.user_data
  for select using (auth.uid() = user_id);

drop policy if exists "insert_own" on public.user_data;
create policy "insert_own" on public.user_data
  for insert with check (auth.uid() = user_id);

drop policy if exists "update_own" on public.user_data;
create policy "update_own" on public.user_data
  for update using (auth.uid() = user_id);

drop policy if exists "delete_own" on public.user_data;
create policy "delete_own" on public.user_data
  for delete using (auth.uid() = user_id);
