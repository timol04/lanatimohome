/* ── Essensplan ────────────────────────────────────────────── */
const foodStore = createStore({ table: 'food_plan' });

function mealFor(day) {
  return foodStore.items.find(f => f.day === day)?.meal || '';
}

// Eintrag eines Tages und (falls verknüpft und noch vorhanden) sein Rezept aus dem Kochbuch
function planEntry(day) {
  return foodStore.items.find(f => f.day === day) || null;
}
function planRecipe(entry) {
  return entry?.recipe_id ? recipeStore.find(entry.recipe_id) || null : null;
}

registerWidget({
  id: 'food', pos: 7, title: 'Essensplan', icon: 'utensils', color: 'var(--c-food)', open: openFoodPlan,
  store: foodStore,
  renderContent: () => {
    const today = mealFor(todayName());
    const tomorrow = mealFor(tomorrowName());
    const ic = day => planRecipe(planEntry(day)) ? 'chef-hat' : 'utensils';
    let html = '';
    if (today) html += miniItem(ic(todayName()), `Heute: ${today}`);
    if (tomorrow) html += miniItem(ic(tomorrowName()), `Morgen: ${tomorrow}`, 'is-muted');
    return html || miniPlaceholder('chef-hat', 'Nichts geplant');
  },
  getPreview: () => mealFor(todayName()) || 'Nichts geplant'
});

foodStore.onChange(() => {
  updateWidget('food');
  if (currentOverlay === 'food') refreshFoodWeek();
});

// Reiter in der Detailansicht: Wochenplan oder Kochbuch (bleibt gemerkt, solange die App offen ist)
let foodTab = 'week';

function openFoodPlan() {
  resetListMemory('recipes');
  openOverlay({
    key: 'food', title: 'Essensplan', color: 'var(--c-food)',
    render: () => `
      <div class="segmented food-tabs" id="food-tabs" data-value="${foodTab}">
        <button type="button" data-value="week" class="${foodTab === 'week' ? 'active' : ''}">${icon('calendar-days', 'xs')}<span>Wochenplan</span></button>
        <button type="button" data-value="cookbook" class="${foodTab === 'cookbook' ? 'active' : ''}">${icon('book-open', 'xs')}<span>Kochbuch</span></button>
      </div>
      <div id="food-week" ${foodTab === 'week' ? '' : 'hidden'}>
        <div class="food-list">${WEEKDAYS.map(foodDayCardHtml).join('')}</div>
      </div>
      <div id="food-cookbook" ${foodTab === 'cookbook' ? '' : 'hidden'}>${cookbookHtml()}</div>`,
    init: () => {
      $('#food-tabs').addEventListener('click', e => {
        const b = e.target.closest('button[data-value]');
        if (b) showFoodTab(b.dataset.value);
      });
      initFoodWeek();
      initCookbook();
    }
  });
}

function showFoodTab(tab) {
  foodTab = tab;
  const tabs = $('#food-tabs');
  if (!tabs) return;
  tabs.dataset.value = tab;
  $$('button', tabs).forEach(x => x.classList.toggle('active', x.dataset.value === tab));
  $('#food-week').hidden = tab !== 'week';
  $('#food-cookbook').hidden = tab !== 'cookbook';
  $('#overlay-content').scrollTop = 0;
  haptic(5);
}

// Ein Tag: entweder Textfeld (wie bisher) oder – wenn ein Rezept verknüpft ist – ein Knopf, der das Rezept öffnet
function foodCardMode(day) {
  const r = planRecipe(planEntry(day));
  return r ? `recipe:${r.id}` : 'text';
}

function foodDayCardHtml(day) {
  const today = todayName();
  const entry = planEntry(day);
  const recipe = planRecipe(entry);
  let row;
  if (recipe) {
    const persons = parseInt(entry.servings, 10) || recipeServings(recipe);
    row = `
      <button class="food-recipe-btn" data-act="open-recipe" aria-label="Rezept öffnen">
        <span class="food-recipe-icon">${icon('chef-hat', 'sm')}</span>
        <span class="food-recipe-text">
          <span class="food-recipe-title">${escapeHtml(entry.meal || recipe.title)}</span>
          <span class="food-recipe-sub">${persons} ${persons === 1 ? 'Person' : 'Personen'} · Rezept öffnen</span>
        </span>
        ${icon('chevron-right', 'sm')}
      </button>
      <button class="icon-btn icon-btn-filled" data-act="cart" aria-label="Zur Einkaufsliste" title="Zur Einkaufsliste">${icon('shopping-cart', 'sm')}</button>
      <button class="icon-btn icon-btn-filled" data-act="unlink" aria-label="Rezept-Verknüpfung lösen" title="Rezept lösen (Text bleibt)">${icon('unlink', 'sm')}</button>`;
  } else {
    const meal = mealFor(day);
    row = `
      <input type="text" class="food-input" data-day="${day}" placeholder="Was gibt's?" value="${escapeHtml(meal)}" autocomplete="off" enterkeyhint="done" />
      <button class="icon-btn icon-btn-filled food-save" data-act="save" aria-label="Speichern" title="Speichern">${icon('check', 'sm')}</button>
      <button class="icon-btn icon-btn-filled food-pick" data-act="pick" aria-label="Rezept aus dem Kochbuch" title="Rezept aus dem Kochbuch">${icon('book-open', 'sm')}</button>
      <button class="icon-btn icon-btn-filled food-cart" data-act="cart" aria-label="Zur Einkaufsliste" title="Zur Einkaufsliste" ${meal ? '' : 'hidden'}>${icon('shopping-cart', 'sm')}</button>`;
  }
  return `
    <div class="food-day-card ${day === today ? 'is-today' : ''}" data-day="${day}" data-mode="${escapeHtml(foodCardMode(day))}">
      <div class="food-day-title">${day}${day === today ? '<span class="today-tag">Heute</span>' : ''}</div>
      <div class="food-row">${row}</div>
    </div>`;
}

