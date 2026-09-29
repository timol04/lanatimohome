/* ============================================================
   LanaTimoHome – app.js
   Homescreen-Dashboard mit iOS-Style Widgets
   ============================================================ */

const SUPABASE_URL  = 'https://byzlrafovhigellwnyay.supabase.co';
const SUPABASE_ANON = 'sb_publishable_JOqg8swYCaQPhPmPjLpyJA_yZ9DquTx';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── State ─────────────────────────────────────────────────────
let currentUser = null;
let realtimeChan = null;
let shoppingItems = [];
let todosItems = [];
let notesItems = [];
let currentCarouselPage = 0;
let clockInterval = null;

// ── Widget-Konfiguration ──────────────────────────────────────
const WIDGETS = [
  { id: 'shopping',  title: 'Einkaufsliste', icon: '🛒', preview: 'Wird geladen...', action: openShopping },
  { id: 'todo',      title: 'To-Do',         icon: '✅', preview: 'Wird geladen...', action: openTodos },
  { id: 'calendar',  title: 'Kalender',      icon: '📅', preview: 'Keine Termine', action: () => openPlaceholderOverlay('Kalender') },
  { id: 'weather',   title: 'Wetter',        icon: '⛅️', preview: 'Wird geladen...', action: () => openPlaceholderOverlay('Wetter') },
  { id: 'trash',     title: 'Abfall',        icon: '🗑️', preview: 'Wird geladen...', action: () => openPlaceholderOverlay('Abfallkalender') },
  { id: 'notes',     title: 'Notizen',       icon: '📌', preview: 'Wird geladen...', action: openNotes },
  { id: 'food',      title: 'Essensplan',    icon: '🍽️', preview: 'Kein Plan für heute', action: () => openPlaceholderOverlay('Essensplan') },
  { id: 'smarthome', title: 'Smart Home',    icon: '🏠', preview: 'Kommt später', action: () => openPlaceholderOverlay('Smart Home') },
];

// ── Bootstrap ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await db.auth.getSession();
  currentUser = session?.user ?? null;

  if (currentUser) {
    showDashboard();
  } else {
    showLoginScreen();
  }

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
  if (realtimeChan) { realtimeChan.unsubscribe(); realtimeChan = null; }
  if (clockInterval) clearInterval(clockInterval);

  document.getElementById('app').innerHTML = `
    <div class="login-screen">
      <div class="login-card">
        <div class="login-logo">🏡</div>
        <h1 class="login-title">LanaTimoHome</h1>
        <p class="login-subtitle">Unser gemeinsames Dashboard</p>

        <form id="login-form" class="login-form" novalidate>
          <div class="form-group">
            <label for="login-email">E-Mail</label>
            <input type="email" id="login-email" placeholder="deine@email.ch" required />
          </div>
          <div class="form-group">
            <label for="login-password">Passwort</label>
            <div class="pw-wrap">
              <input type="password" id="login-password" placeholder="••••••••" required />
              <button type="button" id="pw-toggle" class="pw-eye">👁</button>
            </div>
          </div>
          <div id="login-error" class="login-error" style="display:none"></div>
          <button type="submit" id="login-btn" class="btn btn-primary">Anmelden</button>
        </form>
      </div>
    </div>
  `;

  const form = document.getElementById('login-form');
  const pwInput = document.getElementById('login-password');
  const pwToggle = document.getElementById('pw-toggle');

  pwToggle.addEventListener('click', () => {
    const isHidden = pwInput.type === 'password';
    pwInput.type = isHidden ? 'text' : 'password';
    pwToggle.textContent = isHidden ? '🙈' : '👁';
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-btn');
    const errorEl = document.getElementById('login-error');

    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Anmelden…';

    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      errorEl.textContent = error.message === 'Invalid login credentials' ? '❌ Falsche Daten' : `❌ ${error.message}`;
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Anmelden';
    }
  });
}

// ════════════════════════════════════════════════════════════════
// DASHBOARD (HOMESCREEN)
// ════════════════════════════════════════════════════════════════
function showDashboard() {
  document.getElementById('app').innerHTML = `
    <!-- Homescreen -->
    <div id="homescreen-header">
      <div class="header-time" id="clock-time">--:--</div>
      <div class="header-date" id="clock-date">Laden...</div>
      <div class="header-weather" id="header-weather">⛅️ 18°C</div>
    </div>
    
    <div class="carousel-container" id="carousel-container">
      <div class="carousel-track" id="carousel-track">
        <!-- Pages will be injected here -->
      </div>
    </div>

    <div class="page-indicators" id="page-indicators">
      <!-- Dots will be injected here -->
    </div>

    <!-- Overlay Container (für geöffnete Widgets) -->
    <div id="overlay-container">
      <div class="overlay-header">
        <button class="overlay-back" onclick="closeOverlay()">
          <span>‹</span> Zurück
        </button>
        <div class="overlay-title" id="overlay-title">Titel</div>
      </div>
      <div class="overlay-content" id="overlay-content"></div>
    </div>
    
    <div id="toast"></div>
  `;

  startClock();
  renderWidgetGrid();
  initSwipeNavigation();
  
  // Background Tasks
  loadShoppingData(); // For the preview text
  loadTodosData();
  loadNotesData();
}

