-- Budget-Widget: Tabelle + Zugriff nur für Timo & Lana (is_household() siehe supabase-absichern.sql)
create table if not exists public.budget_entries (
  id bigint generated always as identity primary key,
  title text not null,
  amount numeric(10,2) not null check (amount >= 0),
  kind text not null default 'shared' check (kind in ('shared','timo','lana')),
  interval text not null default 'monthly' check (interval in ('monthly','yearly','once')),
  category text,
  author text,
  created_at timestamptz default now()
);
alter table public.budget_entries enable row level security;
create policy "Household full access" on public.budget_entries for all to authenticated
  using (public.is_household()) with check (public.is_household());

-- Realtime
alter publication supabase_realtime add table public.budget_entries;
