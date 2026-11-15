/* ── Budget ────────────────────────────────────────────────── */
const budgetStore = createStore({ table: 'budget_entries' });
const BUDGET_KINDS = { shared: 'Gemeinsam', timo: 'Timo', lana: 'Lana' };
const BUDGET_INTERVALS = { monthly: 'Monatlich', yearly: 'Jährlich', once: 'Einmalig' };

// Anteil von Timo an den gemeinsamen Kosten in Prozent (Standard 60/40)
function getBudgetShare() {
  const v = parseInt(localStorage.getItem('lanatimohome_budget_share'), 10);
  return isNaN(v) ? 60 : Math.min(100, Math.max(0, v));
}

// Monatlicher Betrag: jährliche Posten /12, einmalige zählen nicht zum Monat
function budgetMonthly(item) {
  const a = Number(item.amount) || 0;
  if (item.interval === 'yearly') return a / 12;
  if (item.interval === 'once') return 0;
  return a;
}

function budgetTotals() {
  const share = getBudgetShare() / 100;
  const t = { shared: 0, timo: 0, lana: 0 };
  budgetStore.items.forEach(i => { if (t[i.kind] !== undefined) t[i.kind] += budgetMonthly(i); });
  const timo = t.timo + t.shared * share;
  const lana = t.lana + t.shared * (1 - share);
  return { shared: t.shared, timo, lana, all: timo + lana };
}

registerWidget({
  id: 'budget', pos: 14, title: 'Budget', icon: 'wallet', color: 'var(--c-budget)', open: openBudget,
  store: budgetStore,
  renderContent: () => {
    if (!budgetStore.items.length) return miniPlaceholder('wallet', 'Keine Ausgaben');
    const t = budgetTotals();
    return miniItem('user', `Timo: ${formatChf(t.timo)}`) + miniItem('user', `Lana: ${formatChf(t.lana)}`);
  },
  getPreview: () => budgetStore.items.length === 0 ? 'Noch leer' : `${formatChf(budgetTotals().all)} / Monat`
});

budgetStore.onChange(() => {
  updateWidget('budget');
  if (currentOverlay === 'budget') renderBudgetList();
});

function openBudget() {
  resetListMemory('budget');
  openOverlay({
    key: 'budget', title: 'Budget', color: 'var(--c-budget)',
    render: () => `
      <div id="budget-summary"></div>
      <div class="list-toolbar">
        <span class="section-title">Ausgaben</span>
        <button id="budget-add-btn" class="btn-add btn-add-sm" aria-label="Ausgabe hinzufügen">${icon('plus', 'sm')}</button>
      </div>
      <div id="budget-list" class="list"></div>`,
    init: () => {
      $('#budget-add-btn').addEventListener('click', () => openBudgetModal(null));
      renderBudgetList();
    }
  });
}

function renderBudgetSummary() {
  const box = $('#budget-summary');
  if (!box) return;
  const t = budgetTotals();
  const share = getBudgetShare();
  box.innerHTML = `
    <div class="budget-split">
      <div class="budget-split-head">
        <span>Gemeinsame Kosten</span>
        <span class="budget-split-val">Timo ${share}% / Lana ${100 - share}%</span>
      </div>
      <input type="range" id="budget-share" min="0" max="100" step="5" value="${share}" aria-label="Aufteilung" />
      <div class="budget-presets">
        ${[50, 60, 70].map(p => `<button class="budget-preset ${p === share ? 'active' : ''}" data-share="${p}">${p}/${100 - p}</button>`).join('')}
      </div>
    </div>
    <div class="budget-cards">
      <div class="budget-card"><div class="budget-card-label">Timo</div><div class="budget-card-val">${formatChf(t.timo)}</div></div>
      <div class="budget-card"><div class="budget-card-label">Lana</div><div class="budget-card-val">${formatChf(t.lana)}</div></div>
    </div>
    <div class="budget-total">Total pro Monat <strong>${formatChf(t.all)}</strong></div>`;
  const setShare = v => {
    localStorage.setItem('lanatimohome_budget_share', String(v));
    updateWidget('budget');
    renderBudgetSummary();
    haptic(5);
  };
  box.querySelector('#budget-share').addEventListener('change', e => setShare(parseInt(e.target.value, 10)));
  box.querySelector('#budget-share').addEventListener('input', e => {
    const v = parseInt(e.target.value, 10);
    box.querySelector('.budget-split-val').textContent = `Timo ${v}% / Lana ${100 - v}%`;
  });
  box.querySelectorAll('.budget-preset').forEach(b => b.addEventListener('click', () => setShare(parseInt(b.dataset.share, 10))));
}