function startClock() {
  const timeEl = document.getElementById('clock-time');
  const dateEl = document.getElementById('clock-date');
  
  const updateTime = () => {
    const now = new Date();
    timeEl.textContent = now.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
    dateEl.textContent = now.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' });
  };
  
  updateTime();
  clockInterval = setInterval(updateTime, 1000);
}

function renderWidgetGrid() {
  const track = document.getElementById('carousel-track');
  const indicators = document.getElementById('page-indicators');
  track.innerHTML = '';
  indicators.innerHTML = '';

  const widgetsPerPage = 8;
  const pages = Math.ceil(WIDGETS.length / widgetsPerPage);

  for (let i = 0; i < pages; i++) {
    const pageEl = document.createElement('div');
    pageEl.className = 'carousel-page';
    
    const pageWidgets = WIDGETS.slice(i * widgetsPerPage, (i + 1) * widgetsPerPage);
    pageWidgets.forEach(w => {
      const widgetEl = document.createElement('div');
      widgetEl.className = 'widget';
      widgetEl.id = `widget-${w.id}`;
      widgetEl.onclick = w.action;
      widgetEl.innerHTML = `
        <div class="widget-icon">${w.icon}</div>
        <div class="widget-title">${w.title}</div>
        <div class="widget-preview" id="preview-${w.id}">${w.preview}</div>
      `;
      pageEl.appendChild(widgetEl);
    });

    track.appendChild(pageEl);

    // Indicator
    const dot = document.createElement('div');
    dot.className = `indicator-dot ${i === 0 ? 'active' : ''}`;
    indicators.appendChild(dot);
  }
}

function updateWidgetPreview(id, text) {
  const el = document.getElementById(`preview-${id}`);
  if (el) el.textContent = text;
}

// ── Swipe Navigation ──────────────────────────────────────────
function initSwipeNavigation() {
  const container = document.getElementById('carousel-container');
  const track = document.getElementById('carousel-track');
  const indicators = document.getElementById('page-indicators').children;
  
  let startX = 0;
  let currentTranslate = 0;
  let prevTranslate = 0;
  let isDragging = false;
  let animationID;
  const pagesCount = Math.ceil(WIDGETS.length / 8);

  container.addEventListener('touchstart', touchStart);
  container.addEventListener('touchmove', touchMove);
  container.addEventListener('touchend', touchEnd);

  function touchStart(e) {
    startX = e.touches[0].clientX;
    isDragging = true;
    animationID = requestAnimationFrame(animation);
    track.style.transition = 'none';
  }

  function touchMove(e) {
    if (!isDragging) return;
    const currentX = e.touches[0].clientX;
    const diff = currentX - startX;
    currentTranslate = prevTranslate + diff;
  }

  function touchEnd() {
    isDragging = false;
    cancelAnimationFrame(animationID);
    
    const movedBy = currentTranslate - prevTranslate;
    track.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
    
    // Threshold for swipe
    if (movedBy < -50 && currentCarouselPage < pagesCount - 1) {
      currentCarouselPage += 1;
    } else if (movedBy > 50 && currentCarouselPage > 0) {
      currentCarouselPage -= 1;
    }
    
    setPositionByIndex();
  }

  function animation() {
    setSliderPosition();
    if (isDragging) requestAnimationFrame(animation);
  }

  function setSliderPosition() {
    track.style.transform = `translateX(${currentTranslate}px)`;
  }

  function setPositionByIndex() {
    currentTranslate = currentCarouselPage * -window.innerWidth;
    prevTranslate = currentTranslate;
    setSliderPosition();
    
    // Update dots
    Array.from(indicators).forEach((dot, index) => {
      dot.classList.toggle('active', index === currentCarouselPage);
    });
  }
}

// ════════════════════════════════════════════════════════════════
// OVERLAYS (Detail Views)
// ════════════════════════════════════════════════════════════════
function openOverlay(title, renderFn, onInit) {
  const container = document.getElementById('overlay-container');
  document.getElementById('overlay-title').textContent = title;
  const content = document.getElementById('overlay-content');
  
  content.innerHTML = renderFn();
  if (onInit) onInit();
  
  container.classList.add('open');
}

