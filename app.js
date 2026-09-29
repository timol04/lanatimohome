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
  { 
    id: 'shopping', title: 'Einkaufsliste', icon: 'shopping-cart', color: 'var(--c-shopping)', action: openShopping,
    renderContent: () => {
      const pending = shoppingItems.filter(i => !i.is_done);
      if(pending.length === 0) return `<div class="mini-placeholder"><i data-lucide="shopping-bag"></i>Alles gekauft</div>`;
      return pending.slice(0, 3).map(i => `<div class="mini-list-item"><i data-lucide="circle"></i><span class="mini-text">${escapeHtml(i.text)}</span></div>`).join('');
    },
    getPreview: () => {
      const c = shoppingItems.filter(i => !i.is_done).length;
      return c === 0 ? 'Alles erledigt' : `${c} offene Artikel`;
    }
  },
  { 
    id: 'todo', title: 'To-Do', icon: 'check-square', color: 'var(--c-todo)', action: openTodos,
    renderContent: () => {
      const pending = todosItems.filter(i => !i.is_done);
      if(pending.length === 0) return `<div class="mini-placeholder"><i data-lucide="check-circle-2"></i>Keine Aufgaben</div>`;
      return pending.slice(0, 3).map(i => `<div class="mini-list-item"><i data-lucide="square"></i><span class="mini-text">${escapeHtml(i.text)}</span></div>`).join('');
    },
    getPreview: () => {
      const c = todosItems.filter(i => !i.is_done).length;
      return c === 0 ? 'Alles erledigt' : `${c} Aufgaben`;
    }
  },
  { 
    id: 'calendar', title: 'Kalender', icon: 'calendar', color: 'var(--c-calendar)', action: () => openPlaceholderOverlay('Kalender', 'var(--c-calendar)', 'calendar'),
    renderContent: () => `<div style="font-weight:500;color:var(--text);font-size:1rem;">Zahnarzt</div><div style="font-size:0.8rem;">Morgen, 14:00 Uhr</div>`,
    getPreview: () => 'Nächster Termin in 1 Tag'
  },
  { 
    id: 'weather', title: 'Wetter', icon: 'cloud-sun', color: 'var(--c-weather)', action: () => openPlaceholderOverlay('Wetter', 'var(--c-weather)', 'cloud-sun'),
    renderContent: () => `<div class="mini-weather-hero"><i data-lucide="cloud-sun"></i> 18°</div>`,
    getPreview: () => 'Später leichter Regen'
  },
  { 
    id: 'trash', title: 'Abfall', icon: 'trash-2', color: 'var(--c-trash)', action: () => openPlaceholderOverlay('Abfallkalender', 'var(--c-trash)', 'trash-2'),
    renderContent: () => `<div class="mini-list-item"><i data-lucide="trash"></i><span class="mini-text" style="color:var(--text);font-weight:500;">Papiersammlung</span></div><div style="font-size:0.8rem;">Diesen Mittwoch</div>`,
    getPreview: () => 'In 2 Tagen'
  },
  { 
    id: 'notes', title: 'Notizen', icon: 'sticky-note', color: 'var(--c-notes)', action: openNotes,
    renderContent: () => {
      if(notesItems.length === 0) return `<div class="mini-placeholder"><i data-lucide="message-square"></i>Keine Notizen</div>`;
      return `<div style="white-space:normal;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;color:var(--text);font-size:0.85rem;">${escapeHtml(notesItems[0].text)}</div>`;
    },
    getPreview: () => notesItems.length > 0 ? `Von ${escapeHtml(notesItems[0].author)}` : 'Leer'
  },
  { 
    id: 'food', title: 'Essensplan', icon: 'utensils', color: 'var(--c-food)', action: () => openPlaceholderOverlay('Essensplan', 'var(--c-food)', 'utensils'),
    renderContent: () => `<div style="font-weight:500;color:var(--text);">Spaghetti Bolognese</div><div style="font-size:0.8rem;">Heute Abend</div>`,
    getPreview: () => 'Alles eingekauft'
  },
  { 
    id: 'smarthome', title: 'Smart Home', icon: 'home', color: 'var(--c-home)', action: () => openPlaceholderOverlay('Smart Home', 'var(--c-home)', 'home'),
    renderContent: () => `
      <div class="mini-smarthome">
        <div class="mini-sm-item"><i data-lucide="lightbulb" style="color:#ffd60a;"></i> 3 an</div>
        <div class="mini-sm-item"><i data-lucide="thermometer"></i> 22°C</div>
      </div>
    `,
    getPreview: () => 'Alles normal'
  },
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
        <div class="login-logo"><i data-lucide="home"></i></div>
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
              <button type="button" id="pw-toggle" class="pw-eye"><i data-lucide="eye"></i></button>
            </div>
          </div>
          <div id="login-error" class="login-error" style="display:none"></div>
          <button type="submit" id="login-btn" class="btn btn-primary">Anmelden</button>
        </form>
      </div>
    </div>
  `;

  lucide.createIcons();

  const form = document.getElementById('login-form');
  const pwInput = document.getElementById('login-password');
  const pwToggle = document.getElementById('pw-toggle');

  pwToggle.addEventListener('click', () => {
    const isHidden = pwInput.type === 'password';
    pwInput.type = isHidden ? 'text' : 'password';
    pwToggle.innerHTML = isHidden ? '<i data-lucide="eye-off"></i>' : '<i data-lucide="eye"></i>';
    lucide.createIcons();
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
      errorEl.innerHTML = error.message === 'Invalid login credentials' ? 'Fehler: Falsche Daten' : `Fehler: ${error.message}`;
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
    <div id="homescreen-header">
      <div class="header-time" id="clock-time">--:--</div>
      <div class="header-date" id="clock-date">Laden...</div>
      <div class="header-weather">
        <i data-lucide="cloud-sun"></i> 18°C
      </div>
    </div>
    
    <div class="carousel-container" id="carousel-container">
      <div class="carousel-track" id="carousel-track"></div>
    </div>
    <div class="page-indicators" id="page-indicators"></div>

    <div id="overlay-container">
      <div class="overlay-header" id="overlay-header">
        <button class="overlay-back" onclick="closeOverlay()">
          <i data-lucide="chevron-left"></i> <span style="font-weight:600">Zurück</span>
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
  
  loadShoppingData(); 
  loadTodosData();
  loadNotesData();

  lucide.createIcons();
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
      widgetEl.style.setProperty('--w-color', w.color);
      widgetEl.innerHTML = `
        <div class="widget-header-row">
          <div class="widget-icon"><i data-lucide="${w.icon}"></i></div>
        </div>
        <div class="widget-content" id="content-${w.id}">${w.renderContent()}</div>
        <div class="widget-footer">
          <div class="widget-title">${w.title}</div>
          <div class="widget-preview" id="preview-${w.id}">${w.getPreview()}</div>
        </div>
      `;
      pageEl.appendChild(widgetEl);
    });

    track.appendChild(pageEl);
    const dot = document.createElement('div');
    dot.className = `indicator-dot ${i === 0 ? 'active' : ''}`;
    indicators.appendChild(dot);
  }
}

// Update specific widget without full re-render
function updateWidgetInGrid(id) {
  const w = WIDGETS.find(x => x.id === id);
  if (!w) return;
  const contentEl = document.getElementById(`content-${id}`);
  const previewEl = document.getElementById(`preview-${id}`);
  if (contentEl) contentEl.innerHTML = w.renderContent();
  if (previewEl) previewEl.textContent = w.getPreview();
  lucide.createIcons();
}

function initSwipeNavigation() {
  const container = document.getElementById('carousel-container');
  const track = document.getElementById('carousel-track');
  const indicators = document.getElementById('page-indicators').children;
  
  let startX = 0, currentTranslate = 0, prevTranslate = 0, isDragging = false, animationID;
  const pagesCount = Math.ceil(WIDGETS.length / 8);

  container.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX; isDragging = true;
    animationID = requestAnimationFrame(animation);
    track.style.transition = 'none';
  });

  container.addEventListener('touchmove', e => {
    if (!isDragging) return;
    currentTranslate = prevTranslate + (e.touches[0].clientX - startX);
  });

  container.addEventListener('touchend', () => {
    isDragging = false; cancelAnimationFrame(animationID);
    const movedBy = currentTranslate - prevTranslate;
    track.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
    if (movedBy < -50 && currentCarouselPage < pagesCount - 1) currentCarouselPage += 1;
    else if (movedBy > 50 && currentCarouselPage > 0) currentCarouselPage -= 1;
    
    currentTranslate = currentCarouselPage * -window.innerWidth;
    prevTranslate = currentTranslate;
    track.style.transform = `translateX(${currentTranslate}px)`;
    Array.from(indicators).forEach((dot, index) => dot.classList.toggle('active', index === currentCarouselPage));
  });

  function animation() {
    track.style.transform = `translateX(${currentTranslate}px)`;
    if (isDragging) requestAnimationFrame(animation);
  }
}

// ════════════════════════════════════════════════════════════════
// OVERLAYS (Detail Views)
// ════════════════════════════════════════════════════════════════
function openOverlay(title, color, renderFn, onInit) {
  const container = document.getElementById('overlay-container');
  const header = document.getElementById('overlay-header');
  
  container.style.setProperty('--w-color', color);
  document.getElementById('overlay-title').textContent = title;
  
  const content = document.getElementById('overlay-content');
  content.innerHTML = renderFn();
  if (onInit) onInit();
  
  lucide.createIcons();
  container.classList.add('open');
}

function closeOverlay() {
  document.getElementById('overlay-container').classList.remove('open');
}

function openPlaceholderOverlay(title, color, iconName) {
  openOverlay(title, color, () => `
    <div class="empty-state">
      <div class="empty-icon"><i data-lucide="${iconName}"></i></div>
      <h3>${title}</h3>
      <p>Diese Ansicht wird bald entwickelt. Freu dich drauf!</p>
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
    updateWidgetInGrid('shopping');
  }
  if (!realtimeChan) {
    realtimeChan = db.channel('shopping_realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items' }, payload => {
      if (payload.eventType === 'INSERT' && !shoppingItems.find(i => i.id === payload.new.id)) shoppingItems.push(payload.new);
      if (payload.eventType === 'UPDATE') shoppingItems = shoppingItems.map(i => i.id === payload.new.id ? payload.new : i);
      if (payload.eventType === 'DELETE') shoppingItems = shoppingItems.filter(i => i.id !== payload.old.id);
      updateWidgetInGrid('shopping');
      if (document.getElementById('overlay-container').classList.contains('open') && document.getElementById('shopping-list')) renderShoppingList();
    }).subscribe();
  }
}

