/* ============================================================
   LanaTimoHome – edit.js
   Eintrag antippen → Popup zum Bearbeiten (Farbe kommt vom Widget)
   ============================================================ */

const personOptions = () => ({ '': 'Beide', ...Object.fromEntries(PEOPLE_NAMES.map(n => [n, n])) });
const recurrenceOptions = () => ({ '': 'Einmalig', ...Object.fromEntries(RECURRENCES.map(r => [r, r])) });

// Für Ämtli und To-Dos werden die Felder aus dem Text gelesen und beim Speichern wieder zusammengesetzt
const taskToFields = item => {
  const t = parseTask(item.text);
  return { title: t.title, assignee: t.assignee, recurrence: t.recurrence, due: t.due ? toIsoDate(t.due) : '' };
};

const EDIT_CONFIG = {
  shopping: {
    store: () => shoppingStore, label: 'Artikel',
    fields: [{ k: 'text', label: 'Artikel', type: 'textarea', rows: 3 }],
    del: id => deleteShoppingItem(id)
  },
  todo: {
    store: () => todoStore, label: 'Aufgabe',
    fields: [{ k: 'title', label: 'Aufgabe' }, { k: 'due', label: 'Fällig am', type: 'date', optional: true }],
    toFields: taskToFields,
    fromFields: f => ({ text: composeTask({ title: f.title, due: f.due || null }) }),
    del: id => deleteTodoItem(id)
  },
  chores: {
    store: () => choresStore, label: 'Ämtli',
    fields: () => [
      { k: 'title', label: 'Ämtli' },
      { k: 'assignee', label: 'Wer?', type: 'segmented', options: personOptions(), optional: true },
      { k: 'recurrence', label: 'Wiederholung', type: 'segmented', options: recurrenceOptions(), optional: true },
      { k: 'due', label: 'Nächstes Mal fällig', type: 'date', optional: true }
    ],
    toFields: taskToFields,
    fromFields: f => ({ text: composeTask({ title: f.title, assignee: f.assignee, recurrence: f.recurrence, due: f.due || null }) }),
    del: id => deleteChore(id)
  },
  notes: {
    store: () => notesStore, label: 'Notiz',
    fields: [{ k: 'text', label: 'Notiz', type: 'textarea', rows: 5 }],
    del: id => deleteNoteItem(id)
  },
  countdown: {
    store: () => countdownStore, label: 'Countdown',
    fields: [{ k: 'title', label: 'Ereignis' }, { k: 'date', label: 'Datum', type: 'date' }],
    del: id => deleteCountdown(id)
  },
  packages: {
    store: () => packagesStore, label: 'Paket',
    fields: () => [
      { k: 'title', label: 'Bestellung' },
      { k: 'courier', label: 'Anbieter', type: 'select', options: courierOptions() },
      { k: 'tracking_number', label: 'Tracking-Nummer', optional: true }
    ],
    del: id => deletePackage(id)
  },
  wishlist: {
    store: () => wishlistStore, label: 'Wunsch',
    fields: [
      { k: 'title', label: 'Titel' },
      { k: 'url', label: 'Link', type: 'url', optional: true },
      { k: 'price', label: 'Preis (z.B. 499 CHF)', optional: true },
      { k: 'color', label: 'Farbe', optional: true },
      { k: 'prio', label: 'Priorität', type: 'segmented', options: { 0: 'Keine', 1: 'Prio 1', 2: 'Prio 2', 3: 'Prio 3' }, optional: true }
    ],
    toFields: item => ({ ...item, prio: String(item.prio || 0) }),
    fromFields: f => ({ ...f, url: safeUrl(f.url) || null, prio: parseInt(f.prio, 10) || 0 }),
    del: id => deleteWish(id)
  }
};

function openEditModal(key, id) {
  const cfg = EDIT_CONFIG[key];
  const store = cfg.store();
  const item = store.find(id);
  if (!item) return;
  const fields = typeof cfg.fields === 'function' ? cfg.fields() : cfg.fields;
  const values = cfg.toFields ? cfg.toFields(item) : item;

  openModal({
    title: `${cfg.label} bearbeiten`,
    body: fields.map(f => fieldHtml(f, values[f.k])).join(''),
    onOpen: initSegmented,
    actions: [
      { id: 'del', icon: 'trash-2', kind: 'danger', aria: 'Löschen', onClick: () => { closeModal(); cfg.del(item.id); } },
      {
        id: 'save', label: 'Speichern', kind: 'primary',
        onClick: async (btn, modal) => {
          const raw = readFields(modal, fields);
          if (!raw) return;
          const row = cfg.fromFields ? cfg.fromFields(raw) : raw;
          const ok = await saveWithFeedback(btn, async () => ({ error: (await store.patch(item.id, row)) ? null : new Error('Speichern fehlgeschlagen') }), 'Gespeichert');
          if (ok) setTimeout(() => closeModal(), 500); // bei Fehler bleibt das Popup offen, Eingaben bleiben erhalten
        }
      }
    ]
  });
}
