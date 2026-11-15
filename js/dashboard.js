/* ============================================================
   LanaTimoHome – dashboard.js
   Homescreen: Kopfzeile, Widget-Raster, Karussell, Abfahrten,
   Tageswechsel und Neu-Synchronisation
   ============================================================ */

let currentCarouselPage = 0;
let clockInterval = null;
let dashboardIntervals = [];
let lastDayKey = new Date().toDateString();

function showDashboard() {
  document.getElementById('app').innerHTML = `
    <div id="homescreen-header">
      <div class="header-clock">
        <div class="header-time" id="clock-time">--:--</div>
        <div class="header-date" id="clock-date">Laden…</div>
        <div class="header-weather" id="header-weather">${icon('cloud-sun', 'sm')}<span>--°C</span></div>
      </div>
      <div class="tram-board glass" id="tram-board">${tramTitleHtml()}</div>
      <div class="header-tools">
        <button class="icon-btn icon-btn-round" onclick="reloadApp()" title="Neu laden" aria-label="Neu laden">${icon('refresh-cw', 'xs')}</button>
        <button class="icon-btn icon-btn-round" onclick="toggleTheme()" title="Hell/Dunkel" aria-label="Hell/Dunkel wechseln">${icon(currentTheme() === 'light' ? 'moon' : 'sun', 'xs', 'theme-icon')}</button>
        <button class="icon-btn icon-btn-round" onclick="event.stopPropagation(); startScreensaver()" title="Screensaver starten" aria-label="Screensaver starten">${icon('image', 'xs')}</button>
        <span class="offline-pill" id="offline-pill" ${navigator.onLine ? 'hidden' : ''}>${icon('wifi-off', 'xs')}Offline</span>
      </div>
    </div>

    <div class="carousel-container" id="carousel-container">
      <div class="carousel-track" id="carousel-track"></div>
      <div class="drag-edge drag-edge-left" id="drag-edge-left">${icon('chevron-left', 'md')}</div>
      <div class="drag-edge drag-edge-right" id="drag-edge-right">${icon('chevron-right', 'md')}</div>
    </div>
    <div class="page-indicators" id="page-indicators"></div>

    <div id="overlay-container">
      <div class="overlay-header">
        <button class="overlay-back" onclick="closeOverlay()">${icon('chevron-left', 'md')}<span>Zurück</span></button>
        <div class="overlay-title" id="overlay-title">Titel</div>
      </div>
      <div class="overlay-content" id="overlay-content"></div>
    </div>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>`;

  sortWidgets();
  startClock();
  renderWidgetGrid();
  initSwipeNavigation();
  loadAllData();
  loadTramDepartures();
  loadWeather();
  updateGreeting();

  dashboardIntervals.forEach(clearInterval);
  dashboardIntervals = [
    setInterval(loadTramDepartures, 60000),            // Abfahrten jede Minute
    setInterval(updateGreeting, 10 * 60000),           // Begrüssung alle 10 Minuten
    setInterval(loadWeather, 30 * 60000),              // Wetter alle 30 Minuten
    setInterval(loadScreensaverImages, 24 * 3600000),  // Signierte Bild-Links täglich erneuern
    setInterval(checkNewDay, 60000)                    // Tageswechsel erkennen
  ];
  refreshIcons();
  resetActivityTimers();
}

function stopDashboard() {
  clearInterval(clockInterval);
  dashboardIntervals.forEach(clearInterval);
  dashboardIntervals = [];
  stores.forEach(s => s.unsubscribe());
}

function reloadApp() {
  flushDeletes();
  window.location.reload();
}

// ── Daten laden & neu synchronisieren ────────────────────────
async function loadAllData() {
  await Promise.all(stores.map(async s => {
    const ok = await s.load();
    if (ok && s.afterLoad) await s.afterLoad();
  }));
  updateGreetingSubtitle();
}

// Wenn die App wieder sichtbar wird oder das Internet zurück ist: alles neu laden,
// damit verpasste Änderungen (z.B. während das Handy im Hintergrund war) ankommen.
let lastResync = Date.now();
function resync(force = false) {
  if (!currentUser || !document.getElementById('carousel-track')) return;
  if (!force && Date.now() - lastResync < 5000) return;
  lastResync = Date.now();
  loadAllData();
  loadTramDepartures();
  checkNewDay();
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) resync(); });
window.addEventListener('online', () => {
  const pill = $('#offline-pill');
  if (pill) pill.hidden = true;
  showToast('Wieder online', 'success');
  resync(true);
});
window.addEventListener('offline', () => {
  const pill = $('#offline-pill');
  if (pill) pill.hidden = false;
  showToast('Offline – Änderungen werden evtl. nicht gespeichert', 'offline');
});

