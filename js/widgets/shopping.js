/* ── Einkaufsliste ─────────────────────────────────────────── */
const shoppingStore = createStore({ table: 'shopping_items' });

registerWidget({
  id: 'shopping', pos: 1, title: 'Einkaufsliste', icon: 'shopping-cart', color: 'var(--c-shopping)', open: openShopping,
  store: shoppingStore,
  renderContent: () => {
    const pending = shoppingItems().filter(i => !i.is_done);
    if (!pending.length) return miniPlaceholder('shopping-bag', 'Alles gekauft');
    return pending.slice(0, 3).map(i => miniItem('circle', shoppingTitle(i))).join('');
  },
  getPreview: () => {
    const total = shoppingItems().filter(i => !i.is_done).reduce((sum, i) => sum + (parseInt(i.quantity, 10) || 1), 0);
    return total === 0 ? 'Alles erledigt' : `${total} Artikel`;
  }
});

shoppingStore.onChange(() => {
  updateWidget('shopping');
  if (currentOverlay === 'shopping') renderShoppingList();
});

function shoppingItems() { return shoppingStore.items; }

// Menü-Einträge aus dem Essensplan: "[Menü] Lasagne\nZutaten: ..."
function isMenuItem(item) { return String(item.text).startsWith('[Menü]'); }
function shoppingTitle(item) {
  return isMenuItem(item) ? String(item.text).replace('[Menü] ', '').split('\nZutaten: ')[0] : item.text;
}

function openShopping() {
  resetListMemory('shopping');
  openOverlay({
    key: 'shopping', title: 'Einkaufsliste', color: 'var(--c-shopping)',
    render: () => `
      <div class="input-row">
        <input type="text" id="new-item-input" placeholder="Neuer Artikel…" autocomplete="off" enterkeyhint="done" />
        <button id="add-item-btn" class="btn-add" aria-label="Hinzufügen">${icon('plus', 'md')}</button>
      </div>
      <div class="list-toolbar">
        <span class="section-title">Artikel</span>
        ${clearDoneBtnHtml('clear-done-btn', 'Erledigte löschen', 0)}
      </div>
      <div id="shopping-list" class="list"></div>`,
    init: () => {
      $('#add-item-btn').addEventListener('click', addShoppingItem);
      $('#new-item-input').addEventListener('keydown', e => { if (e.key === 'Enter') addShoppingItem(); });
      $('#clear-done-btn').addEventListener('click', clearDoneShoppingItems);
      renderShoppingList();
    }
  });
}

function renderShoppingList() {
  const list = $('#shopping-list');
  if (!list) return;
  const items = shoppingItems();
  const doneCount = items.filter(i => i.is_done).length;
  const clearBtn = $('#clear-done-btn');
  if (clearBtn) clearBtn.hidden = doneCount === 0;

  const sorted = [...items.filter(i => !i.is_done), ...items.filter(i => i.is_done)];
  if (!sorted.length) {
    list.innerHTML = emptyStateHtml('shopping-bag', 'Alles eingekauft!', 'Der Kühlschrank ist voll. Füge oben neue Artikel hinzu.');
    refreshIcons();
    return;
  }

  list.innerHTML = sorted.map(item => {
    const id = escapeHtml(item.id);
    let content;
    if (isMenuItem(item)) {
      const ingredients = String(item.text).split('\nZutaten: ')[1] || 'Keine Zutaten angegeben';
      content = `<div class="item-title with-icon">${icon('chef-hat', 'xs')}${escapeHtml(shoppingTitle(item))}</div>
                 <div class="item-sub">${escapeHtml(ingredients)}</div>`;
    } else {
      content = `<div class="item-title">${escapeHtml(item.text)}</div>`;
    }
    return `
      <div class="list-item ${item.is_done ? 'done' : ''} ${isNewItem('shopping', item.id) ? 'is-new' : ''} ${lastToggled === String(item.id) ? 'pop' : ''}">
        ${checkHtml(item.is_done, `toggleShoppingItem('${id}')`)}
        <div class="item-content clickable" onclick="openEditModal('shopping','${id}')">${content}</div>
        <div class="item-actions">
          ${stepperHtml(item.quantity || 1, 'updateShoppingQuantity', id)}
          ${deleteBtnHtml(`deleteShoppingItem('${id}')`)}
        </div>
      </div>`;
  }).join('');
  primeList('shopping');
  refreshIcons();
}

async function addShoppingItem() {
  const input = $('#new-item-input');
  const text = input.value.trim();
  if (!text) { input.focus(); return; }
  const ok = await saveWithFeedback($('#add-item-btn'), () => shoppingStore.insert({ text, is_done: false, quantity: 1 }), 'Hinzugefügt', `«${text}» hinzugefügt`);
  if (!ok) return;
  input.value = '';
  input.focus();
}

function toggleShoppingItem(id) {
  const item = shoppingStore.find(id);
  if (!item) return;
  markToggled(id);
  haptic();
  shoppingStore.patch(id, { is_done: !item.is_done });
}

function updateShoppingQuantity(id, delta) {
  const item = shoppingStore.find(id);
  if (!item) return;
  const cur = item.quantity || 1;
  const next = Math.max(1, cur + delta);
  if (next !== cur) shoppingStore.patch(id, { quantity: next });
}

function deleteShoppingItem(id) {
  const item = shoppingStore.find(id);
  shoppingStore.remove(id, item ? `«${shoppingTitle(item)}»` : 'Artikel');
}

function clearDoneShoppingItems() {
  const ids = shoppingItems().filter(i => i.is_done).map(i => i.id);
  if (ids.length) shoppingStore.remove(ids, ids.length > 1 ? 'Artikel' : 'Artikel');
}

// Mehrere Artikel auf einmal hinzufügen (z.B. ausgewählte Zutaten aus dem Essensplan). Liefert { error }.
async function addShoppingTexts(texts) {
  const rows = texts.map(t => String(t).trim()).filter(Boolean).map(text => ({ text, is_done: false, quantity: 1 }));
  if (!rows.length) return { error: null };
  const res = await db.from('shopping_items').insert(rows).select();
  if (!res.error) {
    (res.data || []).forEach(r => { if (!shoppingStore.find(r.id)) shoppingStore.items.push(r); });
    shoppingStore.sort();
    shoppingStore.emit();
  }
  return res;
}