function openShopping() {
  openOverlay('Einkaufsliste', 'var(--c-shopping)', () => `
    <div class="input-row">
      <input type="text" id="new-item-input" placeholder="Neues Item..." autocomplete="off" />
      <button id="add-item-btn" class="btn-compact"><i data-lucide="plus"></i></button>
    </div>
    <div class="list-toolbar">
      <span>Artikel</span>
      <button id="clear-done-btn" class="btn-text" style="display:none;"><i data-lucide="trash-2" style="width:14px;height:14px;"></i> Erledigte löschen</button>
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
  if (clearBtn) clearBtn.style.display = doneCount > 0 ? 'flex' : 'none';

  list.innerHTML = '';
  const sorted = [...shoppingItems.filter(i => !i.is_done), ...shoppingItems.filter(i => i.is_done)];
  
  if (sorted.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i data-lucide="shopping-bag"></i></div>
        <h3>Alles eingekauft!</h3>
        <p>Der Kühlschrank ist voll. Füge oben neue Artikel hinzu.</p>
      </div>`;
    lucide.createIcons();
    return;
  }

  sorted.forEach(item => {
    const el = document.createElement('div');
    el.className = `list-item ${item.is_done ? 'done' : ''}`;
    el.innerHTML = `
      <div class="item-check" onclick="toggleShoppingItem('${item.id}')"><i data-lucide="check" style="width:16px;height:16px;"></i></div>
      <div class="item-text">${escapeHtml(item.text)}</div>
      <button class="item-delete" onclick="deleteShoppingItem('${item.id}')"><i data-lucide="x" style="width:16px;height:16px;"></i></button>
    `;
    list.appendChild(el);
  });

  lucide.createIcons();
}

