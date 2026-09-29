/* ============================================================
   LanaTimoHome – app.js
   Einkaufsliste-Dashboard mit Supabase Realtime-Sync
   ============================================================ */

// ── Supabase Config ───────────────────────────────────────────
// Deine Supabase-URL und Anon-Key hier eintragen:
const SUPABASE_URL  = 'https://byzlrafovhigellwnyay.supabase.co';
const SUPABASE_ANON = 'DEIN_SUPABASE_ANON_KEY_HIER_EINFÜGEN';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── Tab-Konfiguration ─────────────────────────────────────────
// Neue Tabs einfach hier hinzufügen – kein weiterer Code nötig
const TABS = [
  {
    id:     'shopping',
    label:  'Einkauf',
    icon:   '🛒',
    render: renderShoppingTab,
    onActivate: initShoppingTab,
  },
  {
    id:     'smarthome',
    label:  'Smart Home',
    icon:   '🏠',
    render: renderSmartHomeTab,
    onActivate: null,
  },
  // ── Hier neue Tabs ergänzen ──
  // {
  //   id:     'calendar',
  //   label:  'Kalender',
  //   icon:   '📅',
  //   render: renderCalendarTab,
  //   onActivate: initCalendarTab,
  // },
];

// ── App-State ─────────────────────────────────────────────────
let activeTabId     = TABS[0].id;
let shoppingItems   = [];
let realtimeChan    = null;
let isShoppingInited = false;

// ── Bootstrap ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  buildUI();
  activateTab(activeTabId);
  registerServiceWorker();
});

