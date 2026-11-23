/* ── Kochbuch (im Essensplan) ──────────────────────────────────
   Rezepte mit Zutaten, Personenzahl und Anleitung. Optional mit Link, aus dem
   die Daten automatisch gelesen werden (Rezept-Angaben der Webseite, «schema.org/Recipe»).
   «Rezept starten» rechnet die Mengen auf die gewünschte Personenzahl um.
   Zutaten gehen über eine Auswahl (Haken / Kreuz) auf die Einkaufsliste.
   Tabelle: supabase/kochbuch.sql
   ============================================================ */
const recipeStore = createStore({ table: 'recipes', order: { col: 'title', asc: true } });

recipeStore.onChange(() => {
  if (currentOverlay === 'food') {
    renderCookbook();
    refreshFoodWeek();
  }
});

function sortedRecipes() {
  return [...recipeStore.items].sort((a, b) => String(a.title).localeCompare(String(b.title), 'de'));
}

// ── Zutaten lesen, umrechnen und schreiben ───────────────────
// Eine Zutat ist { a: Menge (Zahl oder null), u: Einheit, n: Name }, z.B. { a: 200, u: 'g', n: 'Mehl' }.
const FRACTIONS = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 0.125 };
const RE_UNIT = /^(kg|g|mg|l|dl|cl|ml|Liter|EL|TL|Esslöffel|Teelöffel|Prisen?|Bund|Stk\.?|Stück|Dosen?|Pkg\.?|Pck\.?|Päckchen|Packungen?|Zehen?|Becher|Tassen?|Scheiben?|Msp\.?|Messerspitzen?|Handvoll|Würfel|Blatt|Blätter|Zweige?|Stangen?|Knollen?|Gläser|Glas|cm)(?=\s|$)/i;

function parseIngredient(line) {
  let s = String(line ?? '').replace(/\s+/g, ' ').trim();
  if (!s) return null;
  s = s.replace(/^[-•*·]\s*/, '');
  let rest = s.replace(/^(ca\.?|circa|etwa|ungefähr)\s*/i, '');
  let a = null;
  const fr = '[½¼¾⅓⅔⅛]';
  let m;
  if ((m = rest.match(new RegExp(`^(\\d+)\\s*(${fr})`)))) { a = Number(m[1]) + FRACTIONS[m[2]]; }
  else if ((m = rest.match(/^(\d+)\s+(\d+)\/(\d+)/)) && Number(m[3])) { a = Number(m[1]) + Number(m[2]) / Number(m[3]); }
  else if ((m = rest.match(/^(\d+)\/(\d+)/)) && Number(m[2])) { a = Number(m[1]) / Number(m[2]); }
  else if ((m = rest.match(new RegExp(`^(${fr})`)))) { a = FRACTIONS[m[1]]; }
  else if ((m = rest.match(/^(\d+(?:[.,]\d+)?)/))) { a = parseFloat(m[1].replace(',', '.')); }
  if (a === null || !isFinite(a)) return { a: null, u: '', n: s };
  rest = rest.slice(m[0].length);
  // Bereiche wie «2-3» oder «2 bis 3»: die erste Zahl gilt
  rest = rest.replace(/^\s*(?:-|–|bis)\s*\d+(?:[.,]\d+)?/, '').trim();
  let u = '';
  const um = rest.match(RE_UNIT);
  if (um) { u = um[1]; rest = rest.slice(um[0].length).trim(); }
  return { a, u, n: rest };
}

// Menge hübsch darstellen: ½, 1 ¼, 2,5, 250
function formatAmount(x) {
  if (x === null || x === undefined || !isFinite(x)) return '';
  if (x >= 100) return String(Math.round(x));
  if (x >= 10) return String(Math.round(x * 10) / 10).replace('.', ',');
  const whole = Math.floor(x);
  const frac = x - whole;
  const nice = [[0.25, '¼'], [1 / 3, '⅓'], [0.5, '½'], [2 / 3, '⅔'], [0.75, '¾']].find(([v]) => Math.abs(frac - v) < 0.03);
  if (frac < 0.03) return whole > 0 ? String(whole) : formatAmountDecimal(x);
  if (frac > 0.97) return String(whole + 1);
  if (nice) return whole ? `${whole} ${nice[1]}` : nice[1];
  return formatAmountDecimal(x);
}
function formatAmountDecimal(x) {
  return String(Math.round(x * 100) / 100).replace('.', ',');
}

