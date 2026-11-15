/* ── Countdowns ────────────────────────────────────────────── */
const countdownStore = createStore({ table: 'countdowns', order: { col: 'date', asc: true } });

function upcomingCountdowns() {
  return countdownStore.items.filter(i => daysUntil(parseIsoDate(i.date)) >= 0);
}
function countdownText(days) {
  if (days === 0) return 'Heute!';
  if (days === 1) return 'Morgen';
  if (days < 0) return 'vorbei';
  return `${days} Tage`;
}

registerWidget({
  id: 'countdown', pos: 5, title: 'Countdowns', icon: 'timer', color: 'var(--c-countdown)', open: openCountdowns,
  store: countdownStore,
  renderContent: () => {
    const next = upcomingCountdowns()[0];
    if (!next) return miniPlaceholder('calendar-heart', 'Keine Events');
    const days = daysUntil(parseIsoDate(next.date));
    return `<div class="mini-hero">
      <div class="hero-number">${days === 0 ? 'Heute' : days}</div>
      <div class="hero-caption">${days === 0 ? '' : days === 1 ? 'Tag bis<br/>' : 'Tage bis<br/>'}${escapeHtml(next.title)}</div>
    </div>`;
  },
  getPreview: () => {
    const n = upcomingCountdowns().length;
    return n > 0 ? `${n} Event${n > 1 ? 's' : ''}` : 'Leer';
  }
});

countdownStore.onChange(() => {
  updateWidget('countdown');
  if (currentOverlay === 'countdown') renderCountdownsList();
});

function openCountdowns() {
  resetListMemory('countdown');
  openOverlay({
    key: 'countdown', title: 'Countdowns', color: 'var(--c-countdown)',
    render: () => `
      <div class="input-row">
        <input type="text" id="new-cd-title" placeholder="Ereignis eintragen…" autocomplete="off" />
        <input type="date" id="new-cd-date" class="date-input" aria-label="Datum" />
        <button id="add-cd-btn" class="btn-add" aria-label="Hinzufügen">${icon('plus', 'md')}</button>
      </div>
      <div id="countdowns-list" class="list"></div>`,
    init: () => {
      $('#add-cd-btn').addEventListener('click', addCountdown);
      $('#new-cd-title').addEventListener('keydown', e => { if (e.key === 'Enter') addCountdown(); });
      renderCountdownsList();
    }
  });
}

function countdownRowHtml(item) {
  const id = escapeHtml(item.id);
  const date = parseIsoDate(item.date);
  const days = daysUntil(date);
  return `
    <div class="list-item ${days < 0 ? 'done' : ''} ${isNewItem('countdown', item.id) ? 'is-new' : ''}">
      <div class="count-badge ${days === 0 ? 'is-today' : ''}">${days < 0 ? icon('check', 'sm') : days === 0 ? icon('party-popper', 'sm') : days}</div>
      <div class="item-content clickable" onclick="openEditModal('countdown','${id}')">
        <div class="item-title">${escapeHtml(item.title)}</div>
        <div class="item-sub">${date.toLocaleDateString('de-CH', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })} · ${countdownText(days)}</div>
      </div>
      <div class="item-actions">${deleteBtnHtml(`deleteCountdown('${id}')`)}</div>
    </div>`;
}

function renderCountdownsList() {
  const list = $('#countdowns-list');
  if (!list) return;
  if (!countdownStore.items.length) {
    list.innerHTML = emptyStateHtml('timer', 'Keine Events', 'Worauf freust du dich als Nächstes?');
    refreshIcons();
    return;
  }
  const upcoming = upcomingCountdowns();
  const past = countdownStore.items.filter(i => !upcoming.includes(i)).reverse();
  let html = upcoming.map(countdownRowHtml).join('');
  if (past.length) html += `<div class="group-title">Vorbei</div>${past.map(countdownRowHtml).join('')}`;
  list.innerHTML = html;
  primeList('countdown');
  refreshIcons();
}

async function addCountdown() {
  const titleEl = $('#new-cd-title');
  const dateEl = $('#new-cd-date');
  const title = titleEl.value.trim();
  const date = dateEl.value;
  if (!title) { titleEl.focus(); showToast('Bitte ein Ereignis eintragen', 'error'); return; }
  if (!date) { dateEl.focus(); dateEl.showPicker?.(); showToast('Bitte ein Datum wählen', 'error'); return; }
  const ok = await saveWithFeedback($('#add-cd-btn'), () => countdownStore.insert({ title, date }), 'Hinzugefügt', `Countdown «${title}» erstellt`);
  if (!ok) return;
  titleEl.value = '';
  dateEl.value = '';
}

function deleteCountdown(id) {
  countdownStore.remove(id, 'Countdown');
}
