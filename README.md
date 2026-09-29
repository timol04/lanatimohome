# LanaTimoHome 🏠

Gemeinsames Alltags-Dashboard für Timo & Lana – läuft als PWA auf Tablet und Handy.

🌐 **Live:** https://timol04.github.io/lanatimohome/

## Tech-Stack
- Reines HTML/CSS/JS – kein Build-Prozess nötig
- [Supabase](https://supabase.com) als Backend (Realtime-Sync + Auth)
- GitHub Pages als Hosting
- PWA-installierbar auf iOS & Android

## Workflow nach jeder Bearbeitung

> **Wichtig:** Nach jeder Änderung an den Dateien direkt auf GitHub pushen,
> damit die Änderungen live gehen (GitHub Actions deployt automatisch).

```bash
cd /Users/timolanter/Documents/antigravity/lanatimohome

git add -A
git commit -m "Beschreibung der Änderung"
git push origin main
```

Für den Push wird der Fine-grained GitHub Token benötigt:
```bash
# Token temporär im Remote setzen (wird danach wieder entfernt):
git remote set-url origin https://timol04:GITHUB_TOKEN@github.com/timol04/lanatimohome.git
git push origin main
git remote set-url origin https://github.com/timol04/lanatimohome.git
```

Nach dem Push: GitHub Actions deployt automatisch (~1 Min) →  
https://github.com/timol04/lanatimohome/actions

## Supabase Setup

### Tabelle `shopping_items`
```sql
create table shopping_items (
  id uuid default gen_random_uuid() primary key,
  text text not null,
  is_done boolean default false,
  created_at timestamptz default now()
);

alter table shopping_items enable row level security;
```

### RLS-Policies (nur authentifizierte User)
```sql
create policy "Auth read"   on shopping_items for select to authenticated using (true);
create policy "Auth insert" on shopping_items for insert to authenticated with check (true);
create policy "Auth update" on shopping_items for update to authenticated using (true);
create policy "Auth delete" on shopping_items for delete to authenticated using (true);
```

### Realtime aktivieren
Supabase Dashboard → **Database → Replication → shopping_items** ✅

## Lokal entwickeln
```bash
python3 -m http.server 8080
# → http://localhost:8080
```

## Tabs erweitern
Neue Tabs in `app.js` im `TABS`-Array ergänzen:
```js
{
  id:       'mein-tab',
  label:    'Mein Tab',
  icon:     '📅',
  render:   renderMeinTab,     // Funktion die HTML-String zurückgibt
  onActivate: initMeinTab,     // Funktion für Event-Listener etc. (oder null)
}
```

## Deployment
Push auf `main` → GitHub Actions deployt automatisch auf GitHub Pages.