function closeOverlay() {
  document.getElementById('overlay-container').classList.remove('open');
}

function openPlaceholderOverlay(title) {
  openOverlay(title, () => `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text-muted);text-align:center;">
      <div style="font-size:3rem;margin-bottom:16px;">🚧</div>
      <p>Detailansicht für<br><b>${title}</b><br>kommt später.</p>
    </div>
  `);
}

// ════════════════════════════════════════════════════════════════
// SHOPPING LIST WIDGET
// ════════════════════════════════════════════════════════════════
async function loadShoppingData() {
  const { data, error } = await db.from('shopping_items').select('*').order('created_at', { ascending: true });
  if (!error && data) {
    shoppingItems = data;
    updateShoppingPreview();
  }
  
  if (!realtimeChan) {
    realtimeChan = db.channel('shopping_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items' }, payload => {
        handleShoppingRealtime(payload);
      }).subscribe();
  }
}

function updateShoppingPreview() {
  const openCount = shoppingItems.filter(i => !i.is_done).length;
  updateWidgetPreview('shopping', `${openCount} offene Artikel`);
  
  // If overlay is open, re-render list
  if (document.getElementById('overlay-container').classList.contains('open') && document.getElementById('shopping-list')) {
    renderShoppingList();
  }
}

function handleShoppingRealtime({ eventType, new: n, old: o }) {
  if (eventType === 'INSERT' && !shoppingItems.find(i => i.id === n.id)) shoppingItems.push(n);
  if (eventType === 'UPDATE') shoppingItems = shoppingItems.map(i => i.id === n.id ? n : i);
  if (eventType === 'DELETE') shoppingItems = shoppingItems.filter(i => i.id !== o.id);
  updateShoppingPreview();
}

function openShopping() {
  openOverlay('Einkaufsliste', () => `
    <div class="shopping-input-row">
      <input type="text" id="new-item-input" placeholder="Neues Item..." autocomplete="off" />
      <button id="add-item-btn" class="btn btn-primary">＋</button>
    </div>
    <div class="shopping-toolbar">
      <span style="font-weight:600">Artikel</span>
      <button id="clear-done-btn" class="btn btn-danger" style="display:none;height:32px;padding:0 12px;font-size:0.8rem;">
        Erledigte löschen
      </button>
    </div>
    <div id="shopping-list"></div>
  `, () => {
    document.getElementById('add-item-btn').addEventListener('click', addShoppingItem);
    document.getElementById('new-item-input').addEventListener('keydown', e => { if (e.key === 'Enter') addShoppingItem(); });
    document.getElementById('clear-done-btn').addEventListener('click', clearDoneShoppingItems);
    renderShoppingList();
  });
}

function renderShoppingList() {
  const list = document.getElementById('shopping-list');
  const clearBtn = document.getElementById('clear-done-btn');
  if (!list) return;

  const doneCount = shoppingItems.filter(i => i.is_done).length;
  if (clearBtn) clearBtn.style.display = doneCount > 0 ? 'block' : 'none';

  list.innerHTML = '';
  const sorted = [...shoppingItems.filter(i => !i.is_done), ...shoppingItems.filter(i => i.is_done)];
  
  if (sorted.length === 0) {
    list.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:40px;">Liste ist leer</div>`;
    return;
  }

  sorted.forEach(item => {
    const el = document.createElement('div');
    el.className = `shopping-item ${item.is_done ? 'done' : ''}`;
    el.innerHTML = `
      <div class="item-check" onclick="toggleShoppingItem('${item.id}')">✓</div>
      <div class="item-text">${escapeHtml(item.text)}</div>
      <button class="item-delete" onclick="deleteShoppingItem('${item.id}')">✕</button>
    `;
    list.appendChild(el);
  });
}

