# UI-Standards LanaTimoHome

Alle Grössen, Farben und Bausteine sind in `styles.css` definiert. Keine Inline-Styles im JavaScript,
stattdessen die vorhandenen Klassen und Hilfsfunktionen aus `js/core.js` verwenden.

## Homescreen
- Hintergrund ist ein Foto (`--photo`, `assets/hintergrund.jpg`) mit Abdunkelung `--photo-tint`.
- Kacheln auf dem Foto sind Milchglas: Klasse `.glass` bzw. Tokens `--glass-bg`, `--glass-border`, `--glass-blur`.
- Detailansichten und Popups bleiben deckend (`--bg`), damit Listen gut lesbar sind.
- iPad quer: Info-Spalte links + 3×3 Widgets, hochkant: 2×4, Handy: Info oben + 2 Spalten.

## Icons
- Immer über `icon(name, grösse)` erzeugen, nie `<i data-lucide>` mit eigener Breite/Höhe.
- Grössen: `xs` 14px (Listen, Chips, Stepper) · `sm` 18px (Knöpfe, Header) · `md` 22px (Hauptaktion, Zurück) · `lg` 36px (Leerzustand, Wetter) · `xl` 180px (nur WLAN-QR).
- Aktuelle Lucide-Namen verwenden (`house`, `square-check`, `circle-check`, `circle-alert`), keine alten Aliase.

## Knöpfe
| Baustein | Klasse / Hilfe | Grösse |
| --- | --- | --- |
| Icon-Knopf (Löschen, Link) | `.icon-btn` | 40px |
| Runder Header-Knopf | `.icon-btn .icon-btn-round` | 36px |
| Pille («Erledigte löschen», «Verfolgen») | `.pill-btn`, `clearDoneBtnHtml()` | 36px |
| Hauptaktion neben Eingabe (Plus, Senden) | `.btn-add` | 48px |
| Text-Knopf in Popups | `.btn .btn-primary/.btn-danger` | 48px |

## Listen
- Abhaken: immer `checkHtml(done, onclick)` (runder Haken in Widget-Farbe).
- Löschen: immer `deleteBtnHtml(onclick)` → Papierkorb `trash-2`, Klasse `.item-delete`. Nie `x`.
- Menge: `stepperHtml(qty, fnName, id)`.
- Löschen läuft über `store.remove(ids, label)`, damit «Rückgängig» funktioniert.
- «Erledigte löschen»-Knopf nur zeigen, wenn es etwas Erledigtes gibt.

## Feedback
- Jede Aktion gibt Rückmeldung: `saveWithFeedback(btn, work, okLabel, toastText)` beim Speichern,
  `showToast(text, 'success' | 'error' | 'delete' | 'info')` sonst.
- Fehler beim Speichern nie verschlucken: `store.patch()` setzt bei Fehler zurück und zeigt einen Hinweis.
- Rückfragen nie mit `alert/confirm/prompt`, sondern mit `openModal()` bzw. `confirmModal()`.
