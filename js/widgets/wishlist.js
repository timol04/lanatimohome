/* ── Anschaffungen (Wunschliste) ───────────────────────────── */
const wishlistStore = createStore({ table: 'wishlist', order: { col: 'created_at', asc: false } });
const PRIO_LABELS = { 0: 'Keine Priorität', 1: 'Prio 1 · Hoch', 2: 'Prio 2 · Mittel', 3: 'Prio 3 · Niedrig' };

registerWidget({
  id: 'wishlist', pos: 13, title: 'Anschaffungen', icon: 'shopping-bag', color: 'var(--c-wishlist)', open: openWishlist,
  store: wishlistStore,
  renderContent: () => {
    const open = sortedWishes().filter(i => !i.is_purchased);
    if (!open.length) return miniPlaceholder('shopping-bag', 'Keine Wünsche');
    const item = open[0];
    return `<div class="mini-title">${escapeHtml(item.title)}</div>${item.price ? `<div class="mini-sub">${escapeHtml(item.price)}</div>` : ''}`;
  },
  getPreview: () => {
    const total = wishlistStore.items.filter(i => !i.is_purchased).reduce((sum, i) => sum + (parseInt(i.quantity, 10) || 1), 0);
    return `${total} Wünsche`;
  }
});

wishlistStore.onChange(() => {
  updateWidget('wishlist');
  if (currentOverlay === 'wishlist') renderWishlist();
});

// Prio 1 zuerst, ohne Prio zuletzt; innerhalb gleich: neueste zuerst (Reihenfolge der Datenbank)
function sortedWishes() {
  const rank = p => (p ? p : 4);
  return [...wishlistStore.items].sort((a, b) => rank(a.prio) - rank(b.prio));
}

let lastScannedImageUrl = '';

function openWishlist() {
  resetListMemory('wishlist');
  lastScannedImageUrl = '';
  openOverlay({
    key: 'wishlist', title: 'Anschaffungen', color: 'var(--c-wishlist)',
    render: () => `
      <div class="input-row input-row-tight">
        <input type="url" id="new-wish-url" placeholder="Link zum Produkt einfügen (z.B. ikea.com/…)" autocomplete="off" />
        <button id="scan-wish-btn" class="btn-add btn-add-wide">${icon('scan-line', 'sm')}<span>Scannen</span></button>
      </div>
      <button id="manual-wish-btn" class="link-btn">${icon('pencil', 'xs')}<span>Ohne Link von Hand eintragen</span></button>
      <div id="wish-preview-box" class="card wish-preview" hidden>
        <div class="card-kicker">Gefundenes Produkt (bitte prüfen)</div>
        <img id="wish-preview-img" alt="" hidden />
        <div class="field"><input type="text" id="new-wish-title" placeholder="Titel (z.B. Sofa SÖDERHAMN)" /></div>
        <div class="field-row">
          <div class="field"><input type="text" id="new-wish-price" placeholder="Preis (z.B. 499 CHF)" /></div>
          <div class="field"><input type="text" id="new-wish-color" placeholder="Farbe (optional)" /></div>
        </div>
        <div class="field">
          <select id="new-wish-prio">${Object.entries(PRIO_LABELS).map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>
        </div>
        <button id="add-wish-btn" class="btn btn-primary btn-block">${icon('plus', 'sm')}<span>Zur Wunschliste hinzufügen</span></button>
      </div>
      <div class="list-toolbar">
        <span class="section-title">Wünsche</span>
        ${clearDoneBtnHtml('clear-purchased-btn', 'Gekaufte löschen', 0)}
      </div>
      <div id="wishlist-list" class="list"></div>`,
    init: () => {
      $('#scan-wish-btn').addEventListener('click', scanWishUrl);
      $('#new-wish-url').addEventListener('keydown', e => { if (e.key === 'Enter') scanWishUrl(); });
      $('#manual-wish-btn').addEventListener('click', () => { showWishPreview({}); $('#new-wish-title').focus(); });
      $('#add-wish-btn').addEventListener('click', addWishItem);
      $('#clear-purchased-btn').addEventListener('click', clearPurchasedWishes);
      renderWishlist();
    }
  });
}