async function addShoppingItem() {
  const input = document.getElementById('new-item-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  
  const tempId = 'temp-' + Date.now();
  shoppingItems.push({ id: tempId, text, is_done: false, created_at: new Date().toISOString() });
  updateWidgetInGrid('shopping');
  renderShoppingList();

  const { error } = await db.from('shopping_items').insert([{ text, is_done: false }]);
  if (error) showToast('Fehler beim Speichern');
  else loadShoppingData();
}

async function toggleShoppingItem(id) {
  const item = shoppingItems.find(i => i.id === id);
  if (!item) return;
  item.is_done = !item.is_done;
  updateWidgetInGrid('shopping');
  renderShoppingList();
  await db.from('shopping_items').update({ is_done: item.is_done }).eq('id', id);
}

async function deleteShoppingItem(id) {
  shoppingItems = shoppingItems.filter(i => i.id !== id);
  updateWidgetInGrid('shopping');
  renderShoppingList();
  await db.from('shopping_items').delete().eq('id', id);
}

async function clearDoneShoppingItems() {
  const doneIds = shoppingItems.filter(i => i.is_done).map(i => i.id);
  shoppingItems = shoppingItems.filter(i => !i.is_done);
  updateWidgetInGrid('shopping');
  renderShoppingList();
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
    updateWidgetInGrid('todo');
  }
  if (!todosChan) {
    todosChan = db.channel('todos_realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, payload => {
      if (payload.eventType === 'INSERT' && !todosItems.find(i => i.id === payload.new.id)) todosItems.push(payload.new);
      if (payload.eventType === 'UPDATE') todosItems = todosItems.map(i => i.id === payload.new.id ? payload.new : i);
      if (payload.eventType === 'DELETE') todosItems = todosItems.filter(i => i.id !== payload.old.id);
      updateWidgetInGrid('todo');
      if (document.getElementById('overlay-container').classList.contains('open') && document.getElementById('todo-list')) renderTodoList();
    }).subscribe();
  }
}