async function addShoppingItem() {
  const input = document.getElementById('new-item-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  
  // Optimistic update
  const tempId = 'temp-' + Date.now();
  shoppingItems.push({ id: tempId, text, is_done: false, created_at: new Date().toISOString() });
  updateShoppingPreview();

  const { error } = await db.from('shopping_items').insert([{ text, is_done: false }]);
  if (error) showToast('Fehler beim Speichern');
  else loadShoppingData(); // Reload to get real IDs
}

async function toggleShoppingItem(id) {
  const item = shoppingItems.find(i => i.id === id);
  if (!item) return;
  item.is_done = !item.is_done;
  updateShoppingPreview();
  await db.from('shopping_items').update({ is_done: item.is_done }).eq('id', id);
}

async function deleteShoppingItem(id) {
  shoppingItems = shoppingItems.filter(i => i.id !== id);
  updateShoppingPreview();
  await db.from('shopping_items').delete().eq('id', id);
}

async function clearDoneShoppingItems() {
  const doneIds = shoppingItems.filter(i => i.is_done).map(i => i.id);
  shoppingItems = shoppingItems.filter(i => !i.is_done);
  updateShoppingPreview();
  await db.from('shopping_items').delete().in('id', doneIds);
}

// ════════════════════════════════════════════════════════════════
// TODO LIST WIDGET
// ════════════════════════════════════════════════════════════════
let todosChan = null;

async function loadTodosData() {
  const { data, error } = await db.from('todos').select('*').order('created_at', { ascending: true });
  if (!error && data) {
    todosItems = data;
    updateTodosPreview();
  }
  if (!todosChan) {
    todosChan = db.channel('todos_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, payload => {
        handleTodosRealtime(payload);
      }).subscribe();
  }
}

function updateTodosPreview() {
  const openCount = todosItems.filter(i => !i.is_done).length;
  updateWidgetPreview('todo', `${openCount} Aufgaben`);
  if (document.getElementById('overlay-container').classList.contains('open') && document.getElementById('todo-list')) {
    renderTodoList();
  }
}

function handleTodosRealtime({ eventType, new: n, old: o }) {
  if (eventType === 'INSERT' && !todosItems.find(i => i.id === n.id)) todosItems.push(n);
  if (eventType === 'UPDATE') todosItems = todosItems.map(i => i.id === n.id ? n : i);
  if (eventType === 'DELETE') todosItems = todosItems.filter(i => i.id !== o.id);
  updateTodosPreview();
}

function openTodos() {
  openOverlay('To-Do', () => `
    <div class="shopping-input-row">
      <input type="text" id="new-todo-input" placeholder="Neue Aufgabe..." autocomplete="off" />
      <button id="add-todo-btn" class="btn btn-primary">＋</button>
    </div>
    <div class="shopping-toolbar">
      <span style="font-weight:600">Aufgaben</span>
      <button id="clear-done-todo-btn" class="btn btn-danger" style="display:none;height:32px;padding:0 12px;font-size:0.8rem;">
        Erledigte löschen
      </button>
    </div>
    <div id="todo-list"></div>
  `, () => {
    document.getElementById('add-todo-btn').addEventListener('click', addTodoItem);
    document.getElementById('new-todo-input').addEventListener('keydown', e => { if (e.key === 'Enter') addTodoItem(); });
    document.getElementById('clear-done-todo-btn').addEventListener('click', clearDoneTodos);
    renderTodoList();
  });
}

function renderTodoList() {
  const list = document.getElementById('todo-list');
  const clearBtn = document.getElementById('clear-done-todo-btn');
  if (!list) return;

  const doneCount = todosItems.filter(i => i.is_done).length;
  if (clearBtn) clearBtn.style.display = doneCount > 0 ? 'block' : 'none';

  list.innerHTML = '';
  const sorted = [...todosItems.filter(i => !i.is_done), ...todosItems.filter(i => i.is_done)];
  if (sorted.length === 0) {
    list.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:40px;">Alles erledigt! 🎉</div>`;
    return;
  }
  sorted.forEach(item => {
    const el = document.createElement('div');
    el.className = `shopping-item ${item.is_done ? 'done' : ''}`; // We reuse the shopping item styling
    el.innerHTML = `
      <div class="item-check" onclick="toggleTodoItem('${item.id}')">✓</div>
      <div class="item-text">${escapeHtml(item.text)}</div>
      <button class="item-delete" onclick="deleteTodoItem('${item.id}')">✕</button>
    `;
    list.appendChild(el);
  });
}

async function addTodoItem() {
  const input = document.getElementById('new-todo-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  
  const tempId = 'temp-' + Date.now();
  todosItems.push({ id: tempId, text, is_done: false, created_at: new Date().toISOString() });
  updateTodosPreview();

  const { error } = await db.from('todos').insert([{ text, is_done: false }]);
  if (error) showToast('Fehler beim Speichern');
  else loadTodosData();
}

async function toggleTodoItem(id) {
  const item = todosItems.find(i => i.id === id);
  if (!item) return;
  item.is_done = !item.is_done;
  updateTodosPreview();
  await db.from('todos').update({ is_done: item.is_done }).eq('id', id);
}

async function deleteTodoItem(id) {
  todosItems = todosItems.filter(i => i.id !== id);
  updateTodosPreview();
  await db.from('todos').delete().eq('id', id);
}

async function clearDoneTodos() {
  const doneIds = todosItems.filter(i => i.is_done).map(i => i.id);
  todosItems = todosItems.filter(i => !i.is_done);
  updateTodosPreview();
  await db.from('todos').delete().in('id', doneIds);
}

// ════════════════════════════════════════════════════════════════
// NOTES WIDGET
// ════════════════════════════════════════════════════════════════
let notesChan = null;

async function loadNotesData() {
  const { data, error } = await db.from('notes').select('*').order('created_at', { ascending: false });
  if (!error && data) {
    notesItems = data;
    updateNotesPreview();
  }
  if (!notesChan) {
    notesChan = db.channel('notes_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, payload => {
        handleNotesRealtime(payload);
      }).subscribe();
  }
}