function formatIngredient(ing, factor = 1) {
  if (!ing) return '';
  const amount = ing.a !== null && ing.a !== undefined ? formatAmount(ing.a * factor) : '';
  return [amount, ing.u, ing.n].filter(Boolean).join(' ');
}

function recipeIngredients(recipe) {
  return Array.isArray(recipe?.ingredients) ? recipe.ingredients.filter(i => i && (i.n || i.a)) : [];
}
function recipeSteps(recipe) {
  return String(recipe?.instructions || '').split('\n').map(s => s.trim()).filter(Boolean);
}
function recipeServings(recipe) {
  return Math.max(1, parseInt(recipe?.servings, 10) || 2);
}

// ── Rezept aus einer Webseite lesen ──────────────────────────
// Fast alle Rezeptseiten (Betty Bossi, Fooby, Swissmilk, Chefkoch, …) liefern die Angaben
// maschinenlesbar mit. DOMParser führt dabei keine Skripte der fremden Seite aus.
function decodeEntities(str) {
  const s = String(str ?? '');
  if (!/[&<]/.test(s)) return s.trim();
  const doc = new DOMParser().parseFromString(`<!doctype html><body>${s}`, 'text/html');
  return (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
}

function findRecipeNode(node, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) { const r = findRecipeNode(n, depth + 1); if (r) return r; }
    return null;
  }
  const type = node['@type'];
  if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) return node;
  if (node['@graph']) return findRecipeNode(node['@graph'], depth + 1);
  if (node.mainEntity) return findRecipeNode(node.mainEntity, depth + 1);
  return null;
}

function instructionLines(ins, depth = 0) {
  if (!ins || depth > 4) return [];
  if (typeof ins === 'string') return ins.replace(/<br\s*\/?>|<\/p>|<\/li>/gi, '\n').split(/\n+/).map(decodeEntities).filter(Boolean);
  if (Array.isArray(ins)) return ins.flatMap(i => instructionLines(i, depth + 1));
  if (ins.itemListElement) return instructionLines(ins.itemListElement, depth + 1);
  if (ins.text) return instructionLines(String(ins.text), depth + 1);
  if (ins.name) return instructionLines(String(ins.name), depth + 1);
  return [];
}

function parseYield(y) {
  const first = Array.isArray(y) ? y.find(v => /\d/.test(String(v))) ?? y[0] : y;
  const m = String(first ?? '').match(/\d+/);
  return m ? Math.max(1, Math.min(50, parseInt(m[0], 10))) : null;
}

function parseRecipeHtml(html, url) {
  if (!html) return null;
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let node = null;
  for (const script of doc.querySelectorAll('script[type="application/ld+json"]')) {
    try { node = findRecipeNode(JSON.parse(script.textContent)); } catch (e) { /* kaputtes JSON überspringen */ }
    if (node) break;
  }
  const meta = prop => doc.querySelector(`meta[property="${prop}"]`)?.getAttribute('content') || '';
  if (!node) {
    const title = decodeEntities(meta('og:title') || doc.title || '');
    return title ? { title, servings: null, ingredients: [], instructions: '', image: safeUrl(meta('og:image')), source_url: url, partial: true } : null;
  }
  let image = node.image;
  if (Array.isArray(image)) image = image[0];
  if (image && typeof image === 'object') image = image.url || image.contentUrl;
  if (typeof image === 'string' && image.startsWith('//')) image = 'https:' + image;
  const ingredients = (Array.isArray(node.recipeIngredient) ? node.recipeIngredient : node.ingredients || [])
    .map(l => parseIngredient(decodeEntities(l))).filter(Boolean);
  return {
    title: decodeEntities(node.name || meta('og:title') || ''),
    servings: parseYield(node.recipeYield),
    ingredients,
    instructions: instructionLines(node.recipeInstructions).join('\n'),
    image: safeUrl(typeof image === 'string' ? image : '') || safeUrl(meta('og:image')),
    source_url: url,
    partial: !ingredients.length
  };
}