// ── UI aufbauen ───────────────────────────────────────────────
function buildUI() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <nav id="tab-nav" role="tablist" aria-label="Hauptnavigation"></nav>
    <div id="main-col">
      <header id="header">
        <h1>🏡 LanaTimoHome</h1>
        <div id="realtime-status" title="Realtime-Verbindung">
          <span class="dot"></span>
          <span class="label">Verbinde…</span>
        </div>
      </header>
      <main id="content"></main>
    </div>
    <div id="toast" role="status" aria-live="polite"></div>
  `;

  // Tab-Buttons generieren
  const nav = document.getElementById('tab-nav');
  TABS.forEach(tab => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.id = `tab-btn-${tab.id}`;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', 'false');
    btn.setAttribute('aria-controls', `pane-${tab.id}`);
    btn.innerHTML = `<span class="tab-icon" aria-hidden="true">${tab.icon}</span>
                     <span class="tab-label">${tab.label}</span>`;
    btn.addEventListener('click', () => activateTab(tab.id));
    nav.appendChild(btn);
  });
}

// ── Tab aktivieren ────────────────────────────────────────────
function activateTab(tabId) {
  activeTabId = tabId;
  const tab = TABS.find(t => t.id === tabId);
  if (!tab) return;

  // Buttons updaten
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const isActive = btn.id === `tab-btn-${tabId}`;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });

  // Content rendern
  const content = document.getElementById('content');
  content.innerHTML = '';
  const pane = document.createElement('div');
  pane.className = 'tab-pane active';
  pane.id = `pane-${tabId}`;
  pane.setAttribute('role', 'tabpanel');
  pane.innerHTML = tab.render();
  content.appendChild(pane);

  // Tab-spezifische Init
  if (tab.onActivate) tab.onActivate();
}

// ════════════════════════════════════════════════════════════════
// TAB: Einkaufsliste
// ════════════════════════════════════════════════════════════════

function renderShoppingTab() {
  return `
    <div class="shopping-input-row">
      <input
        type="text"
        id="new-item-input"
        placeholder="Neues Item hinzufügen…"
        autocomplete="off"
        autocorrect="off"
        spellcheck="false"
        maxlength="200"
        aria-label="Neues Einkaufsitem"
      />
      <button id="add-item-btn" class="btn btn-primary" aria-label="Hinzufügen">
        ＋
      </button>
    </div>

    <div class="shopping-toolbar">
      <h2>
        Einkaufsliste
        <span id="item-count" class="count-badge" aria-label="Anzahl offene Items">0</span>
      </h2>
      <button id="clear-done-btn" class="btn btn-danger" style="display:none">
        🗑 Erledigte löschen
      </button>
    </div>

    <ul id="shopping-list" aria-label="Einkaufsliste" role="list">
      <li class="skeleton-item"></li>
      <li class="skeleton-item" style="width:80%"></li>
      <li class="skeleton-item" style="width:60%"></li>
    </ul>
  `;
}

async function initShoppingTab() {
  // Events binden
  const input  = document.getElementById('new-item-input');
  const addBtn = document.getElementById('add-item-btn');
  const clearBtn = document.getElementById('clear-done-btn');

  addBtn.addEventListener('click', () => addItem());
  input.addEventListener('keydown', e => { if (e.key === 'Enter') addItem(); });
  clearBtn.addEventListener('click', () => clearDoneItems());

  // Daten laden
  await loadShoppingItems();

  // Realtime Subscription
  if (realtimeChan) realtimeChan.unsubscribe();
  realtimeChan = db
    .channel('shopping_realtime')
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'shopping_items' },
      payload => handleRealtimeEvent(payload)
    )
    .subscribe(status => updateRealtimeStatus(status));
}

// ── Daten laden ───────────────────────────────────────────────
async function loadShoppingItems() {
  const { data, error } = await db
    .from('shopping_items')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Supabase error:', error);
    showToast('⚠️ Fehler beim Laden');
    renderList([]);
    return;
  }

  shoppingItems = data || [];
  renderList(shoppingItems);
}

// ── Realtime Events ───────────────────────────────────────────
function handleRealtimeEvent(payload) {
  const { eventType, new: newRow, old: oldRow } = payload;

  switch (eventType) {
    case 'INSERT':
      if (!shoppingItems.find(i => i.id === newRow.id)) {
        shoppingItems.push(newRow);
        shoppingItems.sort((a, b) =>
          new Date(a.created_at) - new Date(b.created_at));
        renderList(shoppingItems);
        showToast('✓ Neues Item hinzugefügt');
      }
      break;
    case 'UPDATE':
      shoppingItems = shoppingItems.map(i =>
        i.id === newRow.id ? newRow : i);
      renderList(shoppingItems);
      break;
    case 'DELETE':
      shoppingItems = shoppingItems.filter(i => i.id !== oldRow.id);
      renderList(shoppingItems);
      break;
  }
}

// ── Item hinzufügen ───────────────────────────────────────────
async function addItem() {
  const input = document.getElementById('new-item-input');
  if (!input) return;
  const text = input.value.trim();
  if (!text) return;

  input.value = '';
  input.focus();

  const { data, error } = await db
    .from('shopping_items')
    .insert([{ text, is_done: false }])
    .select()
    .single();

  if (error) {
    console.error(error);
    showToast('⚠️ Fehler beim Speichern');
    return;
  }

  // Optimistisch hinzufügen (Realtime ergänzt es evtl. nochmal – Deduplizierung via ID)
  if (!shoppingItems.find(i => i.id === data.id)) {
    shoppingItems.push(data);
    renderList(shoppingItems);
  }
}

// ── Item abhaken ──────────────────────────────────────────────
async function toggleItem(id) {
  const item = shoppingItems.find(i => i.id === id);
  if (!item) return;

  const newDone = !item.is_done;

  // Optimistisches Update
  shoppingItems = shoppingItems.map(i =>
    i.id === id ? { ...i, is_done: newDone } : i);
  renderList(shoppingItems);

  const { error } = await db
    .from('shopping_items')
    .update({ is_done: newDone })
    .eq('id', id);

  if (error) {
    console.error(error);
    // Rollback
    shoppingItems = shoppingItems.map(i =>
      i.id === id ? { ...i, is_done: !newDone } : i);
    renderList(shoppingItems);
    showToast('⚠️ Update fehlgeschlagen');
  }
}

// ── Item löschen ──────────────────────────────────────────────
async function deleteItem(id) {
  // Optimistisch entfernen
  const backup = [...shoppingItems];
  shoppingItems = shoppingItems.filter(i => i.id !== id);
  renderList(shoppingItems);

  const { error } = await db
    .from('shopping_items')
    .delete()
    .eq('id', id);

  if (error) {
    console.error(error);
    shoppingItems = backup;
    renderList(shoppingItems);
    showToast('⚠️ Löschen fehlgeschlagen');
  }
}

// ── Erledigte löschen ─────────────────────────────────────────
async function clearDoneItems() {
  const doneIds = shoppingItems.filter(i => i.is_done).map(i => i.id);
  if (!doneIds.length) return;

  const backup = [...shoppingItems];
  shoppingItems = shoppingItems.filter(i => !i.is_done);
  renderList(shoppingItems);

  const { error } = await db
    .from('shopping_items')
    .delete()
    .in('id', doneIds);

  if (error) {
    console.error(error);
    shoppingItems = backup;
    renderList(shoppingItems);
    showToast('⚠️ Fehler beim Löschen');
    return;
  }

  showToast(`🗑 ${doneIds.length} Item${doneIds.length > 1 ? 's' : ''} gelöscht`);
}

// ── Liste rendern ─────────────────────────────────────────────
function renderList(items) {
  const list = document.getElementById('shopping-list');
  const countEl = document.getElementById('item-count');
  const clearBtn = document.getElementById('clear-done-btn');
  if (!list) return;

  const openCount = items.filter(i => !i.is_done).length;
  const doneCount = items.filter(i => i.is_done).length;

  if (countEl) countEl.textContent = openCount;
  if (clearBtn) clearBtn.style.display = doneCount > 0 ? 'inline-flex' : 'none';

  if (items.length === 0) {
    list.innerHTML = `
      <li class="empty-state">
        <span class="empty-icon">🛍️</span>
        <p>Noch nichts auf der Liste.<br>Füge das erste Item hinzu!</p>
      </li>`;
    return;
  }

  list.innerHTML = '';

  // Offene Items zuerst, dann erledigte
  const sorted = [
    ...items.filter(i => !i.is_done),
    ...items.filter(i => i.is_done),
  ];

  sorted.forEach(item => {
    const li = document.createElement('li');
    li.className = `shopping-item${item.is_done ? ' done' : ''}`;
    li.setAttribute('data-id', item.id);
    li.setAttribute('role', 'listitem');
    li.innerHTML = `
      <button
        class="item-check"
        aria-label="${item.is_done ? 'Als offen markieren' : 'Als erledigt markieren'}"
        onclick="toggleItem('${item.id}')"
      >
        <span class="checkmark" aria-hidden="true">✓</span>
      </button>
      <span class="item-text">${escapeHtml(item.text)}</span>
      <button
        class="item-delete"
        aria-label="Löschen"
        onclick="deleteItem('${item.id}')"
      >✕</button>
    `;
    list.appendChild(li);
  });
}

// ════════════════════════════════════════════════════════════════
// TAB: Smart Home (Platzhalter)
// ════════════════════════════════════════════════════════════════

function renderSmartHomeTab() {
  return `
    <div class="placeholder-container">
      <div class="placeholder-icon">🏠</div>
      <h2>Smart Home</h2>
      <p>Hier kommt später ein<br>Home Assistant Dashboard.</p>
      <span class="placeholder-tag">&lt;iframe src="…"&gt;</span>
      <p style="font-size:0.8rem; margin-top:8px; opacity:0.6">
        Einfach die render-Funktion in app.js anpassen.
      </p>
    </div>
  `;
}

// ════════════════════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════════════════════

function updateRealtimeStatus(status) {
  const el = document.getElementById('realtime-status');
  const label = el?.querySelector('.label');
  if (!el) return;

  if (status === 'SUBSCRIBED') {
    el.classList.add('connected');
    if (label) label.textContent = 'Live';
  } else {
    el.classList.remove('connected');
    if (label) label.textContent = 'Offline';
  }
}

let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ── Service Worker registrieren ───────────────────────────────
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err =>
      console.warn('SW registration failed:', err));
  }
}

// Globale Funktionen (für inline onclick-Handler im HTML)
window.toggleItem = toggleItem;
window.deleteItem = deleteItem;