function showWishPreview({ title, price, image }) {
  $('#wish-preview-box').hidden = false;
  $('#manual-wish-btn').hidden = true;
  if (title !== undefined) $('#new-wish-title').value = title || '';
  if (price !== undefined) $('#new-wish-price').value = price || '';
  const img = $('#wish-preview-img');
  const src = safeUrl(image);
  img.hidden = !src;
  if (src) img.src = src;
  lastScannedImageUrl = src;
}

async function scanWishUrl() {
  const urlInput = $('#new-wish-url');
  const btn = $('#scan-wish-btn');
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

  try {
    const { data, error } = await db.functions.invoke('scrape-link', { body: { url } });
    if (error || !data) throw new Error(error?.message || 'Fehler beim Scannen');
    showWishPreview({ title: data.title, price: data.price, image: data.image });
    showToast('Produkt gefunden – bitte prüfen', 'success');
  } catch (err) {
    console.warn('Edge Function fehlgeschlagen, versuche Ausweichweg…', err);
    const result = await scanViaProxy(url);
    if (result) {
      showWishPreview(result);
      showToast('Produkt gefunden – bitte prüfen', 'success');
    } else {
      showWishPreview({});
      showToast('Scan fehlgeschlagen – bitte Felder von Hand ausfüllen', 'error');
    }
  } finally {
    btn.disabled = false;
    btn.innerHTML = `${icon('scan-line', 'sm')}<span>Scannen</span>`;
    refreshIcons();
  }
}

