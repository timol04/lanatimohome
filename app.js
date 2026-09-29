/* ============================================================
   LanaTimoHome – app.js
   Dashboard mit Supabase Auth + Realtime-Sync
   ============================================================ */

// ── Supabase Config ───────────────────────────────────────────
const SUPABASE_URL  = 'https://byzlrafovhigellwnyay.supabase.co';
const SUPABASE_ANON = 'sb_publishable_JOqg8swYCaQPhPmPjLpyJA_yZ9DquTx';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── Tab-Konfiguration ─────────────────────────────────────────
const TABS = [
  {
    id:       'shopping',
    label:    'Einkauf',
    icon:     '🛒',
    render:   renderShoppingTab,
    onActivate: initShoppingTab,
  },
  {
    id:       'smarthome',
    label:    'Smart Home',
    icon:     '🏠',
    render:   renderSmartHomeTab,
    onActivate: null,
  },
];

// ── App-State ─────────────────────────────────────────────────
let activeTabId   = TABS[0].id;
let shoppingItems = [];
let realtimeChan  = null;
let currentUser   = null;

// ── Bootstrap ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // Auth-State prüfen
  const { data: { session } } = await db.auth.getSession();
  currentUser = session?.user ?? null;

  if (currentUser) {
    showDashboard();
  } else {
    showLoginScreen();
  }

  // Auth-State-Änderungen lauschen (Login/Logout von aussen)
  db.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user ?? null;
    if (currentUser) {
      showDashboard();
    } else {
      showLoginScreen();
    }
  });

  registerServiceWorker();
});

// ════════════════════════════════════════════════════════════════
// LOGIN SCREEN
// ════════════════════════════════════════════════════════════════

function showLoginScreen() {
  // Realtime abbrechen falls aktiv
  if (realtimeChan) { realtimeChan.unsubscribe(); realtimeChan = null; }

  document.getElementById('app').innerHTML = `
    <div class="login-screen">
      <div class="login-card">
        <div class="login-logo">🏡</div>
        <h1 class="login-title">LanaTimoHome</h1>
        <p class="login-subtitle">Unser gemeinsames Dashboard</p>

        <form id="login-form" class="login-form" novalidate>
          <div class="form-group">
            <label for="login-email">E-Mail</label>
            <input
              type="email"
              id="login-email"
              placeholder="deine@email.ch"
              autocomplete="email"
              required
            />
          </div>

          <div class="form-group">
            <label for="login-password">Passwort</label>
            <div class="pw-wrap">
              <input
                type="password"
                id="login-password"
                placeholder="••••••••"
                autocomplete="current-password"
                required
              />
              <button type="button" id="pw-toggle" class="pw-eye" aria-label="Passwort anzeigen">
                👁
              </button>
            </div>
          </div>

          <div id="login-error" class="login-error" role="alert" style="display:none"></div>

          <button type="submit" id="login-btn" class="btn btn-primary btn-full">
            Anmelden
          </button>
        </form>
      </div>
    </div>
  `;

  // Events
  const form    = document.getElementById('login-form');
  const pwInput = document.getElementById('login-password');
  const pwToggle = document.getElementById('pw-toggle');

  pwToggle.addEventListener('click', () => {
    const isHidden = pwInput.type === 'password';
    pwInput.type = isHidden ? 'text' : 'password';
    pwToggle.textContent = isHidden ? '🙈' : '👁';
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    await handleLogin();
  });

  // Autofocus
  setTimeout(() => document.getElementById('login-email')?.focus(), 100);
}

async function handleLogin() {
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  const btn      = document.getElementById('login-btn');
  const errorEl  = document.getElementById('login-error');

  errorEl.style.display = 'none';
  btn.disabled = true;
  btn.textContent = 'Anmelden…';

  const { error } = await db.auth.signInWithPassword({ email, password });

  if (error) {
    errorEl.textContent = error.message === 'Invalid login credentials'
      ? '❌ E-Mail oder Passwort falsch'
      : `❌ ${error.message}`;
    errorEl.style.display = 'block';
    btn.disabled = false;
    btn.textContent = 'Anmelden';
    return;
  }
  // onAuthStateChange kümmert sich um den Redirect → showDashboard()
}