function renderBudgetList() {
  const list = $('#budget-list');
  if (!list) return;
  renderBudgetSummary();
  if (!budgetStore.items.length) {
    list.innerHTML = emptyStateHtml('wallet', 'Keine Ausgaben', 'Trag die erste Ausgabe ein.');
    refreshIcons();
    return;
  }
  let html = '';
  ['shared', 'timo', 'lana'].forEach(kind => {
    const items = budgetStore.items.filter(i => i.kind === kind);
    if (!items.length) return;
    const sum = items.reduce((s, i) => s + budgetMonthly(i), 0);
    html += `<div class="group-title group-title-split"><span>${BUDGET_KINDS[kind]}</span><span>${formatChf(sum)} / Monat</span></div>`;
    html += items.map(item => {
      const sub = [item.category, BUDGET_INTERVALS[item.interval]].filter(Boolean).map(escapeHtml).join(' · ');
      return `
        <div class="list-item clickable ${isNewItem('budget', item.id) ? 'is-new' : ''}" onclick="openBudgetModal('${escapeHtml(item.id)}')">
          <div class="item-content">
            <div class="item-title">${escapeHtml(item.title)}</div>
            <div class="item-sub">${sub}</div>
          </div>
          <div class="budget-amount">${formatChf(item.amount)}</div>
        </div>`;
    }).join('');
  });
  list.innerHTML = html;
  primeList('budget');
  refreshIcons();
}

const BUDGET_FIELDS = [
  { k: 'title', label: 'Ausgabe', placeholder: 'z.B. Miete' },
  { k: 'amount', label: 'Betrag in CHF', type: 'number', placeholder: '0.00' },
  { k: 'kind', label: 'Wer zahlt?', type: 'segmented', options: BUDGET_KINDS },
  { k: 'interval', label: 'Wie oft?', type: 'segmented', options: BUDGET_INTERVALS },
  { k: 'category', label: 'Kategorie', optional: true, placeholder: 'z.B. Wohnen' }
];

function openBudgetModal(id) {
  const item = id === null ? null : budgetStore.find(id);
  if (id !== null && !item) return;
  const values = item || { kind: 'shared', interval: 'monthly' };
  const actions = [];
  if (item) actions.push({ id: 'del', icon: 'trash-2', kind: 'danger', aria: 'Löschen', onClick: () => { closeModal(); budgetStore.remove(item.id, `«${item.title}»`); } });
  actions.push({
    id: 'save', label: item ? 'Speichern' : 'Hinzufügen', kind: 'primary',
    onClick: async (btn, modal) => {
      const row = readFields(modal, BUDGET_FIELDS);
      if (!row) return;
      row.amount = parseFloat(String(row.amount).replace(',', '.'));
      if (isNaN(row.amount) || row.amount < 0) { showToast('Bitte einen gültigen Betrag angeben', 'error'); return; }
      row.category = row.category || null;
      let ok;
      if (item) {
        ok = await saveWithFeedback(btn, async () => ({ error: (await budgetStore.patch(item.id, row)) ? null : new Error('x') }), 'Gespeichert');
      } else {
        ok = await saveWithFeedback(btn, () => budgetStore.insert({ ...row, author: userKey() }), 'Hinzugefügt', `«${row.title}» hinzugefügt`);
      }
      if (ok) setTimeout(() => closeModal(), 500);
    }
  });
  openModal({
    title: item ? 'Ausgabe bearbeiten' : 'Neue Ausgabe',
    body: BUDGET_FIELDS.map(f => fieldHtml(f, values[f.k])).join(''),
    actions,
    onOpen: initSegmented,
    focus: item ? null : '[data-field="title"]'
  });
}
