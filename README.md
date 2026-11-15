# LanaTimoHome

> **Regel für KI:** In diesem Projekt keine Emojis verwenden, weder in der App noch im Code.
> Für Symbole immer Lucide-Icons (`icon('name', 'sm')`) nutzen. Design-Regeln: `.agents/rules/ui-standards.md`.

Gemeinsames Alltags-Dashboard für Timo & Lana – läuft als PWA auf dem Wand-iPad und auf dem Handy.

**Live:** https://timol04.github.io/lanatimohome/

## Tech-Stack
- Reines HTML/CSS/JS, kein Build-Prozess
- [Supabase](https://supabase.com) für Login, Datenbank und Live-Synchronisation
- GitHub Pages als Hosting (Push auf `main` deployt automatisch, ca. 1 Minute)

## Aufbau

```
index.html            Lädt Bibliotheken und die App-Dateien (Reihenfolge wichtig)
styles.css            Design-System: Farben, Grössen-Skala, Milchglas, Bausteine, Animationen
assets/hintergrund.jpg  Hintergrundbild des Homescreens (später Fotos aus dem Album)
sw.js                 Service Worker (offline-fähig, immer zuerst Netz)
js/config.js          Feste Einstellungen: Supabase, Namen, Anbieter, Haltestelle, Zeiten
js/core.js            Grundbausteine: Daten-Baustein (createStore), Hinweise mit Rückgängig,
                      Detailansicht, Popups, Formularfelder, Hilfsfunktionen
js/widgets/*.js       Ein Widget pro Datei (Einkauf, To-Do, Notizen, Essen, Ämtli, …)
js/edit.js            Bearbeiten-Popup für alle Listen
js/dashboard.js       Homescreen: Info-Spalte (Uhr, Wetter, Abfahrten), Widget-Raster, Karussell,
                      Verschieben auch auf andere Seiten, Tageswechsel
js/screensaver.js     Fotos nach 5 Min., schwarz nach 30 Min.
js/main.js            Start und Login
supabase/             Datenbank-Schema, SQL-Skripte und Edge Function (Link-Scanner)
```

### Neues Widget hinzufügen
1. Datei `js/widgets/meinwidget.js` anlegen:
   ```js
   const meinStore = createStore({ table: 'meine_tabelle' });
   registerWidget({
     id: 'mein', pos: 15, title: 'Mein Widget', icon: 'star', color: 'var(--c-mein)',
     open: openMein, store: meinStore,
     renderContent: () => miniPlaceholder('star', 'Noch leer'),
     getPreview: () => `${meinStore.items.length} Einträge`
   });
   meinStore.onChange(() => { updateWidget('mein'); if (currentOverlay === 'mein') renderMein(); });
   ```
2. In `index.html` vor `js/edit.js` einbinden und in `sw.js` bei `ASSETS` ergänzen.
3. Farbe `--c-mein` in `styles.css` definieren.
4. Tabelle in Supabase anlegen (Policy und Realtime wie in `supabase/schema.sql`).

`createStore` übernimmt Laden, Live-Synchronisation, Ändern mit Fehleranzeige (`store.patch`),
Hinzufügen (`store.insert`) und Löschen mit «Rückgängig» (`store.remove`).

## Supabase
- Schema aller Tabellen und Zugriffsregeln: `supabase/schema.sql` (+ `supabase/budget.sql`)
- Live-Synchronisation für alle Tabellen: `supabase/realtime-aktivieren.sql`
- Zugriff hat nur, wer in `household_members` steht (Funktion `is_household()`).
- Registrierung neuer Benutzer ist im Supabase-Dashboard ausgeschaltet zu lassen.

## Lokal entwickeln
```bash
python3 -m http.server 8080
# → http://localhost:8080
```

## Änderungen veröffentlichen
```bash
git add -A
git commit -m "Beschreibung der Änderung"
git push origin main
```
Zum Anmelden bei GitHub am besten einmalig `gh auth login` (GitHub CLI) verwenden, statt den Token in die Remote-URL zu schreiben.
Nach dem Push deployt GitHub Actions automatisch: https://github.com/timol04/lanatimohome/actions

Wenn sich Dateien ändern, die der Service Worker zwischenspeichert, die Versionsnummer `CACHE` in `sw.js` erhöhen.