function openTodos() {
  openOverlay('To-Do', 'var(--c-todo)', () => `
    <div class="input-row">
      <input type="text" id="new-todo-input" placeholder="Neue Aufgabe..." autocomplete="off" />
      <button id="add-todo-btn" class="btn-compact"><i data-lucide="plus"></i></button>
    </div>
    <div class="list-toolbar">
      <span>Aufgaben</span>
      <button id="clear-done-todo-btn" class="btn-text" style="display:none;"><i data-lucide="trash-2" style="width:14px;height:14px;"></i> Erledigte löschen</button>
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
  if (clearBtn) clearBtn.style.display = doneCount > 0 ? 'flex' : 'none';

  list.innerHTML = '';
  const sorted = [...todosItems.filter(i => !i.is_done), ...todosItems.filter(i => i.is_done)];
  if (sorted.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i data-lucide="check-circle-2"></i></div>
        <h3>Alles erledigt! 🎉</h3>
        <p>Genieße den Tag, du hast keine offenen Aufgaben mehr.</p>
      </div>`;
    lucide.createIcons();
    return;
  }
  sorted.forEach(item => {
    const el = document.createElement('div');
    el.className = `list-item ${item.is_done ? 'done' : ''}`;
    el.innerHTML = `
      <div class="item-check" onclick="toggleTodoItem('${item.id}')"><i data-lucide="check" style="width:16px;height:16px;"></i></div>
      <div class="item-text">${escapeHtml(item.text)}</div>
      <button class="item-delete" onclick="deleteTodoItem('${item.id}')"><i data-lucide="x" style="width:16px;height:16px;"></i></button>
    `;
    list.appendChild(el);
  });
  
  lucide.createIcons();
}