// Zuerst über unsere Edge Function (liefert mit mode 'html' die Seite), sonst Ausweichweg vom Gerät
async function fetchRecipeFromUrl(url) {
  try {
    const { data, error } = await db.functions.invoke('scrape-link', { body: { url, mode: 'html' } });
    if (!error && data?.html) {
      const r = parseRecipeHtml(data.html, url);
      if (r && !r.partial) return r;
    }
  } catch (e) { console.warn('Edge Function für Rezept fehlgeschlagen', e); }
  try {
    // Hinweis: Der Link geht dabei an corsproxy.io bzw. allorigins.win (wie bei den Anschaffungen)
    let html = '';
    const corsRes = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`);
    if (corsRes.ok) html = await corsRes.text();
    if (!html || !/Recipe/.test(html)) {
      const allRes = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
      if (allRes.ok) html = (await allRes.json()).contents || html;
    }
    return parseRecipeHtml(html, url);
  } catch (e) {
    console.warn('Ausweichweg für Rezept fehlgeschlagen', e);
    return null;
  }
}

// ── Kochbuch-Ansicht (zweiter Reiter im Essensplan) ──────────
function cookbookHtml() {
  return `
    <div class="input-row input-row-tight">
      <input type="url" id="new-recipe-url" placeholder="Link zum Rezept einfügen (z.B. bettybossi.ch/…)" autocomplete="off" />
      <button id="scan-recipe-btn" class="btn-add btn-add-wide">${icon('scan-line', 'sm')}<span>Scannen</span></button>
    </div>
    <button id="manual-recipe-btn" class="link-btn">${icon('pencil', 'xs')}<span>Ohne Link von Hand eintragen</span></button>
    <div class="list-toolbar"><span class="section-title">Rezepte</span></div>
    <div id="cookbook-list" class="list"></div>`;
}

function initCookbook() {
  $('#scan-recipe-btn').addEventListener('click', scanRecipeUrl);
  $('#new-recipe-url').addEventListener('keydown', e => { if (e.key === 'Enter') scanRecipeUrl(); });
  $('#manual-recipe-btn').addEventListener('click', () => openRecipeEditor(null));
  // Ein Klick-Verteiler für die ganze Liste (keine onclick-Attribute mit Nutzertext)
  $('#cookbook-list').addEventListener('click', e => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.closest('[data-id]')?.dataset.id;
    const act = btn.dataset.act;
    if (act === 'cook') openRecipeView(id);
    else if (act === 'edit') openRecipeEditor(id);
    else if (act === 'plan') openAddRecipeToPlan(id);
    else if (act === 'cart') openRecipeShopping(id);
    else if (act === 'link') { const u = safeUrl(recipeStore.find(id)?.source_url); if (u) window.open(u, '_blank', 'noopener'); }
    else if (act === 'del') deleteRecipe(id);
  });
  renderCookbook();
}

function renderCookbook() {
  const list = $('#cookbook-list');
  if (!list) return;
  if (!recipeStore.loaded) {
    list.innerHTML = emptyStateHtml('book-open', 'Kochbuch noch nicht bereit', 'Die Rezept-Tabelle fehlt noch in Supabase (supabase/kochbuch.sql ausführen) oder es gibt keine Verbindung.');
    refreshIcons();
    return;
  }
  const items = sortedRecipes();
  if (!items.length) {
    list.innerHTML = emptyStateHtml('book-open', 'Noch keine Rezepte', 'Füge oben einen Link ein oder trage ein Rezept von Hand ein.');
    refreshIcons();
    return;
  }
  list.innerHTML = items.map(r => {
    const img = safeUrl(r.image);
    const link = safeUrl(r.source_url);
    const count = recipeIngredients(r).length;
    const sub = [`${recipeServings(r)} Personen`, `${count} ${count === 1 ? 'Zutat' : 'Zutaten'}`].join(' · ');
    return `
      <div class="list-item recipe-item ${isNewItem('recipes', r.id) ? 'is-new' : ''}" data-id="${escapeHtml(r.id)}">
        ${img ? `<img class="wish-thumb" src="${escapeHtml(img)}" alt="" loading="lazy" />` : `<div class="recipe-thumb-empty">${icon('chef-hat', 'sm')}</div>`}
        <div class="item-content clickable" data-act="edit">
          <div class="item-title truncate">${escapeHtml(r.title)}</div>
          <div class="item-sub truncate">${escapeHtml(sub)}</div>
        </div>
        <div class="item-actions">
          <button class="pill-btn recipe-start" data-act="cook" aria-label="Rezept starten">${icon('play', 'xs')}<span>Starten</span></button>
          <button class="icon-btn" data-act="plan" aria-label="In den Essensplan" title="In den Essensplan">${icon('calendar-plus', 'sm')}</button>
          <button class="icon-btn" data-act="cart" aria-label="Zur Einkaufsliste" title="Zur Einkaufsliste">${icon('shopping-cart', 'sm')}</button>
          ${link ? `<button class="icon-btn" data-act="link" aria-label="Link öffnen" title="Link öffnen">${icon('external-link', 'sm')}</button>` : ''}
          <button class="icon-btn item-delete" data-act="del" aria-label="Löschen">${icon('trash-2', 'sm')}</button>
        </div>
      </div>`;
  }).join('');
  primeList('recipes');
  refreshIcons();
}

async function scanRecipeUrl() {
  const urlInput = $('#new-recipe-url');
  const btn = $('#scan-recipe-btn');
  const url = safeUrl(urlInput.value.trim());
  if (!url) {
    showToast('Bitte einen gültigen Link eingeben', 'error');
    urlInput.focus();
    return;
  }
  if (btn.disabled) return;
  urlInput.value = url;
  btn.disabled = true;
  btn.innerHTML = `${icon('loader', 'sm', 'spin')}<span>Lade…</span>`;
  refreshIcons();
  let result = null;
  try {
    result = await fetchRecipeFromUrl(url);
  } finally {
    if (btn.isConnected) {
      btn.disabled = false;
      btn.innerHTML = `${icon('scan-line', 'sm')}<span>Scannen</span>`;
      refreshIcons();
    }
  }
  if (result && !result.partial) showToast('Rezept gefunden – bitte prüfen', 'success');
  else if (result) showToast('Nur der Titel gefunden – Zutaten bitte von Hand ergänzen', 'info');
  else showToast('Scan fehlgeschlagen – bitte von Hand ausfüllen', 'error');
  openRecipeEditor(null, result || { source_url: url });
}

// ── Rezept anlegen / bearbeiten (gleiches Popup wie bei den anderen Listen) ──
function openRecipeEditor(id, prefill = null) {
  const existing = id ? recipeStore.find(id) : null;
  if (id && !existing) return;
  const r = existing || prefill || {};
  const fields = [
    { k: 'title', label: 'Rezept' },
    { k: 'servings', label: 'Für wie viele Personen?', type: 'number' },
    { k: 'ingredients', label: 'Zutaten (eine pro Zeile, z.B. «200 g Mehl»)', type: 'textarea', rows: 7, optional: true },
    { k: 'instructions', label: 'Anleitung (ein Schritt pro Zeile)', type: 'textarea', rows: 7, optional: true },
    { k: 'source_url', label: 'Link', type: 'url', optional: true }
  ];
  const values = {
    title: r.title || '',
    servings: String(r.servings || 2),
    ingredients: recipeIngredients(r).map(i => formatIngredient(i)).join('\n'),
    instructions: r.instructions || '',
    source_url: r.source_url || ''
  };
  const image = safeUrl(r.image);
  const actions = [];
  if (existing) actions.push({ id: 'del', icon: 'trash-2', kind: 'danger', aria: 'Löschen', onClick: () => { closeModal(); deleteRecipe(existing.id); } });
  actions.push({
    id: 'save', label: existing ? 'Speichern' : 'Ins Kochbuch', icon: existing ? '' : 'book-open', kind: 'primary',
    onClick: async (btn, modal) => {
      const raw = readFields(modal, fields);
      if (!raw) return;
      const row = {
        title: raw.title,
        servings: Math.max(1, Math.min(50, parseInt(raw.servings, 10) || 2)),
        ingredients: raw.ingredients.split('\n').map(parseIngredient).filter(Boolean),
        instructions: raw.instructions.split('\n').map(s => s.trim()).filter(Boolean).join('\n'),
        source_url: safeUrl(raw.source_url) || null
      };
      let work;
      if (existing) {
        work = async () => ({ error: (await recipeStore.patch(existing.id, row)) ? null : new Error('Speichern fehlgeschlagen') });
      } else {
        row.image = image || null;
        row.author = userKey();
        work = () => recipeStore.insert(row);
      }
      const ok = await saveWithFeedback(btn, work, existing ? 'Gespeichert' : 'Hinzugefügt', existing ? 'Rezept gespeichert' : `«${row.title}» ist im Kochbuch`);
      if (!ok) return; // Eingaben bleiben erhalten
      if (!existing) { const u = $('#new-recipe-url'); if (u) u.value = ''; }
      setTimeout(() => closeModal(), 500);
    }
  });
  openModal({
    title: existing ? 'Rezept bearbeiten' : 'Neues Rezept',
    body: `${image ? `<img class="recipe-hero" src="${escapeHtml(image)}" alt="" />` : ''}${fields.map(f => fieldHtml(f, values[f.k])).join('')}`,
    focus: existing || prefill?.title ? null : '[data-field="title"]',
    actions
  });
}

function deleteRecipe(id) {
  const r = recipeStore.find(id);
  recipeStore.remove(id, r ? `«${r.title}»` : 'Rezept');
}

// ── Rezept ansehen und kochen ────────────────────────────────
// planEntry: Eintrag aus dem Essensplan (dann wird die Personenzahl dort gemerkt)
function openRecipeView(id, { planEntry = null } = {}) {
  const r = recipeStore.find(id);
  if (!r) { showToast('Rezept nicht gefunden', 'error'); return; }
  const base = recipeServings(r);
  const state = { persons: parseInt(planEntry?.servings, 10) || base, cooking: false, doneIng: new Set(), doneSteps: new Set() };

  const ingRows = () => {
    const ings = recipeIngredients(r);
    if (!ings.length) return `<p class="modal-text">Keine Zutaten eingetragen.</p>`;
    const factor = state.persons / base;
    return `<ul class="recipe-ings">${ings.map((ing, i) => {
      const amount = ing.a !== null && ing.a !== undefined ? formatAmount(ing.a * factor) : '';
      const amountHtml = `<span class="recipe-amount">${escapeHtml([amount, ing.u].filter(Boolean).join(' '))}</span>`;
      const nameHtml = `<span class="recipe-ing-name">${escapeHtml(ing.n)}</span>`;
      return state.cooking
        ? `<li><button class="recipe-tick ${state.doneIng.has(i) ? 'is-done' : ''}" data-ing="${i}">${icon('check', 'xs')}</button>${amountHtml}${nameHtml}</li>`
        : `<li>${amountHtml}${nameHtml}</li>`;
    }).join('')}</ul>`;
  };
  const stepRows = () => {
    const steps = recipeSteps(r);
    if (!steps.length) return `<p class="modal-text">Keine Anleitung eingetragen.</p>`;
    return `<ol class="recipe-steps">${steps.map((s, i) => `
      <li class="${state.cooking && state.doneSteps.has(i) ? 'is-done' : ''}" ${state.cooking ? `data-step="${i}"` : ''}>
        <span class="recipe-step-no">${i + 1}</span><span class="recipe-step-text">${escapeHtml(s)}</span>
      </li>`).join('')}</ol>`;
  };

  const render = modal => {
    const body = modal.querySelector('.modal-body');
    const img = safeUrl(r.image);
    const link = safeUrl(r.source_url);
    body.innerHTML = `
      ${img && !state.cooking ? `<img class="recipe-hero" src="${escapeHtml(img)}" alt="" />` : ''}
      <div class="recipe-persons">
        <span class="field-label">Personen</span>
        <div class="stepper stepper-lg">
          <button data-persons="-1" aria-label="Weniger" ${state.persons <= 1 ? 'disabled' : ''}>${icon('minus', 'xs')}</button>
          <span>${state.persons}</span>
          <button data-persons="1" aria-label="Mehr" ${state.persons >= 50 ? 'disabled' : ''}>${icon('plus', 'xs')}</button>
        </div>
        ${state.persons !== base ? `<span class="muted recipe-base">Rezept für ${base}</span>` : ''}
      </div>
      <div class="card-kicker recipe-kicker">Zutaten</div>
      ${ingRows()}
      <div class="card-kicker recipe-kicker">Anleitung</div>
      ${stepRows()}
      ${link ? `<button class="link-btn recipe-source" data-open-link>${icon('external-link', 'xs')}<span>Originalrezept öffnen</span></button>` : ''}`;
    const startBtn = modal.querySelector('[data-action="start"] span');
    if (startBtn) startBtn.textContent = state.cooking ? 'Fertig gekocht' : 'Rezept starten';
    refreshIcons();
  };

  const modal = openModal({
    title: r.title,
    body: '',
    actions: [
      { id: 'cart', icon: 'shopping-cart', kind: 'secondary', aria: 'Zur Einkaufsliste', onClick: () => openRecipeShopping(r.id, state.persons) },
      { id: 'start', label: 'Rezept starten', icon: 'chef-hat', kind: 'primary', onClick: () => {
        if (state.cooking) { closeModal(); showToast('En Guete!', 'success'); return; }
        state.cooking = true;
        haptic();
        render(modal);
        modal.querySelector('.modal-card').scrollTop = 0;
      } }
    ]
  });
  modal.classList.add('modal-wide');

  let saveTimer = null;
  modal.querySelector('.modal-body').addEventListener('click', e => {
    const p = e.target.closest('[data-persons]');
    if (p) {
      state.persons = Math.max(1, Math.min(50, state.persons + Number(p.dataset.persons)));
      haptic(5);
      render(modal);
      // Personenzahl im Essensplan merken (kurz warten, falls mehrmals getippt wird)
      if (planEntry) {
        clearTimeout(saveTimer);
        saveTimer = setTimeout(() => {
          const cur = foodStore.find(planEntry.id);
          if (cur && cur.recipe_id === r.id && cur.servings !== state.persons) foodStore.patch(cur.id, { servings: state.persons });
        }, 600);
      }
      return;
    }
    const ing = e.target.closest('[data-ing]');
    if (ing) {
      const i = Number(ing.dataset.ing);
      state.doneIng.has(i) ? state.doneIng.delete(i) : state.doneIng.add(i);
      haptic(5);
      render(modal);
      return;
    }
    const step = e.target.closest('[data-step]');
    if (step) {
      const i = Number(step.dataset.step);
      state.doneSteps.has(i) ? state.doneSteps.delete(i) : state.doneSteps.add(i);
      haptic(5);
      render(modal);
      return;
    }
    if (e.target.closest('[data-open-link]')) {
      const u = safeUrl(r.source_url);
      if (u) window.open(u, '_blank', 'noopener');
    }
  });
  render(modal);
}

// ── Rezept in den Essensplan ─────────────────────────────────
function openAddRecipeToPlan(id) {
  const r = recipeStore.find(id);
  if (!r) return;
  const today = todayName();
  const dayOptions = Object.fromEntries(WEEKDAYS.map(d => {
    const meal = mealFor(d);
    return [d, `${d}${d === today ? ' (heute)' : ''}${meal ? ` – ersetzt «${meal}»` : ''}`];
  }));
  const firstFree = WEEKDAYS.slice(WEEKDAYS.indexOf(today)).find(d => !mealFor(d)) || today;
  openModal({
    title: `${r.title} einplanen`,
    body: `
      ${fieldHtml({ k: 'day', label: 'An welchem Tag?', type: 'select', options: dayOptions }, firstFree)}
      ${fieldHtml({ k: 'servings', label: 'Für wie viele Personen?', type: 'number' }, String(recipeServings(r)))}`,
    actions: [{
      id: 'add', label: 'Einplanen', icon: 'calendar-plus', kind: 'primary',
      onClick: async (btn, modal) => {
        const day = modal.querySelector('[data-field="day"]').value;
        const servings = Math.max(1, Math.min(50, parseInt(modal.querySelector('[data-field="servings"]').value, 10) || recipeServings(r)));
        const ok = await saveWithFeedback(btn, () => setPlanRecipe(day, r, servings), 'Eingeplant', `${day}: ${r.title}`);
        if (ok) setTimeout(() => closeModal(), 500);
      }
    }]
  });
}

// Setzt ein Rezept für einen Tag (ersetzt, was dort stand). Liefert { error }.
async function setPlanRecipe(day, recipe, servings) {
  const existing = foodStore.items.find(f => f.day === day);
  const row = { meal: recipe.title, recipe_id: recipe.id, servings };
  if (existing) return { error: (await foodStore.patch(existing.id, row)) ? null : new Error('Speichern fehlgeschlagen') };
  return foodStore.insert({ day, ...row });
}

// Aus dem Essensplan: Rezept für einen Tag auswählen
function openPickRecipeForDay(day) {
  const items = sortedRecipes();
  if (!items.length) {
    showToast(recipeStore.loaded ? 'Noch keine Rezepte im Kochbuch' : 'Kochbuch noch nicht eingerichtet', 'info');
    showFoodTab('cookbook');
    return;
  }
  const modal = openModal({
    title: `Rezept für ${day}`,
    body: `<div class="recipe-pick">${items.map(r => `
      <button class="recipe-pick-item" data-id="${escapeHtml(r.id)}">
        ${icon('chef-hat', 'sm')}
        <span class="recipe-pick-title">${escapeHtml(r.title)}</span>
        <span class="muted">${recipeServings(r)} P.</span>
      </button>`).join('')}</div>`
  });
  modal.querySelector('.recipe-pick').addEventListener('click', async e => {
    const b = e.target.closest('[data-id]');
    if (!b || b.disabled) return;
    const r = recipeStore.find(b.dataset.id);
    if (!r) return;
    b.disabled = true;
    const { error } = await setPlanRecipe(day, r, recipeServings(r));
    if (error) { b.disabled = false; showToast('Nicht gespeichert – bitte nochmal versuchen', 'error'); return; }
    showToast(`${day}: ${r.title}`, 'success');
    haptic();
    closeModal();
  });
}

// ── Zutaten auswählen → Einkaufsliste ────────────────────────
// Wird für Rezepte und für normale Essensplan-Einträge verwendet.
// entries: [{ text }] – alle sind zuerst angehakt, mit dem Kreuz fliegt eine Zutat raus.
function openIngredientPicker({ title, entries, hint = '' }) {
  if (!entries.length) { showToast('Keine Zutaten vorhanden', 'info'); return; }
  const picked = entries.map(() => true);
  const modal = openModal({
    title,
    body: `
      ${hint ? `<p class="modal-text picker-hint">${escapeHtml(hint)}</p>` : ''}
      <div class="picker-tools">
        <button class="pill-btn" data-all="1">${icon('check-check', 'xs')}<span>Alle</span></button>
        <button class="pill-btn" data-all="0">${icon('x', 'xs')}<span>Keine</span></button>
      </div>
      <div class="picker-list">${entries.map((en, i) => `
        <button class="picker-row is-on" data-i="${i}" aria-pressed="true">
          <span class="picker-mark">${icon('check', 'xs')}</span>
          <span class="picker-text">${escapeHtml(en.text)}</span>
        </button>`).join('')}</div>`,
    actions: [{
      id: 'add', label: 'Hinzufügen', icon: 'shopping-cart', kind: 'primary',
      onClick: async btn => {
        const texts = entries.filter((_, i) => picked[i]).map(en => en.text);
        if (!texts.length) { showToast('Nichts ausgewählt', 'info'); return; }
        const ok = await saveWithFeedback(btn, () => addShoppingTexts(texts), 'Hinzugefügt',
          texts.length === 1 ? `«${texts[0]}» ist auf der Einkaufsliste` : `${texts.length} Zutaten sind auf der Einkaufsliste`);
        if (ok) setTimeout(() => closeModal(), 500);
      }
    }]
  });
  const update = () => {
    $$('.picker-row', modal).forEach(row => {
      const on = picked[Number(row.dataset.i)];
      row.classList.toggle('is-on', on);
      row.setAttribute('aria-pressed', String(on));
      row.querySelector('.picker-mark').innerHTML = icon(on ? 'check' : 'x', 'xs');
    });
    const n = picked.filter(Boolean).length;
    const label = modal.querySelector('[data-action="add"] span');
    if (label && !modal.querySelector('[data-action="add"]').dataset.state) label.textContent = n ? `${n} hinzufügen` : 'Nichts ausgewählt';
    refreshIcons();
  };
  modal.querySelector('.modal-body').addEventListener('click', e => {
    const all = e.target.closest('[data-all]');
    if (all) { picked.fill(all.dataset.all === '1'); haptic(5); update(); return; }
    const row = e.target.closest('.picker-row');
    if (row) { const i = Number(row.dataset.i); picked[i] = !picked[i]; haptic(5); update(); }
  });
  update();
}

function openRecipeShopping(id, persons = null) {
  const r = recipeStore.find(id);
  if (!r) return;
  const base = recipeServings(r);
  const p = persons || base;
  openIngredientPicker({
    title: `Zutaten für ${r.title}`,
    hint: `Für ${p} ${p === 1 ? 'Person' : 'Personen'}. Antippen, was schon zuhause ist.`,
    entries: recipeIngredients(r).map(ing => ({ text: formatIngredient(ing, p / base) }))
  });
}
