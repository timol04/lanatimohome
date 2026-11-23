-- ============================================================
-- Kochbuch im Essensplan
-- 1. Neue Tabelle recipes (Rezepte) – Zugriff nur für den Haushalt (is_household())
-- 2. food_plan bekommt zwei Spalten: verknüpftes Rezept + Personenzahl
-- 3. Live-Synchronisation für recipes
-- Gefahrlos mehrfach ausführbar. Bestehende Daten werden nicht verändert.
-- ============================================================

create table if not exists public.recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 200),
  servings integer not null default 2 check (servings between 1 and 50),
  -- Zutaten als Liste: [{ "a": 200, "u": "g", "n": "Mehl" }, { "a": null, "u": "", "n": "Salz" }]
  ingredients jsonb not null default '[]'::jsonb check (jsonb_typeof(ingredients) = 'array'),
  instructions text,                  -- ein Schritt pro Zeile
  source_url text check (source_url is null or source_url ~* '^https?://'),
  image text check (image is null or image ~* '^https?://'),
  author text,
  created_at timestamptz not null default now()
);

alter table public.recipes enable row level security;
drop policy if exists "Household full access" on public.recipes;
create policy "Household full access" on public.recipes for all to authenticated
  using (public.is_household()) with check (public.is_household());

-- Essensplan: Rezept verknüpfen. Wird ein Rezept gelöscht, bleibt der Text im Plan stehen.
alter table public.food_plan add column if not exists recipe_id uuid references public.recipes(id) on delete set null;
alter table public.food_plan add column if not exists servings integer check (servings is null or servings between 1 and 50);

-- Live-Synchronisation
do $$ begin
  alter publication supabase_realtime add table public.recipes;
exception when duplicate_object then null; end $$;