// Tageswechsel: Widgets mit "Heute" neu zeichnen, wiederkehrende Ämtli zurücksetzen
function checkNewDay() {
  const key = new Date().toDateString();
  if (key === lastDayKey) return;
  lastDayKey = key;
  autoResetChores();
  WIDGETS.forEach(w => updateWidget(w.id));
  updateGreeting();
  if (currentOverlay === 'todo') renderTodoList();
  if (currentOverlay === 'chores') renderChoresList();
  if (currentOverlay === 'countdown') renderCountdownsList();
}

// ── Theme ────────────────────────────────────────────────────
function currentTheme() {
  return document.documentElement.getAttribute('data-theme') || 'dark';
}
function toggleTheme() {
  const next = currentTheme() === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem('theme', next);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', next === 'light' ? '#F2F2F7' : '#0D0F12');
  const ic = document.querySelector('.theme-icon');
  if (ic) {
    ic.outerHTML = icon(next === 'light' ? 'moon' : 'sun', 'xs', 'theme-icon');
    refreshIcons();
  }
  haptic(5);
}

// ── Uhr & Begrüssung ─────────────────────────────────────────
function startClock() {
  const timeEl = $('#clock-time');
  const dateEl = $('#clock-date');
  const update = () => {
    const now = new Date();
    timeEl.textContent = now.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
    dateEl.textContent = now.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' });
  };
  update();
  clearInterval(clockInterval);
  clockInterval = setInterval(update, 1000);
}

function updateGreeting() {
  const titleEl = $('#greeting-title');
  if (!titleEl) return;
  const hour = new Date().getHours();
  let greeting = 'Guten Tag';
  if (hour >= 5 && hour < 12) greeting = 'Guten Morgen';
  else if (hour >= 18 && hour < 23) greeting = 'Guten Abend';
  else if (hour >= 23 || hour < 5) greeting = 'Gute Nacht';
  if (currentUser) greeting += `, ${myName()}`;
  titleEl.textContent = greeting;
  updateGreetingSubtitle();
}

function updateGreetingSubtitle() {
  const el = $('#greeting-subtitle');
  if (!el) return;
  const plural = (n, one, many) => `${n} ${n > 1 ? many : one}`;
  const shopping = shoppingStore.items.filter(i => !i.is_done).length;
  const todos = todoStore.items.filter(i => !i.is_done).length;
  const chores = myOpenChores().length;
  const notes = unreadNotes().length;
  const packages = packagesStore.items.filter(i => !i.is_delivered).length;
  const parts = [];
  if (shopping) parts.push(`${shopping} im Einkauf`);
  if (todos) parts.push(plural(todos, 'To-Do', 'To-Dos'));
  if (chores) parts.push(`${chores} Ämtli`);
  if (notes) parts.push(plural(notes, 'neue Notiz', 'neue Notizen'));
  if (packages) parts.push(plural(packages, 'Paket', 'Pakete'));
  el.textContent = parts.length ? 'Heute: ' + parts.join(' · ') : 'Heute: Alles erledigt!';
}

// ── Widget-Raster ────────────────────────────────────────────
const ORDER_KEY = 'lanatimohome_widget_order';

// Standard-Reihenfolge (pos), überschrieben durch die auf diesem Gerät gespeicherte
function sortWidgets() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(ORDER_KEY)); } catch (e) { saved = null; }
  WIDGETS.sort((a, b) => {
    if (saved) {
      const ia = saved.indexOf(a.id), ib = saved.indexOf(b.id);
      const ra = ia === -1 ? 999 + a.pos : ia, rb = ib === -1 ? 999 + b.pos : ib;
      if (ra !== rb) return ra - rb;
    }
    return a.pos - b.pos;
  });
}