async function addTodoItem() {
  const input = document.getElementById('new-todo-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  
  const tempId = 'temp-' + Date.now();
  todosItems.push({ id: tempId, text, is_done: false, created_at: new Date().toISOString() });
  updateWidgetInGrid('todo');
  renderTodoList();

  const { error } = await db.from('todos').insert([{ text, is_done: false }]);
  if (error) showToast('Fehler beim Speichern');
  else loadTodosData();
}

async function toggleTodoItem(id) {
  const item = todosItems.find(i => i.id === id);
  if (!item) return;
  item.is_done = !item.is_done;
  updateWidgetInGrid('todo');
  renderTodoList();
  await db.from('todos').update({ is_done: item.is_done }).eq('id', id);
}

async function deleteTodoItem(id) {
  todosItems = todosItems.filter(i => i.id !== id);
  updateWidgetInGrid('todo');
  renderTodoList();
  await db.from('todos').delete().eq('id', id);
}

async function clearDoneTodos() {
  const doneIds = todosItems.filter(i => i.is_done).map(i => i.id);
  todosItems = todosItems.filter(i => !i.is_done);
  updateWidgetInGrid('todo');
  renderTodoList();
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
    updateWidgetInGrid('notes');
  }
  if (!notesChan) {
    notesChan = db.channel('notes_realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, payload => {
      if (payload.eventType === 'INSERT' && !notesItems.find(i => i.id === payload.new.id)) notesItems.unshift(payload.new);
      if (payload.eventType === 'DELETE') notesItems = notesItems.filter(i => i.id !== payload.old.id);
      updateWidgetInGrid('notes');
      if (document.getElementById('overlay-container').classList.contains('open') && document.getElementById('notes-list')) renderNotesList();
    }).subscribe();
  }
}

function openNotes() {
  openOverlay('Notizen', 'var(--c-notes)', () => `
    <div class="input-row">
      <textarea id="new-note-input" placeholder="Neue Notiz schreiben..." rows="2"></textarea>
      <button id="add-note-btn" class="btn-compact" style="height: auto;"><i data-lucide="send"></i></button>
    </div>
    <div id="notes-list"></div>
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
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i data-lucide="message-square"></i></div>
        <h3>Noch keine Notizen</h3>
        <p>Hinterlasse dem anderen eine kurze Nachricht.</p>
      </div>`;
    lucide.createIcons();
    return;
  }
  notesItems.forEach(item => {
    const el = document.createElement('div');
    el.className = 'note-card';
    const isMe = item.author === (currentUser?.email?.split('@')[0] ?? 'Unbekannt');
    const date = new Date(item.created_at).toLocaleString('de-CH', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });

    el.innerHTML = `
      <div class="note-header">
        <strong class="${isMe ? 'is-me' : ''}">${escapeHtml(item.author)}</strong>
        <span>${date}</span>
      </div>
      <div class="note-body">${escapeHtml(item.text)}</div>
      <button class="note-delete" onclick="deleteNoteItem('${item.id}')"><i data-lucide="x" style="width:16px;height:16px;"></i></button>
    `;
    list.appendChild(el);
  });
  
  lucide.createIcons();
}

async function addNoteItem() {
  const input = document.getElementById('new-note-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  
  const author = currentUser?.email?.split('@')[0] ?? 'Unbekannt';
  const tempId = 'temp-' + Date.now();
  notesItems.unshift({ id: tempId, text, author, created_at: new Date().toISOString() });
  updateWidgetInGrid('notes');
  renderNotesList();

  const { error } = await db.from('notes').insert([{ text, author }]);
  if (error) showToast('Fehler beim Speichern');
  else loadNotesData();
}

async function deleteNoteItem(id) {
  notesItems = notesItems.filter(i => i.id !== id);
  updateWidgetInGrid('notes');
  renderNotesList();
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