// Alle Klicks und Eingaben über die Wochenansicht verteilen (überlebt das Neuzeichnen einzelner Tage)
function initFoodWeek() {
  const week = $('#food-week');
  week.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.classList.contains('food-input')) e.target.blur();
  });
  week.addEventListener('change', e => {
    const input = e.target.closest('.food-input');
    if (input) saveFoodPlan(input.dataset.day, input.value, input.closest('.food-day-card').querySelector('.food-save'));
  });
  week.addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const day = btn.closest('.food-day-card')?.dataset.day;
    if (!day) return;
    const act = btn.dataset.act;
    const entry = planEntry(day);
    const recipe = planRecipe(entry);
    if (act === 'save') {
      const input = $(`.food-input[data-day="${day}"]`);
      if (input) saveFoodPlan(day, input.value, btn, true);
    } else if (act === 'pick') openPickRecipeForDay(day);
    else if (act === 'open-recipe' && recipe) openRecipeView(recipe.id, { planEntry: entry });
    else if (act === 'cart') {
      if (recipe) openRecipeShopping(recipe.id, parseInt(entry.servings, 10) || null);
      else addMealToShopping(day);
    } else if (act === 'unlink' && entry) {
      foodStore.patch(entry.id, { recipe_id: null, servings: null });
      showToast('Rezept gelöst, der Text bleibt im Plan', 'info');
    }
  });
}

// Nach Änderungen: Tage mit geänderter Art (Text ↔ Rezept) neu zeichnen, sonst nur Werte aktualisieren.
// Ein Feld, in dem gerade getippt wird, bleibt unangetastet.
function refreshFoodWeek() {
  $$('#food-week .food-day-card').forEach(card => {
    const day = card.dataset.day;
    const mode = foodCardMode(day);
    if (card.dataset.mode !== mode || mode !== 'text') {
      if (card.contains(document.activeElement) && document.activeElement.tagName === 'INPUT') return;
      card.outerHTML = foodDayCardHtml(day);
      return;
    }
    const input = card.querySelector('.food-input');
    const meal = mealFor(day);
    if (input && document.activeElement !== input && input.value !== meal) input.value = meal;
    const cart = card.querySelector('.food-cart');
    if (cart) cart.hidden = !meal;
  });
  refreshIcons();
}
// Alter Name, falls noch irgendwo verwendet
function updateFoodCards() { refreshFoodWeek(); }

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
      // Neuer Text von Hand: eine alte (z.B. gelöschte) Rezept-Verknüpfung gilt nicht mehr
      const patch = existing.recipe_id ? { meal: trimmed, recipe_id: null, servings: null } : { meal: trimmed };
      const ok = await foodStore.patch(existing.id, patch);
      return { error: ok ? null : new Error('Speichern fehlgeschlagen') };
    }
    return foodStore.insert({ day, meal: trimmed });
  };
  const msg = trimmed ? `${day}: ${trimmed}` : `${day} geleert`;
  if (btn) await saveWithFeedback(btn, work, '', msg);
  else await work();
}

// Essensplan-Eintrag ohne Rezept → Einkaufsliste.
// «Einzelne Artikel»: zuerst alle Zutaten zur Auswahl zeigen (Haken / Kreuz), dann hinzufügen.
function addMealToShopping(day) {
  const meal = mealFor(day);
  if (!meal) return;
  openModal({
    title: `Zutaten für ${meal}`,
    body: `
      ${fieldHtml({ k: 'ingredients', label: 'Zutaten (mit Komma oder pro Zeile trennen)', type: 'textarea', rows: 3, optional: true })}
      ${fieldHtml({ k: 'mode', label: 'Auf die Einkaufsliste als', type: 'segmented', options: { items: 'Einzelne Artikel', card: 'Eine Menü-Karte' } }, 'items')}`,
    focus: '[data-field="ingredients"]',
    onOpen: initSegmented,
    actions: [{
      id: 'add', label: 'Weiter', icon: 'arrow-right', kind: 'primary',
      onClick: async (btn, modal) => {
        const ingredients = modal.querySelector('[data-field="ingredients"]').value.trim();
        const mode = modal.querySelector('[data-field="mode"]').dataset.value;
        const parts = ingredients.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
        if (mode === 'items' && parts.length) {
          openIngredientPicker({ title: `Zutaten für ${meal}`, hint: 'Antippen, was schon zuhause ist.', entries: parts.map(text => ({ text })) });
          return;
        }
        if (mode === 'items' && !parts.length) {
          showToast('Bitte zuerst Zutaten eintragen', 'error');
          modal.querySelector('[data-field="ingredients"]').focus();
          return;
        }
        const text = `[Menü] ${meal}\nZutaten: ${ingredients || '... (nichts eingetragen)'}`;
        const ok = await saveWithFeedback(btn, () => shoppingStore.insert({ text, is_done: false, quantity: 1 }), 'Hinzugefügt', `${meal} ist auf der Einkaufsliste`);
        if (ok) setTimeout(() => closeModal(), 500);
      }
    }]
  });
}