// ════════════════════════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════════════════════════

function showDashboard() {
  buildUI();
  activateTab(activeTabId);
}

function buildUI() {
  const displayName = currentUser?.email?.split('@')[0] ?? 'Du';

  document.getElementById('app').innerHTML = `
    <nav id="tab-nav" role="tablist" aria-label="Hauptnavigation"></nav>
    <div id="main-col">
      <header id="header">
        <h1>🏡 LanaTimoHome</h1>
        <div class="header-right">
          <div id="realtime-status" title="Realtime-Verbindung">
            <span class="dot"></span>
            <span class="label">Verbinde…</span>
          </div>
          <button id="logout-btn" class="btn-logout" title="Abmelden">
            <span>👤</span>
            <span class="logout-name">${escapeHtml(displayName)}</span>
          </button>
        </div>
      </header>
      <main id="content"></main>
    </div>
    <div id="toast" role="status" aria-live="polite"></div>
  `;

  // Tab-Buttons
  const nav = document.getElementById('tab-nav');
  TABS.forEach(tab => {
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.id = `tab-btn-${tab.id}`;
    btn.setAttribute('role', 'tab');
    btn.setAttribute('aria-selected', 'false');
    btn.innerHTML = `<span class="tab-icon" aria-hidden="true">${tab.icon}</span>
                     <span class="tab-label">${tab.label}</span>`;
    btn.addEventListener('click', () => activateTab(tab.id));
    nav.appendChild(btn);
  });

  // Logout
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await db.auth.signOut();
  });
}

// ── Tab aktivieren ────────────────────────────────────────────
function activateTab(tabId) {
  activeTabId = tabId;
  const tab = TABS.find(t => t.id === tabId);
  if (!tab) return;

  document.querySelectorAll('.tab-btn').forEach(btn => {
    const isActive = btn.id === `tab-btn-${tabId}`;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });

  const content = document.getElementById('content');
  content.innerHTML = '';
  const pane = document.createElement('div');
  pane.className = 'tab-pane active';
  pane.id = `pane-${tabId}`;
  pane.setAttribute('role', 'tabpanel');
  pane.innerHTML = tab.render();
  content.appendChild(pane);

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
      <button id="add-item-btn" class="btn btn-primary" aria-label="Hinzufügen">＋</button>
    </div>

    <div class="shopping-toolbar">
      <h2>
        Einkaufsliste
        <span id="item-count" class="count-badge">0</span>
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
  document.getElementById('add-item-btn').addEventListener('click', () => addItem());
  document.getElementById('new-item-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') addItem();
  });
  document.getElementById('clear-done-btn').addEventListener('click', clearDoneItems);

  await loadShoppingItems();

  if (realtimeChan) realtimeChan.unsubscribe();
  realtimeChan = db
    .channel('shopping_realtime')
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'shopping_items' },
      payload => handleRealtimeEvent(payload)
    )
    .subscribe(status => updateRealtimeStatus(status));
}

async function loadShoppingItems() {
  const { data, error } = await db
    .from('shopping_items')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) { showToast('⚠️ Fehler beim Laden'); renderList([]); return; }
  shoppingItems = data || [];
  renderList(shoppingItems);
}

function handleRealtimeEvent({ eventType, new: n, old: o }) {
  switch (eventType) {
    case 'INSERT':
      if (!shoppingItems.find(i => i.id === n.id)) {
        shoppingItems.push(n);
        shoppingItems.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
        renderList(shoppingItems);
        showToast('✓ Neues Item hinzugefügt');
      }
      break;
    case 'UPDATE':
      shoppingItems = shoppingItems.map(i => i.id === n.id ? n : i);
      renderList(shoppingItems);
      break;
    case 'DELETE':
      shoppingItems = shoppingItems.filter(i => i.id !== o.id);
      renderList(shoppingItems);
      break;
  }
}

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
    .select().single();

  if (error) { showToast('⚠️ Fehler beim Speichern'); return; }
  if (!shoppingItems.find(i => i.id === data.id)) {
    shoppingItems.push(data);
    renderList(shoppingItems);
  }
}