function widgetInnerHtml(w) {
  return `
    <div class="widget-header-row">
      <div class="widget-icon">${icon(w.icon, 'sm')}</div>
      ${w.hasBadge?.() ? '<div class="widget-badge" aria-label="Neu"></div>' : ''}
    </div>
    <div class="widget-content" id="content-${w.id}">${w.renderContent()}</div>
    <div class="widget-footer">
      <div class="widget-title">${escapeHtml(w.title)}</div>
      <div class="widget-preview" id="preview-${w.id}">${escapeHtml(w.getPreview())}</div>
    </div>`;
}

// Querformat-iPad: 3×3 Widgets neben der Info-Spalte, iPad hochkant 2×4.
// Handy: so viele Reihen à 2 Widgets, wie ganz auf den Bildschirm passen (nichts abgeschnitten).
const PHONE_ROW_MIN = 124;
function phoneRows() {
  const h = $('#carousel-container')?.clientHeight || 0;
  return Math.max(2, Math.min(4, Math.floor((h - 24) / PHONE_ROW_MIN)));
}
function widgetsPerPage() {
  if (window.matchMedia('(min-width: 1024px)').matches) return WIDGETS_PER_PAGE.wide;
  if (window.matchMedia('(min-width: 768px)').matches) return WIDGETS_PER_PAGE.normal;
  return phoneRows() * 2;
}
let renderedPerPage = 0;
window.addEventListener('resize', () => {
  if (renderedPerPage && widgetsPerPage() !== renderedPerPage && !document.body.classList.contains('is-sorting')) renderWidgetGrid();
});

function pageCount() {
  return Math.ceil(WIDGETS.length / widgetsPerPage());
}

function renderWidgetGrid() {
  const track = $('#carousel-track');
  const indicators = $('#page-indicators');
  if (!track) return;
  track.innerHTML = '';
  indicators.innerHTML = '';
  const perPage = renderedPerPage = widgetsPerPage();
  currentCarouselPage = Math.max(0, Math.min(currentCarouselPage, pageCount() - 1));

  for (let i = 0; i < pageCount(); i++) {
    const pageEl = document.createElement('div');
    pageEl.className = 'carousel-page';
    pageEl.style.setProperty('--rows', Math.ceil(perPage / 2));
    WIDGETS.slice(i * perPage, (i + 1) * perPage).forEach(w => {
      const el = document.createElement('div');
      el.className = `widget ${w.placeholder ? 'is-placeholder' : ''}`;
      el.id = `widget-${w.id}`;
      el.setAttribute('role', 'button');
      el.tabIndex = 0;
      el.style.setProperty('--w-color', w.color);
      el.innerHTML = widgetInnerHtml(w);
      el.addEventListener('click', () => w.open());
      el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); w.open(); } });
      pageEl.appendChild(el);
    });
    track.appendChild(pageEl);

    const dot = document.createElement('button');
    dot.className = `indicator-dot ${i === currentCarouselPage ? 'active' : ''}`;
    dot.setAttribute('aria-label', `Seite ${i + 1}`);
    dot.addEventListener('click', () => goToPage(i));
    indicators.appendChild(dot);
  }
  applyCarouselPosition(false);
  initSortable();
  refreshIcons();
}

// Widgets durch langes Drücken (bzw. Ziehen mit der Maus) verschieben.
// Am linken/rechten Rand kurz halten blättert zur Nachbarseite, so lassen sich
// Widgets auch auf eine andere Seite ziehen. Die Reihenfolge bleibt auf diesem Gerät gespeichert.
function initSortable() {
  if (typeof Sortable === 'undefined') return;
  $$('.carousel-page').forEach(pageEl => {
    new Sortable(pageEl, {
      group: 'dashboard',
      animation: 200,
      easing: 'cubic-bezier(0.25, 0.8, 0.25, 1)',
      delay: 300,                 // Erst nach kurzem Halten verschieben, normales Tippen öffnet das Widget
      delayOnTouchOnly: true,
      touchStartThreshold: 6,
      emptyInsertThreshold: 40,
      forceFallback: true,        // Gleiches Verhalten mit Finger und Maus, nötig fürs Blättern am Rand
      fallbackTolerance: 4,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      dragClass: 'sortable-drag',
      onChoose: () => { haptic(15); document.body.classList.add('is-sorting'); },
      onUnchoose: () => { document.body.classList.remove('is-sorting'); stopEdgePaging(); },
      onStart: () => startEdgePaging(),
      onEnd: () => {
        document.body.classList.remove('is-sorting');
        stopEdgePaging();
        const newOrder = $$('.widget').map(el => el.id.replace('widget-', ''));
        const before = JSON.stringify(WIDGETS.map(w => w.id));
        localStorage.setItem(ORDER_KEY, JSON.stringify(newOrder));
        sortWidgets();
        if (JSON.stringify(newOrder) !== before) showToast('Reihenfolge gespeichert', 'success');
        renderWidgetGrid(); // Seiten neu verteilen
      }
    });
  });
}

