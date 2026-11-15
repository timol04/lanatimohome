/* ── Pakete ────────────────────────────────────────────────── */
const packagesStore = createStore({ table: 'packages', order: { col: 'created_at', asc: false } });

registerWidget({
  id: 'packages', pos: 12, title: 'Pakete', icon: 'package', color: 'var(--c-packages)', open: openPackages,
  store: packagesStore,
  renderContent: () => {
    const pending = packagesStore.items.filter(i => !i.is_delivered);
    if (!pending.length) return miniPlaceholder('package-check', 'Nichts unterwegs');
    return pending.slice(0, 3).map(i => miniItem('truck', i.title)).join('');
  },
  getPreview: () => {
    const c = packagesStore.items.filter(i => !i.is_delivered).length;
    return c === 0 ? 'Alles da' : `${c} unterwegs`;
  }
});

packagesStore.onChange(() => {
  updateWidget('packages');
  if (currentOverlay === 'packages') renderPackagesList();
});

function courierOptions() {
  return Object.fromEntries(Object.entries(COURIERS).map(([k, c]) => [k, c.label]));
}

function openPackages() {
  resetListMemory('packages');
  openOverlay({
    key: 'packages', title: 'Pakete', color: 'var(--c-packages)',
    render: () => `
      <div class="input-row input-row-tight">
        <input type="text" id="new-pkg-title" placeholder="Was hast du bestellt? (z.B. Digitec)" autocomplete="off" />
        <button id="add-pkg-btn" class="btn-add" aria-label="Hinzufügen">${icon('plus', 'md')}</button>
      </div>
      <div class="input-row">
        <select id="new-pkg-courier">${Object.entries(courierOptions()).map(([k, l]) => `<option value="${k}">${escapeHtml(l)}</option>`).join('')}</select>
        <input type="text" id="new-pkg-tracking" placeholder="Tracking-Nummer (optional)" class="grow-2" autocomplete="off" />
      </div>
      <div class="list-toolbar">
        <span class="section-title">Unterwegs</span>
        ${clearDoneBtnHtml('clear-delivered-btn', 'Erhaltene löschen', 0)}
      </div>
      <div id="packages-list" class="list"></div>`,
    init: () => {
      $('#add-pkg-btn').addEventListener('click', addPackage);
      $('#new-pkg-title').addEventListener('keydown', e => { if (e.key === 'Enter') addPackage(); });
      $('#new-pkg-tracking').addEventListener('keydown', e => { if (e.key === 'Enter') addPackage(); });
      $('#clear-delivered-btn').addEventListener('click', clearDeliveredPackages);
      renderPackagesList();
    }
  });
}

function renderPackagesList() {
  const list = $('#packages-list');
  if (!list) return;
  const items = packagesStore.items;
  const clearBtn = $('#clear-delivered-btn');
  if (clearBtn) clearBtn.hidden = !items.some(i => i.is_delivered);

  if (!items.length) {
    list.innerHTML = emptyStateHtml('package-open', 'Keine Pakete', 'Gerade ist nichts unterwegs.');
    refreshIcons();
    return;
  }
  const sorted = [...items.filter(i => !i.is_delivered), ...items.filter(i => i.is_delivered)];
  list.innerHTML = sorted.map(item => {
    const id = escapeHtml(item.id);
    const courier = COURIERS[item.courier] || COURIERS.andere;
    const tn = item.tracking_number ? encodeURIComponent(item.tracking_number) : '';
    const trackUrl = tn && courier.url ? courier.url(tn) : '';
    let trackBtn = '';
    if (trackUrl) trackBtn = `<button class="pill-btn" data-url="${escapeHtml(trackUrl)}" onclick="event.stopPropagation(); window.open(this.dataset.url, '_blank', 'noopener')">${icon('external-link', 'xs')}<span>Verfolgen</span></button>`;
    else if (item.tracking_number) trackBtn = `<button class="pill-btn" onclick="event.stopPropagation(); copyTracking('${id}')">${icon('copy', 'xs')}<span>Kopieren</span></button>`;
    const meta = [courier.label, item.tracking_number, formatUserName(item.author)].filter(Boolean).map(escapeHtml).join(' · ');
    return `
      <div class="list-item ${item.is_delivered ? 'done' : ''} ${isNewItem('packages', item.id) ? 'is-new' : ''} ${lastToggled === String(item.id) ? 'pop' : ''}">
        ${checkHtml(item.is_delivered, `togglePackage('${id}')`, 'Als erhalten markieren')}
        <div class="item-content clickable" onclick="openEditModal('packages','${id}')">
          <div class="item-title">${escapeHtml(item.title)}</div>
          <div class="item-sub">${meta}</div>
        </div>
        <div class="item-actions">${trackBtn}${deleteBtnHtml(`deletePackage('${id}')`)}</div>
      </div>`;
  }).join('');
  primeList('packages');
  refreshIcons();
}

async function addPackage() {
  const titleInput = $('#new-pkg-title');
  const trackInput = $('#new-pkg-tracking');
  const title = titleInput.value.trim();
  if (!title) { titleInput.focus(); return; }
  const row = { title, courier: $('#new-pkg-courier').value, tracking_number: trackInput.value.trim(), author: userKey(), is_delivered: false };
  const ok = await saveWithFeedback($('#add-pkg-btn'), () => packagesStore.insert(row), 'Hinzugefügt', 'Paket hinzugefügt');
  if (!ok) return;
  titleInput.value = '';
  trackInput.value = '';
}

function togglePackage(id) {
  const item = packagesStore.find(id);
  if (!item) return;
  markToggled(id);
  haptic();
  packagesStore.patch(id, { is_delivered: !item.is_delivered });
  if (!item.is_delivered) showToast(`«${item.title}» ist angekommen`, 'success');
}

async function copyTracking(id) {
  const item = packagesStore.find(id);
  if (!item?.tracking_number) return;
  try {
    await navigator.clipboard.writeText(item.tracking_number);
    showToast('Tracking-Nummer kopiert', 'success');
  } catch (e) {
    showToast('Kopieren nicht möglich', 'error');
  }
}

function deletePackage(id) {
  packagesStore.remove(id, 'Paket');
}

function clearDeliveredPackages() {
  const ids = packagesStore.items.filter(i => i.is_delivered).map(i => i.id);
  if (ids.length) packagesStore.remove(ids, ids.length > 1 ? 'Pakete' : 'Paket');
}