async function toggleItem(id) {
  const item = shoppingItems.find(i => i.id === id);
  if (!item) return;
  const newDone = !item.is_done;
  shoppingItems = shoppingItems.map(i => i.id === id ? { ...i, is_done: newDone } : i);
  renderList(shoppingItems);
  const { error } = await db.from('shopping_items').update({ is_done: newDone }).eq('id', id);
  if (error) {
    shoppingItems = shoppingItems.map(i => i.id === id ? { ...i, is_done: !newDone } : i);
    renderList(shoppingItems);
    showToast('⚠️ Update fehlgeschlagen');
  }
}

async function deleteItem(id) {
  const backup = [...shoppingItems];
  shoppingItems = shoppingItems.filter(i => i.id !== id);
  renderList(shoppingItems);
  const { error } = await db.from('shopping_items').delete().eq('id', id);
  if (error) { shoppingItems = backup; renderList(shoppingItems); showToast('⚠️ Löschen fehlgeschlagen'); }
}

async function clearDoneItems() {
  const doneIds = shoppingItems.filter(i => i.is_done).map(i => i.id);
  if (!doneIds.length) return;
  const backup = [...shoppingItems];
  shoppingItems = shoppingItems.filter(i => !i.is_done);
  renderList(shoppingItems);
  const { error } = await db.from('shopping_items').delete().in('id', doneIds);
  if (error) { shoppingItems = backup; renderList(shoppingItems); showToast('⚠️ Fehler'); return; }
  showToast(`🗑 ${doneIds.length} Item${doneIds.length > 1 ? 's' : ''} gelöscht`);
}

function renderList(items) {
  const list     = document.getElementById('shopping-list');
  const countEl  = document.getElementById('item-count');
  const clearBtn = document.getElementById('clear-done-btn');
  if (!list) return;

  const openCount = items.filter(i => !i.is_done).length;
  const doneCount = items.filter(i => i.is_done).length;
  if (countEl)  countEl.textContent = openCount;
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
  const sorted = [
    ...items.filter(i => !i.is_done),
    ...items.filter(i => i.is_done),
  ];
  sorted.forEach(item => {
    const li = document.createElement('li');
    li.className = `shopping-item${item.is_done ? ' done' : ''}`;
    li.setAttribute('data-id', item.id);
    li.innerHTML = `
      <button class="item-check" aria-label="${item.is_done ? 'Offen markieren' : 'Erledigt markieren'}"
        onclick="toggleItem('${item.id}')">
        <span class="checkmark" aria-hidden="true">✓</span>
      </button>
      <span class="item-text">${escapeHtml(item.text)}</span>
      <button class="item-delete" aria-label="Löschen" onclick="deleteItem('${item.id}')">✕</button>
    `;
    list.appendChild(li);
  });
}

// ════════════════════════════════════════════════════════════════
// TAB: Smart Home
// ════════════════════════════════════════════════════════════════

function renderSmartHomeTab() {
  return `
    <div class="placeholder-container">
      <div class="placeholder-icon">🏠</div>
      <h2>Smart Home</h2>
      <p>Hier kommt später ein<br>Home Assistant Dashboard.</p>
      <span class="placeholder-tag">&lt;iframe src="…"&gt;</span>
    </div>
  `;
}

// ════════════════════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════════════════════

function updateRealtimeStatus(status) {
  const el    = document.getElementById('realtime-status');
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
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .catch(err => console.warn('SW:', err));
  }
}

window.toggleItem = toggleItem;
window.deleteItem = deleteItem;
