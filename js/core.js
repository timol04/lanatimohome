/* ============================================================
   LanaTimoHome – core.js
   Grundbausteine: Datenbank, Hilfsfunktionen, Feedback,
   Detailansicht (Overlay), Popups und der gemeinsame Daten-Baustein
   ============================================================ */

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON);
let currentUser = null;

// ── Kleine Helfer ─────────────────────────────────────────────
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function escapeHtml(str) {
  return String(str ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Nur http(s)-Links zulassen (verhindert javascript:-Links)
function safeUrl(url) {
  if (!url) return '';
  try {
    let u;
    try { u = new URL(url); } catch (e) { u = new URL('https://' + url); } // z.B. "ikea.com/..."
    return (u.protocol === 'https:' || u.protocol === 'http:') ? u.href : '';
  } catch (e) {
    return '';
  }
}

// Icon-Platzhalter. Grössen: xs 14 · sm 18 · md 22 · lg 36 (siehe styles.css)
function icon(name, size = 'sm', extraClass = '') {
  return `<i data-lucide="${name}" class="ic ic-${size} ${extraClass}"></i>`;
}
function refreshIcons() {
  if (window.lucide) lucide.createIcons();
}

function userKey(user = currentUser) {
  return user?.email?.split('@')[0] ?? 'Unbekannt';
}
function formatUserName(rawName) {
  if (!rawName) return 'Unbekannt';
  const name = String(rawName).toLowerCase().split('@')[0];
  if (PEOPLE[name]) return PEOPLE[name];
  return name.charAt(0).toUpperCase() + name.slice(1);
}
function myName() {
  return formatUserName(userKey());
}

function formatChf(n) {
  return 'CHF ' + (Number(n) || 0).toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// "1'299.90 CHF", "CHF 49,95", "499.–" → Zahl (oder NaN)
function parsePrice(price) {
  if (!price) return NaN;
  let s = String(price).replace(/['’\s]/g, '').replace(/[^\d.,]/g, '');
  const decimalPos = Math.max(s.lastIndexOf('.'), s.lastIndexOf(','));
  if (decimalPos !== -1 && s.length - decimalPos <= 3) {
    const intPart = s.substring(0, decimalPos).replace(/[.,]/g, '');
    return parseFloat(`${intPart}.${s.substring(decimalPos + 1) || '0'}`);
  }
  return parseFloat(s.replace(/[.,]/g, ''));
}

// ── Datum ────────────────────────────────────────────────────
function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
// "2026-12-24" als lokales Datum (nicht UTC)
function parseIsoDate(str) {
  const [y, m, d] = String(str).split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function toIsoDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function daysUntil(date) {
  return Math.round((startOfDay(date) - startOfDay()) / 86400000);
}
function todayName() {
  return WEEKDAYS[(new Date().getDay() || 7) - 1];
}
function tomorrowName() {
  return WEEKDAYS[(new Date().getDay() || 7) % 7];
}
// Kurze, menschliche Fälligkeit: "Heute", "Morgen", "Gestern", "Fr. 21.11."
function dueLabel(date) {
  const d = daysUntil(date);
  if (d === 0) return 'Heute';
  if (d === 1) return 'Morgen';
  if (d === -1) return 'Gestern';
  const opts = Math.abs(d) < 7 ? { weekday: 'short', day: '2-digit', month: '2-digit' } : { day: '2-digit', month: '2-digit' };
  return date.toLocaleDateString('de-CH', opts);
}

// ── Aufgaben-Text (Ämtli & To-Do) ────────────────────────────
// Die Daten stehen weiterhin im Text, z.B. "Bad putzen (Lana) [Wöchentlich] (bis 05.01.2027)".
// So bleibt alles kompatibel mit bestehenden Einträgen.
const RE_ASSIGNEE = new RegExp(`\\s*\\((${PEOPLE_NAMES.join('|')})\\)`);
const RE_RECURRENCE = new RegExp(`\\s*\\[(${RECURRENCES.join('|')})\\]`);
const RE_DUE = /\s*\(bis (\d{1,2})\.(\d{1,2})\.?(\d{4}|\d{2})?\)/;

function parseDue(text) {
  const m = String(text).match(RE_DUE);
  if (!m) return null;
  let [match, d, mo, y] = m;
  const hasYear = !!y;
  if (!y) y = String(new Date().getFullYear());
  else if (y.length === 2) y = '20' + y;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  if (!hasYear) {
    // Ohne Jahr: das Jahr nehmen, das am nächsten an heute liegt (wichtig über den Jahreswechsel)
    const halfYear = 180 * 86400000;
    if (date < new Date(Date.now() - halfYear)) date.setFullYear(date.getFullYear() + 1);
    else if (date > new Date(Date.now() + halfYear)) date.setFullYear(date.getFullYear() - 1);
  }
  return { match, date };
}

function parseTask(text) {
  const raw = String(text ?? '');
  const assignee = raw.match(RE_ASSIGNEE)?.[1] || '';
  const recurrence = raw.match(RE_RECURRENCE)?.[1] || '';
  const due = parseDue(raw)?.date || null;
  const title = raw.replace(RE_ASSIGNEE, '').replace(RE_RECURRENCE, '').replace(RE_DUE, '').trim();
  return { title, assignee, recurrence, due };
}

function composeTask({ title, assignee, recurrence, due }) {
  let t = String(title || '').trim();
  if (assignee) t += ` (${assignee})`;
  if (recurrence) t += ` [${recurrence}]`;
  if (due) {
    const d = due instanceof Date ? due : parseIsoDate(due);
    t += ` (bis ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()})`;
  }
  return t;
}

// Nächster Termin eines wiederkehrenden Ämtli: so lange weiterschieben, bis er in der Zukunft liegt.
// So bleibt der Rhythmus (z.B. immer montags) erhalten, auch wenn man zu spät erledigt.
function nextDueDate(due, recurrence) {
  const today = startOfDay();
  const d = due ? startOfDay(due) : new Date(today);
  do {
    if (recurrence === 'Täglich') d.setDate(d.getDate() + 1);
    else if (recurrence === 'Wöchentlich') d.setDate(d.getDate() + 7);
    else if (recurrence === 'Monatlich') d.setMonth(d.getMonth() + 1);
    else break;
  } while (d <= today);
  return d;
}

// Chips für Person / Wiederholung / Fälligkeit
function taskChipsHtml(task, { isDone = false } = {}) {
  const chips = [];
  if (task.assignee) chips.push(`<span class="chip chip-person ${task.assignee === myName() ? 'is-me' : ''}">${icon('user', 'xs')}${escapeHtml(task.assignee)}</span>`);
  if (task.recurrence) chips.push(`<span class="chip">${icon('repeat', 'xs')}${escapeHtml(task.recurrence)}</span>`);
  if (task.due) {
    const d = daysUntil(task.due);
    const cls = isDone ? '' : d < 0 ? 'chip-overdue' : d === 0 ? 'chip-today' : '';
    const label = (!isDone && d < 0) ? `Überfällig · ${dueLabel(task.due)}` : dueLabel(task.due);
    chips.push(`<span class="chip ${cls}">${icon('calendar', 'xs')}${escapeHtml(label)}</span>`);
  }
  return chips.length ? `<div class="chips">${chips.join('')}</div>` : '';
}

// ── Feedback: Hinweis-Balken (Toast) mit optionaler Aktion ───
let toastTimer = null;
const TOAST_ICONS = { success: 'circle-check', error: 'circle-alert', delete: 'trash-2', info: 'info', offline: 'wifi-off' };

function haptic(ms = 10) {
  try { navigator.vibrate?.(ms); } catch (e) { /* iOS kennt das nicht */ }
}

function showToast(msg, opts = {}) {
  const { type = 'info', actionLabel, action, duration } = typeof opts === 'string' ? { type: opts } : opts;
  const el = document.getElementById('toast');
  if (!el) return;
  el.className = `toast toast-${type}`;
  el.innerHTML = `${icon(TOAST_ICONS[type] || 'info', 'sm', 'toast-icon')}<span class="toast-text">${escapeHtml(msg)}</span>` +
    (actionLabel ? `<button class="toast-action" type="button">${escapeHtml(actionLabel)}</button>` : '');
  if (actionLabel) {
    el.querySelector('.toast-action').addEventListener('click', e => {
      e.stopPropagation();
      hideToast();
      action?.();
    });
  }
  refreshIcons();
  // Reflow, damit die Einblend-Animation auch bei schnell aufeinanderfolgenden Hinweisen läuft
  void el.offsetWidth;
  el.classList.add('show');
  if (type === 'error') haptic([20, 40, 20]);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, duration ?? (actionLabel ? UNDO_MS : 2200));
}
function hideToast() {
  clearTimeout(toastTimer);
  document.getElementById('toast')?.classList.remove('show');
}

// ── Speichern mit Ladeanzeige ────────────────────────────────
// Sperrt den Button und zeigt einen Spinner, danach kurz Erfolg (grün) oder Fehler (rot).
// work() muss ein Promise mit { error } liefern (Supabase-Antwort). Gibt true bei Erfolg zurück.
async function saveWithFeedback(btn, work, okLabel = 'Gespeichert', toastMsg = okLabel) {
  if (!btn || btn.disabled) return false;
  if (btn._orig === undefined) btn._orig = btn.innerHTML;
  const hasText = btn.textContent.trim() !== '';
  const set = (state, label) => {
    const icons = { loading: 'loader', success: 'check', error: 'circle-alert' };
    btn.dataset.state = state;
    btn.disabled = state === 'loading';
    btn.innerHTML = `${icon(icons[state], 'sm', state === 'loading' ? 'spin' : '')}${hasText ? '<span>' + escapeHtml(label) + '</span>' : ''}`;
    refreshIcons();
  };
  set('loading', 'Speichere…');
  let error = null;
  try {
    ({ error } = await work());
  } catch (e) {
    error = e;
  }
  if (error) console.error('Fehler beim Speichern:', error);
  if (error) showToast('Nicht gespeichert – bitte nochmal versuchen', 'error');
  else if (toastMsg) { showToast(toastMsg, 'success'); haptic(); }
  if (!btn.isConnected) return !error;
  set(error ? 'error' : 'success', error ? 'Fehlgeschlagen' : okLabel);
  setTimeout(() => {
    if (!btn.isConnected || btn.dataset.state === 'loading') return;
    btn.disabled = false;
    btn.dataset.state = '';
    btn.innerHTML = btn._orig;
    refreshIcons();
  }, error ? 2500 : 900);
  return !error;
}

// ── Navigation: Zurück-Geste / Zurück-Taste / Escape ─────────
// Detailansicht und Popups legen einen Eintrag im Browser-Verlauf an.
// "Zurück" schliesst dann zuerst das Popup, dann die Ansicht, statt die App zu verlassen.
let navDepth = 0;
let suppressPop = 0;

function pushNav() {
  history.pushState({ lth: Date.now() }, '');
  navDepth++;
}
function popNav(n = 1) {
  n = Math.min(n, navDepth);
  if (n <= 0) return;
  navDepth -= n;
  suppressPop++;
  history.go(-n);
}
window.addEventListener('popstate', () => {
  if (suppressPop > 0) { suppressPop--; return; }
  if (navDepth > 0) navDepth--;
  if (isModalOpen()) closeModal({ fromNav: true });
  else if (isOverlayOpen()) closeOverlay({ fromNav: true });
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (isModalOpen()) closeModal();
  else if (isOverlayOpen()) closeOverlay();
});

// ── Detailansicht (Overlay) ──────────────────────────────────
let currentOverlay = null; // Schlüssel der offenen Ansicht, z.B. 'shopping'

function isOverlayOpen() {
  return document.getElementById('overlay-container')?.classList.contains('open') ?? false;
}

function openOverlay({ key, title, color, render, init }) {
  const container = document.getElementById('overlay-container');
  if (!container) return;
  container.style.setProperty('--w-color', color);
  $('#overlay-title').textContent = title;
  const content = $('#overlay-content');
  content.innerHTML = render();
  content.scrollTop = 0;
  const wasOpen = isOverlayOpen();
  currentOverlay = key;
  init?.();
  refreshIcons();
  container.classList.add('open');
  if (!wasOpen) pushNav();
}

function closeOverlay({ fromNav = false } = {}) {
  const hadModal = removeModalElement();
  document.getElementById('overlay-container')?.classList.remove('open');
  currentOverlay = null;
  if (!fromNav) popNav(1 + (hadModal ? 1 : 0));
}

// ── Popups (Modal) ───────────────────────────────────────────
// actions: [{ id, label, icon, kind: 'primary'|'danger'|'secondary', onClick }]
function isModalOpen() {
  return !!document.getElementById('app-modal');
}

function openModal({ title, body, actions = [], onOpen, focus }) {
  const reuseNav = removeModalElement(); // ein offenes Popup wird ersetzt, Verlaufseintrag bleibt
  const host = document.getElementById('overlay-container')?.classList.contains('open')
    ? document.getElementById('overlay-container')
    : document.getElementById('app');
  const modal = document.createElement('div');
  modal.id = 'app-modal';
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(title)}">
      <div class="modal-head">
        <h3>${escapeHtml(title)}</h3>
        <button class="icon-btn" data-modal-close aria-label="Schliessen">${icon('x', 'sm')}</button>
      </div>
      <div class="modal-body">${body}</div>
      ${actions.length ? `<div class="modal-actions">${actions.map(a => `
        <button class="btn btn-${a.kind || 'secondary'} ${a.label ? '' : 'btn-square'}" data-action="${a.id}" ${a.label ? '' : `aria-label="${escapeHtml(a.aria || a.id)}"`}>
          ${a.icon ? icon(a.icon, 'sm') : ''}${a.label ? `<span>${escapeHtml(a.label)}</span>` : ''}
        </button>`).join('')}</div>` : ''}
    </div>`;
  host.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
  modal.querySelector('[data-modal-close]').addEventListener('click', () => closeModal());
  actions.forEach(a => modal.querySelector(`[data-action="${a.id}"]`).addEventListener('click', e => a.onClick?.(e.currentTarget, modal)));
  // Enter in einem einzeiligen Feld = erste primäre Aktion
  const primary = actions.find(a => a.kind === 'primary');
  if (primary) {
    modal.addEventListener('keydown', e => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
        e.preventDefault();
        primary.onClick?.(modal.querySelector(`[data-action="${primary.id}"]`), modal);
      }
    });
  }
  refreshIcons();
  requestAnimationFrame(() => modal.classList.add('show'));
  if (!reuseNav) pushNav();
  onOpen?.(modal);
  if (focus) modal.querySelector(focus)?.focus();
  return modal;
}

// Entfernt das Popup ohne den Verlauf anzufassen. Gibt true zurück, wenn eins offen war.
function removeModalElement() {
  const modal = document.getElementById('app-modal');
  if (!modal) return false;
  modal.id = '';
  modal.classList.remove('show');
  modal.classList.add('closing');
  setTimeout(() => modal.remove(), 180);
  return true;
}

function closeModal({ fromNav = false } = {}) {
  if (removeModalElement() && !fromNav) popNav(1);
}

// Formularfelder für Popups.
// type: text | textarea | date | number | url | select | segmented
function fieldHtml(f, value) {
  const v = value ?? '';
  const label = `<label class="field-label" for="f-${f.k}">${escapeHtml(f.label)}${f.optional ? ' <span class="muted">(optional)</span>' : ''}</label>`;
  if (f.type === 'textarea') return `<div class="field">${label}<textarea id="f-${f.k}" data-field="${f.k}" rows="${f.rows || 4}">${escapeHtml(v)}</textarea></div>`;
  if (f.type === 'select') return `<div class="field">${label}<select id="f-${f.k}" data-field="${f.k}">${Object.entries(f.options).map(([ov, ol]) => `<option value="${escapeHtml(ov)}" ${String(ov) === String(v) ? 'selected' : ''}>${escapeHtml(ol)}</option>`).join('')}</select></div>`;
  if (f.type === 'segmented') return `<div class="field">${label}<div class="segmented" data-field="${f.k}" data-value="${escapeHtml(v)}">${Object.entries(f.options).map(([ov, ol]) => `<button type="button" data-value="${escapeHtml(ov)}" class="${String(ov) === String(v) ? 'active' : ''}">${escapeHtml(ol)}</button>`).join('')}</div></div>`;
  const extra = f.type === 'number' ? 'inputmode="decimal" step="0.05" min="0"' : '';
  return `<div class="field">${label}<input id="f-${f.k}" type="${f.type || 'text'}" data-field="${f.k}" value="${escapeHtml(v)}" placeholder="${escapeHtml(f.placeholder || '')}" ${extra} autocomplete="off" /></div>`;
}
function initSegmented(root) {
  $$('.segmented', root).forEach(seg => {
    seg.addEventListener('click', e => {
      const b = e.target.closest('button[data-value]');
      if (!b) return;
      seg.dataset.value = b.dataset.value;
      $$('button', seg).forEach(x => x.classList.toggle('active', x === b));
      haptic(5);
    });
  });
}
function readFields(root, fields) {
  const row = {};
  for (const f of fields) {
    const el = root.querySelector(`[data-field="${f.k}"]`);
    const v = (f.type === 'segmented' ? el.dataset.value : el.value).trim();
    if (!v && !f.optional) {
      el.classList.add('invalid');
      el.focus?.();
      setTimeout(() => el.classList.remove('invalid'), 1200);
      showToast(`Bitte «${f.label}» ausfüllen`, 'error');
      return null;
    }
    row[f.k] = v;
  }
  return row;
}

// Rückfrage im App-Design (statt confirm())
function confirmModal({ title, text, confirmLabel = 'OK', danger = false }) {
  return new Promise(resolve => {
    let done = false;
    const finish = v => { if (!done) { done = true; resolve(v); } };
    openModal({
      title,
      body: `<p class="modal-text">${escapeHtml(text)}</p>`,
      actions: [
        { id: 'cancel', label: 'Abbrechen', kind: 'secondary', onClick: () => { finish(false); closeModal(); } },
        { id: 'ok', label: confirmLabel, kind: danger ? 'danger-solid' : 'primary', onClick: () => { finish(true); closeModal(); } }
      ]
    });
    const obs = setInterval(() => { if (!isModalOpen()) { clearInterval(obs); finish(false); } }, 300);
  });
}

// ── Gemeinsamer Daten-Baustein ───────────────────────────────
// Lädt eine Tabelle, hält sie per Realtime aktuell und bietet
// Ändern (mit Fehleranzeige und Zurücksetzen), Hinzufügen und Löschen mit "Rückgängig".
const stores = [];

function createStore({ table, order = { col: 'created_at', asc: true } }) {
  const store = {
    table,
    items: [],
    hidden: new Set(),       // Gelöscht, aber noch rückgängig machbar
    listeners: [],
    chan: null,
    loaded: false,

    onChange(fn) { this.listeners.push(fn); },
    emit() { this.listeners.forEach(fn => { try { fn(); } catch (e) { console.error(e); } }); },
    find(id) { return this.items.find(i => String(i.id) === String(id)); },

    sort() {
      if (!order) return;
      const { col, asc } = order;
      this.items.sort((a, b) => {
        const va = a[col] ?? '', vb = b[col] ?? '';
        return (va < vb ? -1 : va > vb ? 1 : 0) * (asc ? 1 : -1);
      });
    },

    async load() {
      let q = db.from(table).select('*');
      if (order) q = q.order(order.col, { ascending: order.asc });
      const { data, error } = await q;
      if (error) { console.error(`Laden ${table}:`, error); return false; }
      this.items = (data || []).filter(i => !this.hidden.has(String(i.id)));
      this.loaded = true;
      this.subscribe();
      this.emit();
      return true;
    },

    subscribe() {
      if (this.chan) return;
      this.chan = db.channel(`${table}_realtime`)
        .on('postgres_changes', { event: '*', schema: 'public', table }, p => this.applyRealtime(p))
        .subscribe();
    },

    unsubscribe() {
      if (this.chan) { db.removeChannel?.(this.chan) ?? this.chan.unsubscribe(); this.chan = null; }
      this.items = [];
      this.loaded = false;
    },

    applyRealtime(p) {
      const row = p.new && Object.keys(p.new).length ? p.new : null;
      const id = String((row || p.old)?.id);
      if (this.hidden.has(id)) return;
      if (p.eventType === 'DELETE') {
        this.items = this.items.filter(i => String(i.id) !== id);
      } else if (row) {
        const idx = this.items.findIndex(i => String(i.id) === id);
        if (idx === -1) { this.items.push(row); this.sort(); }
        else this.items[idx] = row;
      }
      this.emit();
    },

    // Sofort anzeigen, dann speichern. Bei Fehler zurücksetzen und Hinweis zeigen.
    async patch(id, patch, { quiet = true } = {}) {
      const item = this.find(id);
      if (!item) return false;
      const old = {};
      Object.keys(patch).forEach(k => { old[k] = item[k]; });
      Object.assign(item, patch);
      this.emit();
      const { error } = await db.from(table).update(patch).eq('id', item.id);
      if (error) {
        console.error(`Ändern ${table}:`, error);
        const cur = this.find(id);
        if (cur) Object.assign(cur, old);
        this.emit();
        showToast('Nicht gespeichert – keine Verbindung?', 'error');
        return false;
      }
      if (!quiet) showToast('Gespeichert', 'success');
      return true;
    },

    async insert(row) {
      const res = await db.from(table).insert([row]).select();
      if (!res.error && res.data?.[0] && !this.find(res.data[0].id)) {
        this.items.push(res.data[0]);
        this.sort();
        this.emit();
      }
      return res;
    },

    // Aus der Ansicht entfernen, nach 5 Sekunden wirklich löschen. Bis dahin "Rückgängig" möglich.
    remove(ids, label = 'Eintrag') {
      ids = (Array.isArray(ids) ? ids : [ids]).map(String);
      const removed = this.items.filter(i => ids.includes(String(i.id)));
      if (!removed.length) return;
      ids.forEach(id => this.hidden.add(id));
      this.items = this.items.filter(i => !ids.includes(String(i.id)));
      this.emit();
      haptic();

      const job = { store: this, ids, removed };
      job.commit = async () => {
        clearTimeout(job.timer);
        pendingDeletes.delete(job);
        const { error } = await db.from(table).delete().in('id', removed.map(i => i.id));
        ids.forEach(id => this.hidden.delete(id));
        if (error) {
          console.error(`Löschen ${table}:`, error);
          this.items.push(...removed);
          this.sort();
          this.emit();
          showToast('Löschen fehlgeschlagen', 'error');
        }
      };
      job.undo = () => {
        clearTimeout(job.timer);
        pendingDeletes.delete(job);
        ids.forEach(id => this.hidden.delete(id));
        removed.forEach(r => { if (!this.find(r.id)) this.items.push(r); });
        this.sort();
        this.emit();
        showToast('Wiederhergestellt', 'success');
      };
      job.timer = setTimeout(job.commit, UNDO_MS);
      pendingDeletes.add(job);

      const text = removed.length > 1 ? `${removed.length} ${label} gelöscht` : `${label} gelöscht`;
      showToast(text, { type: 'delete', actionLabel: 'Rückgängig', action: job.undo });
    }
  };
  stores.push(store);
  return store;
}

const pendingDeletes = new Set();
// Beim Schliessen/Verlassen der App offene Löschungen sofort ausführen
function flushDeletes() {
  pendingDeletes.forEach(job => job.commit());
}
window.addEventListener('pagehide', flushDeletes);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushDeletes(); });

// ── Listen-Hilfen ────────────────────────────────────────────
function emptyStateHtml(iconName, title, text) {
  return `<div class="empty-state">
    <div class="empty-icon">${icon(iconName, 'lg')}</div>
    <h3>${escapeHtml(title)}</h3>
    ${text ? `<p>${escapeHtml(text)}</p>` : ''}
  </div>`;
}

// Neue Einträge sanft einblenden: merkt sich pro Liste, welche IDs schon gezeigt wurden
const seenIds = {};
function isNewItem(listKey, id) {
  const set = seenIds[listKey] || (seenIds[listKey] = { ids: new Set(), primed: false });
  const isNew = set.primed && !set.ids.has(String(id));
  set.ids.add(String(id));
  return isNew;
}
function primeList(listKey) {
  if (seenIds[listKey]) seenIds[listKey].primed = true;
}
function resetListMemory(listKey) {
  delete seenIds[listKey];
}

// Zuletzt abgehakter Eintrag bekommt eine kleine "Pop"-Animation
let lastToggled = null;
function markToggled(id) { lastToggled = String(id); setTimeout(() => { if (lastToggled === String(id)) lastToggled = null; }, 600); }

function checkHtml(done, onclick, label = 'Abhaken') {
  return `<button class="check ${done ? 'is-done' : ''}" onclick="${onclick}" aria-label="${label}" aria-pressed="${done}">${icon('check', 'xs')}</button>`;
}
function deleteBtnHtml(onclick, label = 'Löschen') {
  return `<button class="icon-btn item-delete" onclick="event.stopPropagation(); ${onclick}" aria-label="${label}">${icon('trash-2', 'sm')}</button>`;
}
function stepperHtml(qty, fnName, id) {
  return `<div class="stepper" onclick="event.stopPropagation()">
    <button onclick="${fnName}('${id}', -1)" aria-label="Weniger" ${qty <= 1 ? 'disabled' : ''}>${icon('minus', 'xs')}</button>
    <span>${qty}</span>
    <button onclick="${fnName}('${id}', 1)" aria-label="Mehr">${icon('plus', 'xs')}</button>
  </div>`;
}
function clearDoneBtnHtml(id, label, count) {
  return `<button id="${id}" class="pill-btn" ${count ? '' : 'hidden'}>${icon('trash-2', 'xs')}<span>${escapeHtml(label)}</span></button>`;
}

// ── Widget-Registrierung ─────────────────────────────────────
// Jedes Widget meldet sich hier an. pos = Standard-Reihenfolge auf dem Homescreen.
const WIDGETS = [];
function registerWidget(def) {
  WIDGETS.push(def);
}
function miniItem(iconName, text, extraClass = '') {
  return `<div class="mini-list-item ${extraClass}">${icon(iconName, 'xs')}<span class="mini-text">${escapeHtml(text)}</span></div>`;
}
function miniPlaceholder(iconName, text) {
  return `<div class="mini-placeholder">${icon(iconName, 'md')}<span>${escapeHtml(text)}</span></div>`;
}
