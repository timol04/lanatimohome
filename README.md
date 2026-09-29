# LanaTimoHome 🏠

Gemeinsames Alltags-Dashboard für Timo & Lana – läuft als PWA auf Tablet und Handy.

## Tech-Stack
- Reines HTML/CSS/JS – kein Build-Prozess nötig
- [Supabase](https://supabase.com) als Backend (Realtime-Sync)
- GitHub Pages als Hosting
- PWA-installierbar auf iOS & Android

## Supabase Setup

### 1. Tabelle anlegen
```sql
create table shopping_items (
  id uuid default gen_random_uuid() primary key,
  text text not null,
  is_done boolean default false,
  created_at timestamptz default now()
);

alter table shopping_items enable row level security;

-- Alle dürfen lesen (Anon Key reicht)
create policy "Public read" on shopping_items
  for select using (true);

-- Alle dürfen einfügen
create policy "Public insert" on shopping_items
  for insert with check (true);

-- Alle dürfen updaten
create policy "Public update" on shopping_items
  for update using (true);

-- Alle dürfen löschen
create policy "Public delete" on shopping_items
  for delete using (true);
```

### 2. Realtime aktivieren
Im Supabase Dashboard: **Database → Replication → shopping_items** aktivieren.

## Lokal entwickeln
Einfach `index.html` im Browser öffnen (oder einen lokalen Server wie `python3 -m http.server 8080`).

## Deployment
Push auf `main` → GitHub Actions deployt automatisch auf GitHub Pages.