// Blättern während dem Verschieben: Finger bzw. Maus am Rand halten
const EDGE_PX = 70, EDGE_DELAY = 650;
let edgeTimer = null, edgeSide = 0;
function onEdgeMove(e) {
  const p = e.touches?.[0] || e.changedTouches?.[0] || e;
  if (p.clientX == null) return;
  const box = $('#carousel-container')?.getBoundingClientRect();
  if (!box) return;
  let side = 0;
  if (p.clientX < box.left + EDGE_PX && currentCarouselPage > 0) side = -1;
  else if (p.clientX > box.right - EDGE_PX && currentCarouselPage < pageCount() - 1) side = 1;
  if (side === edgeSide) return;
  edgeSide = side;
  clearTimeout(edgeTimer);
  $('#drag-edge-left')?.classList.toggle('is-hot', side === -1);
  $('#drag-edge-right')?.classList.toggle('is-hot', side === 1);
  if (side) edgeTimer = setTimeout(flipPage, EDGE_DELAY);
}
function flipPage() {
  if (!edgeSide) return;
  goToPage(currentCarouselPage + edgeSide);
  updateEdgeHints();
  // Weiter blättern, solange man am Rand bleibt
  if (edgeSide) edgeTimer = setTimeout(flipPage, EDGE_DELAY + 400);
}
function updateEdgeHints() {
  $('#drag-edge-left')?.classList.toggle('is-available', currentCarouselPage > 0);
  $('#drag-edge-right')?.classList.toggle('is-available', currentCarouselPage < pageCount() - 1);
  if ((edgeSide === -1 && currentCarouselPage === 0) || (edgeSide === 1 && currentCarouselPage === pageCount() - 1)) {
    edgeSide = 0;
    clearTimeout(edgeTimer);
    $$('.drag-edge').forEach(el => el.classList.remove('is-hot'));
  }
}
const EDGE_EVENTS = ['pointermove', 'touchmove', 'mousemove', 'dragover'];
function startEdgePaging() {
  edgeSide = 0;
  updateEdgeHints();
  EDGE_EVENTS.forEach(ev => document.addEventListener(ev, onEdgeMove, { capture: true, passive: true }));
}
function stopEdgePaging() {
  clearTimeout(edgeTimer);
  edgeSide = 0;
  EDGE_EVENTS.forEach(ev => document.removeEventListener(ev, onEdgeMove, { capture: true }));
  $$('.drag-edge').forEach(el => el.classList.remove('is-hot', 'is-available'));
}

// Einzelnes Widget aktualisieren, ohne das ganze Raster neu aufzubauen
function updateWidget(id) {
  const w = WIDGETS.find(x => x.id === id);
  const el = document.getElementById(`widget-${id}`);
  if (!w || !el) return;
  if (document.body.classList.contains('is-sorting')) return; // nicht während dem Verschieben
  el.innerHTML = widgetInnerHtml(w);
  refreshIcons();
  if (['shopping', 'todo', 'notes', 'chores', 'packages'].includes(id)) updateGreetingSubtitle();
}

// ── Karussell (Wischen zwischen Seiten) ──────────────────────
function applyCarouselPosition(animate = true, dragPx = 0) {
  const track = $('#carousel-track');
  if (!track) return;
  track.style.transition = animate ? 'transform 0.35s cubic-bezier(0.25, 0.8, 0.25, 1)' : 'none';
  // In Prozent statt Pixel: bleibt auch nach dem Drehen des iPads korrekt
  track.style.transform = `translateX(calc(${-currentCarouselPage * 100}% + ${dragPx}px))`;
  $$('#page-indicators .indicator-dot').forEach((dot, i) => dot.classList.toggle('active', i === currentCarouselPage));
}

function goToPage(i) {
  const next = Math.max(0, Math.min(pageCount() - 1, i));
  if (next !== currentCarouselPage) haptic(5);
  currentCarouselPage = next;
  applyCarouselPosition(true);
}

