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
drop policy if exists "Household full access" on public.budget_entries;
create policy "Household full access" on public.budget_entries for all to authenticated
  using (public.is_household()) with check (public.is_household());

-- Realtime
do $$ begin
  alter publication supabase_realtime add table public.budget_entries;
exception when duplicate_object then null; end $$;

-- Startdaten aus Wohnungsbudget 2027.xlsx (alles monatlich, nur wenn die Tabelle leer ist)
do $$ begin
if not exists (select 1 from public.budget_entries) then
insert into public.budget_entries (title, amount, kind, interval, category) values
  ('Miete', 1395.00, 'shared', 'monthly', 'Wohnen'),
  ('Nebenkosten (ohne Strom)', 100.00, 'shared', 'monthly', 'Wohnen'),
  ('Strom', 60.00, 'shared', 'monthly', 'Wohnen'),
  ('Lebensmittel', 500.00, 'shared', 'monthly', 'Haushalt'),
  ('Hygieneartikel', 50.00, 'shared', 'monthly', 'Haushalt'),
  ('Internet', 60.00, 'shared', 'monthly', 'Wohnen'),
  ('Hausratversicherung', 10.00, 'shared', 'monthly', 'Versicherung'),
  ('Serafe', 26.00, 'shared', 'monthly', 'Abgaben'),
  ('Abos (Disney)', 16.90, 'shared', 'monthly', 'Abos'),
  ('ÖV-Kosten', 245.00, 'lana', 'monthly', 'Mobilität'),
  ('Krankenkasse', 260.00, 'lana', 'monthly', 'Versicherung'),
  ('ÖV-Kosten', 57.00, 'timo', 'monthly', 'Mobilität'),
  ('Krankenkasse', 395.00, 'timo', 'monthly', 'Versicherung'),
  ('Persönliche Abos', 46.85, 'timo', 'monthly', 'Abos');
end if;
end $$;
