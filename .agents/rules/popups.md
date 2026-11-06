# UI Standards: Popups zum Bearbeiten

Einträge, die der Nutzer eingibt (Einkaufsliste, To-Do, Ämtli, Notizen, Countdowns, Pakete, Anschaffungen, Budget), werden per Klick im Popup bearbeitet, nicht inline.

1. **Muster:** Popup-Klassen `budget-modal` / `budget-modal-card` verwenden. Für einfache Listen `EDIT_CONFIG` + `toggleEdit(key, id)` in `app.js` erweitern; neue Listen dort mit `table`, `widget`, `items`, `render`, `del` und `fields` eintragen und den Inhalt des Eintrags mit `onclick="toggleEdit('key','${item.id}')"` klickbar machen.
2. **Farbe:** Der Speichern-Button nimmt `--w-color` des Widgets (kommt von `openOverlay`), keine festen Farben.
3. **Ladeanzeige:** Jeden Speichern-/Hinzufügen-Button über `saveWithFeedback(btn, () => db...)` laufen lassen (Spinner, grün bei Erfolg, rot bei Fehler, Eingaben bleiben bei Fehler erhalten).
4. **Grösse:** Popups bewusst gross (max. 560px, Felder 52px hoch), da die App auf dem iPad bedient wird.
5. **Cache:** Bei Änderungen an app.js/styles.css die `CACHE`-Version in `sw.js` erhöhen.