function initSwipeNavigation() {
  const container = $('#carousel-container');
  let startX = 0, startY = 0, dx = 0, dragging = false, decided = false, horizontal = false;

  container.addEventListener('touchstart', e => {
    if (document.body.classList.contains('is-sorting')) return;
    startX = e.touches[0].clientX; startY = e.touches[0].clientY;
    dx = 0; dragging = true; decided = false; horizontal = false;
  }, { passive: true });

  container.addEventListener('touchmove', e => {
    if (!dragging || document.body.classList.contains('is-sorting')) return;
    const mx = e.touches[0].clientX - startX;
    const my = e.touches[0].clientY - startY;
    if (!decided && (Math.abs(mx) > 8 || Math.abs(my) > 8)) { decided = true; horizontal = Math.abs(mx) > Math.abs(my); }
    if (!horizontal) return;
    dx = mx;
    // Am Rand gedämpft ziehen
    const atEdge = (currentCarouselPage === 0 && dx > 0) || (currentCarouselPage === pageCount() - 1 && dx < 0);
    applyCarouselPosition(false, atEdge ? dx * 0.3 : dx);
  }, { passive: true });

  container.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    if (!horizontal) return;
    if (dx < -50) goToPage(currentCarouselPage + 1);
    else if (dx > 50) goToPage(currentCarouselPage - 1);
    else applyCarouselPosition(true);
  });

  // Trackpad (2-Finger-Wischen)
  let wheelLock = false;
  container.addEventListener('wheel', e => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return;
    e.preventDefault();
    if (wheelLock || Math.abs(e.deltaX) < 20) return;
    goToPage(currentCarouselPage + (e.deltaX > 0 ? 1 : -1));
    wheelLock = true;
    setTimeout(() => { wheelLock = false; }, 600);
  }, { passive: false });

  // Pfeiltasten am Computer
  document.addEventListener('keydown', e => {
    if (isOverlayOpen() || isModalOpen() || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName)) return;
    if (e.key === 'ArrowRight') goToPage(currentCarouselPage + 1);
    if (e.key === 'ArrowLeft') goToPage(currentCarouselPage - 1);
  });
}

// ── ÖV-Abfahrten (transport.opendata.ch) ─────────────────────
function tramTitleHtml() {
  return `<div class="sbb-title">${icon('train-front', 'sm')}<span>${escapeHtml(TRAM_LABEL)}</span></div>`;
}

async function loadTramDepartures() {
  const board = $('#tram-board');
  if (!board) return;
  // Während der Bildschirm schwarz ist oder die App im Hintergrund läuft, nicht abfragen
  if (document.hidden || document.getElementById('blackout')?.classList.contains('active')) return;
  try {
    const res = await fetch(`https://transport.opendata.ch/v1/stationboard?station=${encodeURIComponent(TRAM_STATION)}&limit=6`);
    const data = await res.json();
    const deps = (data.stationboard || []).slice(0, 5);
    if (!deps.length) throw new Error('Keine Abfahrten');
    const now = Date.now();
    board.innerHTML = tramTitleHtml() + deps.map(dep => {
      const planned = new Date(dep.stop.departure);
      const delay = Number(dep.stop.delay) || 0;
      const actual = dep.stop.prognosis?.departure ? new Date(dep.stop.prognosis.departure) : new Date(planned.getTime() + delay * 60000);
      const mins = Math.floor((actual - now) / 60000);
      const timeText = mins <= 0 ? 'Jetzt' : mins < 60 ? `in ${mins}'` : actual.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
      return `
        <div class="sbb-row">
          <span class="sbb-badge">${escapeHtml(dep.number ?? dep.category ?? '')}</span>
          <span class="sbb-dest">${escapeHtml(dep.to ?? '')}</span>
          <span class="sbb-time">${timeText}${delay > 0 ? `<span class="sbb-delay">+${delay}'</span>` : ''}</span>
        </div>`;
    }).join('');
  } catch (e) {
    console.warn('ÖV-Abfahrten nicht verfügbar', e);
    if (!board.querySelector('.sbb-row')) board.innerHTML = tramTitleHtml() + '<div class="sbb-empty">Gerade keine Daten</div>';
    else board.querySelectorAll('.sbb-row').forEach(r => r.classList.add('is-stale'));
  }
  refreshIcons();
}