// Ausweichweg direkt vom Gerät (umgeht Sperren von Rechenzentren, z.B. bei Galaxus).
// Hinweis: Der Link geht dabei an corsproxy.io bzw. allorigins.win.
async function scanViaProxy(url) {
  try {
    let html = '';
    const corsRes = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`);
    if (corsRes.ok) html = await corsRes.text();
    else {
      const allRes = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
      if (allRes.ok) html = (await allRes.json()).contents || '';
    }
    if (!html) return null;
    const getMeta = regexList => {
      for (const regex of regexList) {
        const match = html.match(regex);
        if (match?.[1]) return match[1].replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
      }
      return '';
    };
    let title = getMeta([/<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i, /<title[^>]*>([^<]+)<\/title>/i]);
    if (/Galaxus|digitec/.test(title)) title = title.split('- Galaxus')[0].split('| Galaxus')[0].split('- digitec')[0].trim();
    const image = getMeta([/<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i]);
    let price = '';
    const amount = getMeta([/<meta[^>]*property="product:price:amount"[^>]*content="([^"]+)"/i]);
    if (amount) price = `CHF ${amount}`;
    else {
      const m = html.match(/"price"\s*:\s*"?(\d+[.,]\d{0,2})"?/i);
      if (m?.[1]) price = `CHF ${m[1]}`;
    }
    return { title, price, image };
  } catch (e) {
    console.warn('Ausweichweg fehlgeschlagen', e);
    return null;
  }
}

async function addWishItem() {
  const title = $('#new-wish-title').value.trim();
  if (!title) { $('#new-wish-title').focus(); showToast('Bitte einen Titel angeben', 'error'); return; }
  const row = {
    title,
    url: safeUrl($('#new-wish-url').value.trim()) || null,
    price: $('#new-wish-price').value.trim(),
    color: $('#new-wish-color').value.trim(),
    prio: parseInt($('#new-wish-prio').value, 10) || 0,
    image: lastScannedImageUrl || null,
    author: userKey(),
    is_purchased: false,
    quantity: 1
  };
  const ok = await saveWithFeedback($('#add-wish-btn'), () => wishlistStore.insert(row), 'Hinzugefügt', `«${title}» auf der Wunschliste`);
  if (!ok) return; // Eingaben bleiben erhalten
  ['url', 'title', 'price', 'color'].forEach(k => { $('#new-wish-' + k).value = ''; });
  $('#new-wish-prio').value = '0';
  lastScannedImageUrl = '';
  setTimeout(() => {
    const box = $('#wish-preview-box');
    if (box && !$('#new-wish-title').value) { box.hidden = true; $('#manual-wish-btn').hidden = false; $('#wish-preview-img').hidden = true; }
  }, 900);
}

function renderWishlist() {
  const list = $('#wishlist-list');
  if (!list) return;
  const items = sortedWishes();
  const clearBtn = $('#clear-purchased-btn');
  if (clearBtn) clearBtn.hidden = !items.some(i => i.is_purchased);

  if (!items.length) {
    list.innerHTML = emptyStateHtml('shopping-bag', 'Keine Wünsche', 'Zeit für Inspiration.');
    refreshIcons();
    return;
  }

  let total = 0;
  const prioTotals = { 0: 0, 1: 0, 2: 0, 3: 0 };
  const rows = items.map(item => {
    const id = escapeHtml(item.id);
    const qty = item.quantity || 1;
    const prio = item.prio || 0;
    if (!item.is_purchased) {
      const val = parsePrice(item.price);
      if (!isNaN(val)) { total += val * qty; prioTotals[prio] += val * qty; }
    }
    const info = [item.price, item.color ? `Farbe: ${item.color}` : '', `von ${formatUserName(item.author)}`].filter(Boolean).map(escapeHtml).join(' · ');
    const img = safeUrl(item.image);
    const link = safeUrl(item.url);
    return `
      <div class="list-item wish-item ${item.is_purchased ? 'done' : ''} ${isNewItem('wishlist', item.id) ? 'is-new' : ''} ${lastToggled === String(item.id) ? 'pop' : ''}">
        ${checkHtml(item.is_purchased, `toggleWish('${id}')`, 'Als gekauft markieren')}
        ${img ? `<img class="wish-thumb" src="${escapeHtml(img)}" alt="" loading="lazy" />` : ''}
        <div class="item-content clickable" onclick="openEditModal('wishlist','${id}')">
          <div class="item-title truncate">${escapeHtml(item.title)}</div>
          <div class="item-sub truncate">${info}</div>
        </div>
        <div class="item-actions">
          <select class="prio-select prio-${prio}" onchange="updateWishPrio('${id}', this.value)" aria-label="Priorität">
            ${[0, 1, 2, 3].map(p => `<option value="${p}" ${p === prio ? 'selected' : ''}>${p ? 'Prio ' + p : 'Prio'}</option>`).join('')}
          </select>
          ${link ? `<button class="icon-btn" data-url="${escapeHtml(link)}" onclick="window.open(this.dataset.url, '_blank', 'noopener')" aria-label="Link öffnen">${icon('external-link', 'sm')}</button>` : ''}
          ${stepperHtml(qty, 'updateWishQuantity', id)}
          ${deleteBtnHtml(`deleteWish('${id}')`)}
        </div>
      </div>`;
  }).join('');

  const totalRow = (label, val) => `<div class="totals-row"><span>${label}</span><span>${formatChf(val)}</span></div>`;
  let totals = '';
  [1, 2, 3].forEach(p => { if (prioTotals[p] > 0) totals += totalRow(`Total Prio ${p}`, prioTotals[p]); });
  if (prioTotals[0] > 0) totals += totalRow('Total ohne Prio', prioTotals[0]);
  totals += `<div class="totals-grand"><span>Gesamttotal</span><strong>${formatChf(total)}</strong></div>`;

  list.innerHTML = rows + `<div class="totals">${totals}</div>`;
  primeList('wishlist');
  refreshIcons();
}

function toggleWish(id) {
  const item = wishlistStore.find(id);
  if (!item) return;
  markToggled(id);
  haptic();
  wishlistStore.patch(id, { is_purchased: !item.is_purchased });
}

function updateWishPrio(id, newPrio) {
  const item = wishlistStore.find(id);
  newPrio = parseInt(newPrio, 10) || 0;
  if (!item || (item.prio || 0) === newPrio) return;
  wishlistStore.patch(id, { prio: newPrio });
}

function updateWishQuantity(id, delta) {
  const item = wishlistStore.find(id);
  if (!item) return;
  const cur = item.quantity || 1;
  const next = Math.max(1, cur + delta);
  if (next !== cur) wishlistStore.patch(id, { quantity: next });
}

function deleteWish(id) {
  const item = wishlistStore.find(id);
  wishlistStore.remove(id, item ? `«${item.title}»` : 'Wunsch');
}

function clearPurchasedWishes() {
  const ids = wishlistStore.items.filter(i => i.is_purchased).map(i => i.id);
  if (ids.length) wishlistStore.remove(ids, ids.length > 1 ? 'Wünsche' : 'Wunsch');
}
