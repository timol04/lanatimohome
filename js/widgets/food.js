/* ── Essensplan ────────────────────────────────────────────── */
const foodStore = createStore({ table: 'food_plan' });

function mealFor(day) {
  return foodStore.items.find(f => f.day === day)?.meal || '';
}

registerWidget({
  id: 'food', pos: 7, title: 'Essensplan', icon: 'utensils', color: 'var(--c-food)', open: openFoodPlan,
  store: foodStore,
  renderContent: () => {
    const today = mealFor(todayName());
    const tomorrow = mealFor(tomorrowName());
    let html = '';
    if (today) html += miniItem('utensils', `Heute: ${today}`);
    if (tomorrow) html += miniItem('utensils', `Morgen: ${tomorrow}`, 'is-muted');
    return html || miniPlaceholder('chef-hat', 'Nichts geplant');
  },
  getPreview: () => mealFor(todayName()) || 'Nichts geplant'
});

foodStore.onChange(() => {
  updateWidget('food');
  if (currentOverlay === 'food') updateFoodCards();
});

function openFoodPlan() {
  const today = todayName();
  openOverlay({
    key: 'food', title: 'Essensplan', color: 'var(--c-food)',
    render: () => `<div class="food-list">${WEEKDAYS.map(day => `
      <div class="food-day-card ${day === today ? 'is-today' : ''}" data-day="${day}">
        <div class="food-day-title">${day}${day === today ? '<span class="today-tag">Heute</span>' : ''}</div>
        <div class="food-row">
          <input type="text" class="food-input" data-day="${day}" placeholder="Was gibt's?" value="${escapeHtml(mealFor(day))}" autocomplete="off" enterkeyhint="done" />
          <button class="icon-btn icon-btn-filled food-save" data-day="${day}" aria-label="Speichern" title="Speichern">${icon('check', 'sm')}</button>
          <button class="icon-btn icon-btn-filled food-cart" data-day="${day}" aria-label="Zur Einkaufsliste" title="Zur Einkaufsliste" ${mealFor(day) ? '' : 'hidden'}>${icon('shopping-cart', 'sm')}</button>
        </div>
      </div>`).join('')}</div>`,
    init: () => {
      $$('.food-input').forEach(input => {
        input.addEventListener('keydown', e => { if (e.key === 'Enter') input.blur(); });
        input.addEventListener('change', () => saveFoodPlan(input.dataset.day, input.value, input.closest('.food-day-card').querySelector('.food-save')));
      });
      $$('.food-save').forEach(btn => btn.addEventListener('click', () => {
        const input = $(`.food-input[data-day="${btn.dataset.day}"]`);
        saveFoodPlan(btn.dataset.day, input.value, btn, true);
      }));
      $$('.food-cart').forEach(btn => btn.addEventListener('click', () => addMealToShopping(btn.dataset.day)));
    }
  });
}

// Nur Werte aktualisieren, keine neue Ansicht. Ein Feld, in dem gerade getippt wird, bleibt unangetastet.
function updateFoodCards() {
  $$('.food-day-card').forEach(card => {
    const day = card.dataset.day;
    const input = card.querySelector('.food-input');
    const meal = mealFor(day);
    if (document.activeElement !== input && input.value !== meal) input.value = meal;
    card.querySelector('.food-cart').hidden = !meal;
  });
}

async function saveFoodPlan(day, meal, btn, force = false) {
  const existing = foodStore.items.find(f => f.day === day);
  const trimmed = String(meal).trim();
  if (!force && (existing?.meal || '') === trimmed) return;
  if (!existing && !trimmed) return;

  const work = async () => {
    if (existing && !trimmed) {
      const res = await db.from('food_plan').delete().eq('id', existing.id);
      if (!res.error) { foodStore.items = foodStore.items.filter(f => f.id !== existing.id); foodStore.emit(); }
      return res;
    }
    if (existing) {
      const ok = await foodStore.patch(existing.id, { meal: trimmed });
      return { error: ok ? null : new Error('Speichern fehlgeschlagen') };
    }
    return foodStore.insert({ day, meal: trimmed });
  };
  const msg = trimmed ? `${day}: ${trimmed}` : `${day} geleert`;
  if (btn) await saveWithFeedback(btn, work, '', msg);
  else await work();
}

function addMealToShopping(day) {
  const meal = mealFor(day);
  if (!meal) return;
  openModal({
    title: `Zutaten für ${meal}`,
    body: `
      ${fieldHtml({ k: 'ingredients', label: 'Zutaten (mit Komma trennen)', type: 'textarea', rows: 3, optional: true })}
      ${fieldHtml({ k: 'mode', label: 'Auf die Einkaufsliste als', type: 'segmented', options: { card: 'Eine Menü-Karte', items: 'Einzelne Artikel' } }, 'card')}`,
    focus: '[data-field="ingredients"]',
    onOpen: initSegmented,
    actions: [{
      id: 'add', label: 'Hinzufügen', icon: 'shopping-cart', kind: 'primary',
      onClick: async (btn, modal) => {
        const ingredients = modal.querySelector('[data-field="ingredients"]').value.trim();
        const mode = modal.querySelector('[data-field="mode"]').dataset.value;
        const parts = ingredients.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
        let work;
        if (mode === 'items' && parts.length) {
          work = async () => {
            const res = await db.from('shopping_items').insert(parts.map(text => ({ text, is_done: false, quantity: 1 }))).select();
            if (!res.error) { res.data.forEach(r => { if (!shoppingStore.find(r.id)) shoppingStore.items.push(r); }); shoppingStore.sort(); shoppingStore.emit(); }
            return res;
          };
        } else {
          const text = `[Menü] ${meal}\nZutaten: ${ingredients || '... (nichts eingetragen)'}`;
          work = () => shoppingStore.insert({ text, is_done: false, quantity: 1 });
        }
        const ok = await saveWithFeedback(btn, work, 'Hinzugefügt', `${meal} ist auf der Einkaufsliste`);
        if (ok) setTimeout(() => closeModal(), 500);
      }
    }]
  });
}
