/* ── Ämtli-Plan ────────────────────────────────────────────── */
const choresStore = createStore({ table: 'chores', order: { col: 'created_at', asc: false } });

function isRecurringChore(item) {
  return !!parseTask(item.text).recurrence;
}
// Für die Begrüssung: offene Ämtli, die mir oder niemandem zugewiesen sind
function myOpenChores() {
  const me = myName();
  return choresStore.items.filter(i => {
    if (i.is_done) return false;
    const a = parseTask(i.text).assignee;
    return !a || a === me;
  });
}

registerWidget({
  id: 'chores', pos: 9, title: 'Ämtli-Plan', icon: 'sparkles', color: 'var(--c-chores)', open: openChores,
  store: choresStore,
  renderContent: () => {
    const pending = choresStore.items.filter(i => !i.is_done);
    if (!pending.length) return miniPlaceholder('award', 'Alles sauber!');
    return pending.slice(0, 3).map(i => {
      const t = parseTask(i.text);
      return miniItem('circle', t.assignee ? `${t.title} · ${t.assignee}` : t.title);
    }).join('');
  },
  getPreview: () => {
    const c = choresStore.items.filter(i => !i.is_done).length;
    return c === 0 ? 'Alles sauber' : `${c} offene Ämtli`;
  }
});

choresStore.onChange(() => {
  updateWidget('chores');
  if (currentOverlay === 'chores') renderChoresList();
});

// Erledigte wiederkehrende Ämtli wieder öffnen, sobald sie fällig sind.
// Läuft beim Laden und jeden Tag kurz nach Mitternacht.
async function autoResetChores() {
  const today = startOfDay();
  const due = choresStore.items.filter(item => {
    if (!item.is_done) return false;
    const t = parseTask(item.text);
    return t.recurrence && t.due && today >= startOfDay(t.due);
  });
  for (const item of due) await choresStore.patch(item.id, { is_done: false });
}
choresStore.afterLoad = autoResetChores;

function openChores() {
  resetListMemory('chores');
  const personOpts = { '': 'Beide', ...Object.fromEntries(PEOPLE_NAMES.map(n => [n, n])) };
  const recOpts = { '': 'Einmalig', ...Object.fromEntries(RECURRENCES.map(r => [r, r])) };
  openOverlay({
    key: 'chores', title: 'Ämtli-Plan', color: 'var(--c-chores)',
    render: () => `
      <div class="input-row input-row-tight">
        <input type="text" id="new-chore-input" placeholder="Was muss geputzt/erledigt werden?" autocomplete="off" enterkeyhint="done" />
        <button id="add-chore-btn" class="btn-add" aria-label="Hinzufügen">${icon('plus', 'md')}</button>
      </div>
      <div class="input-options">
        <div class="segmented segmented-sm" id="new-chore-assignee" data-value="">${Object.entries(personOpts).map(([v, l]) => `<button type="button" data-value="${v}" class="${v === '' ? 'active' : ''}">${l}</button>`).join('')}</div>
        <div class="segmented segmented-sm" id="new-chore-recurrence" data-value="Täglich">${Object.entries(recOpts).map(([v, l]) => `<button type="button" data-value="${v}" class="${v === 'Täglich' ? 'active' : ''}">${l}</button>`).join('')}</div>
      </div>
      <div class="list-toolbar">
        <span class="section-title">Ämtli</span>
        ${clearDoneBtnHtml('clear-done-chore-btn', 'Erledigte einmalige löschen', 0)}
      </div>
      <div id="chores-list" class="list"></div>`,
    init: () => {
      initSegmented($('#overlay-content'));
      $('#add-chore-btn').addEventListener('click', addChore);
      $('#new-chore-input').addEventListener('keydown', e => { if (e.key === 'Enter') addChore(); });
      $('#clear-done-chore-btn').addEventListener('click', clearDoneChores);
      renderChoresList();
    }
  });
}

function choreRowHtml(item) {
  const id = escapeHtml(item.id);
  const t = parseTask(item.text);
  return `
    <div class="list-item ${item.is_done ? 'done' : ''} ${isNewItem('chores', item.id) ? 'is-new' : ''} ${lastToggled === String(item.id) ? 'pop' : ''}">
      ${checkHtml(item.is_done, `toggleChore('${id}')`)}
      <div class="item-content clickable" onclick="openEditModal('chores','${id}')">
        <div class="item-title">${escapeHtml(t.title)}</div>
        ${taskChipsHtml(t, { isDone: item.is_done })}
      </div>
      <div class="item-actions">${deleteBtnHtml(`deleteChore('${id}')`)}</div>
    </div>`;
}

function renderChoresList() {
  const list = $('#chores-list');
  if (!list) return;
  const items = choresStore.items;
  const clearBtn = $('#clear-done-chore-btn');
  if (clearBtn) clearBtn.hidden = !items.some(i => i.is_done && !isRecurringChore(i));

  if (!items.length) {
    list.innerHTML = emptyStateHtml('sparkles', 'Alles blitzblank!', 'Es gibt aktuell keine offenen Ämtli.');
    refreshIcons();
    return;
  }
  const sortGroup = arr => [...arr.filter(i => !i.is_done), ...arr.filter(i => i.is_done)];
  const recurring = sortGroup(items.filter(isRecurringChore));
  const oneOff = sortGroup(items.filter(i => !isRecurringChore(i)));
  let html = '';
  if (recurring.length) html += `<div class="group-title group-title-accent">Wiederkehrend</div>${recurring.map(choreRowHtml).join('')}`;
  if (oneOff.length) html += `<div class="group-title">Einmalig</div>${oneOff.map(choreRowHtml).join('')}`;
  list.innerHTML = html;
  primeList('chores');
  refreshIcons();
}

async function addChore() {
  const input = $('#new-chore-input');
  const title = input.value.trim();
  if (!title) { input.focus(); return; }
  const assignee = $('#new-chore-assignee').dataset.value;
  const recurrence = $('#new-chore-recurrence').dataset.value;
  const text = composeTask({ title, assignee, recurrence });
  const ok = await saveWithFeedback($('#add-chore-btn'), () => choresStore.insert({ text, is_done: false }), 'Hinzugefügt', 'Ämtli hinzugefügt');
  if (!ok) return;
  input.value = '';
  input.focus();
}

function toggleChore(id) {
  const item = choresStore.find(id);
  if (!item) return;
  markToggled(id);
  haptic();
  const t = parseTask(item.text);

  if (!item.is_done && t.recurrence) {
    const next = nextDueDate(t.due, t.recurrence);
    const text = composeTask({ ...t, due: next });
    choresStore.patch(id, { text, is_done: true });
    showToast(`Erledigt · wieder fällig ${dueLabel(next)}`, 'success');
    return;
  }
  choresStore.patch(id, { is_done: !item.is_done });
}

function clearDoneChores() {
  // Wiederkehrende bleiben (sie werden wieder fällig)
  const ids = choresStore.items.filter(i => i.is_done && !isRecurringChore(i)).map(i => i.id);
  if (ids.length) choresStore.remove(ids, 'Ämtli');
}

function deleteChore(id) {
  choresStore.remove(id, 'Ämtli');
}