function updateNotesPreview() {
  if (notesItems.length > 0) {
    updateWidgetPreview('notes', notesItems[0].text);
  } else {
    updateWidgetPreview('notes', 'Keine Notizen');
  }
  if (document.getElementById('overlay-container').classList.contains('open') && document.getElementById('notes-list')) {
    renderNotesList();
  }
}

function handleNotesRealtime({ eventType, new: n, old: o }) {
  if (eventType === 'INSERT' && !notesItems.find(i => i.id === n.id)) notesItems.unshift(n);
  if (eventType === 'DELETE') notesItems = notesItems.filter(i => i.id !== o.id);
  updateNotesPreview();
}

function openNotes() {
  openOverlay('Notizen', () => `
    <div class="shopping-input-row" style="align-items: flex-start;">
      <textarea id="new-note-input" placeholder="Neue Notiz..." rows="3" style="flex:1; background:var(--bg-input); border:none; border-radius:var(--radius-sm); color:var(--text); padding:12px 16px; font-size:1rem; resize:none; outline:none; font-family:inherit;"></textarea>
      <button id="add-note-btn" class="btn btn-primary" style="height: auto; align-self: stretch;">Senden</button>
    </div>
    <div id="notes-list" style="display:flex; flex-direction:column; gap:12px; margin-top:16px;"></div>
  `, () => {
    document.getElementById('add-note-btn').addEventListener('click', addNoteItem);
    renderNotesList();
  });
}

function renderNotesList() {
  const list = document.getElementById('notes-list');
  if (!list) return;

  list.innerHTML = '';
  if (notesItems.length === 0) {
    list.innerHTML = `<div style="text-align:center;color:var(--text-muted);padding:40px;">Noch keine Notizen.</div>`;
    return;
  }
  notesItems.forEach(item => {
    const el = document.createElement('div');
    const isMe = item.author === (currentUser?.email?.split('@')[0] ?? 'Unbekannt');
    
    el.style.cssText = `
      background: var(--bg-card);
      padding: 16px;
      border-radius: var(--radius-md);
      position: relative;
    `;
    
    const date = new Date(item.created_at).toLocaleString('de-CH', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });

    el.innerHTML = `
      <div style="display:flex; justify-content:space-between; margin-bottom:8px; font-size:0.85rem; color:var(--text-muted);">
        <strong style="color: ${isMe ? 'var(--accent)' : 'var(--text)'};">${escapeHtml(item.author)}</strong>
        <span>${date}</span>
      </div>
      <div style="white-space:pre-wrap; line-height:1.4;">${escapeHtml(item.text)}</div>
      <button class="item-delete" style="position:absolute; top:12px; right:12px; opacity:0.5; padding:4px;" onclick="deleteNoteItem('${item.id}')">✕</button>
    `;
    list.appendChild(el);
  });
}

async function addNoteItem() {
  const input = document.getElementById('new-note-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  
  const author = currentUser?.email?.split('@')[0] ?? 'Unbekannt';
  
  const tempId = 'temp-' + Date.now();
  notesItems.unshift({ id: tempId, text, author, created_at: new Date().toISOString() });
  updateNotesPreview();

  const { error } = await db.from('notes').insert([{ text, author }]);
  if (error) showToast('Fehler beim Speichern');
  else loadNotesData();
}

async function deleteNoteItem(id) {
  notesItems = notesItems.filter(i => i.id !== id);
  updateNotesPreview();
  await db.from('notes').delete().eq('id', id);
}

// ════════════════════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════════════════════
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
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW:', err));
  }
}

window.closeOverlay = closeOverlay;
window.toggleShoppingItem = toggleShoppingItem;
window.deleteShoppingItem = deleteShoppingItem;
window.toggleTodoItem = toggleTodoItem;
window.deleteTodoItem = deleteTodoItem;
window.deleteNoteItem = deleteNoteItem;
