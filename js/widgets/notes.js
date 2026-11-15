/* ── Notizen ───────────────────────────────────────────────── */
const notesStore = createStore({ table: 'notes', order: { col: 'created_at', asc: false } });

// Als "neu" zählen nur Notizen der anderen Person, die nach dem letzten Öffnen kamen
function unreadNotes() {
  const lastViewed = localStorage.getItem('last_viewed_notes');
  const me = userKey();
  return notesStore.items.filter(n => n.author !== me && (!lastViewed || new Date(n.created_at) > new Date(lastViewed)));
}

registerWidget({
  id: 'notes', pos: 6, title: 'Notizen', icon: 'sticky-note', color: 'var(--c-notes)', open: openNotes,
  store: notesStore,
  hasBadge: () => unreadNotes().length > 0,
  renderContent: () => {
    if (!notesStore.items.length) return miniPlaceholder('message-square', 'Keine Notizen');
    return `<div class="mini-note">${escapeHtml(notesStore.items[0].text)}</div>`;
  },
  getPreview: () => {
    if (!notesStore.items.length) return 'Leer';
    const unread = unreadNotes().length;
    if (unread) return unread > 1 ? `${unread} neue Notizen` : 'Neue Notiz!';
    return `Von ${formatUserName(notesStore.items[0].author)}`;
  }
});

notesStore.onChange(() => {
  if (currentOverlay === 'notes') {
    localStorage.setItem('last_viewed_notes', new Date().toISOString());
    renderNotesList();
  }
  updateWidget('notes');
});

function openNotes() {
  localStorage.setItem('last_viewed_notes', new Date().toISOString());
  updateWidget('notes');
  resetListMemory('notes');
  openOverlay({
    key: 'notes', title: 'Notizen', color: 'var(--c-notes)',
    render: () => `
      <div class="input-row">
        <textarea id="new-note-input" placeholder="Neue Notiz schreiben…" rows="2"></textarea>
        <button id="add-note-btn" class="btn-add btn-add-tall" aria-label="Senden">${icon('send', 'md')}</button>
      </div>
      <div id="notes-list" class="list"></div>`,
    init: () => {
      $('#add-note-btn').addEventListener('click', addNoteItem);
      // Cmd/Ctrl + Enter sendet (normales Enter = neue Zeile)
      $('#new-note-input').addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) addNoteItem(); });
      renderNotesList();
    }
  });
}

function renderNotesList() {
  const list = $('#notes-list');
  if (!list) return;
  if (!notesStore.items.length) {
    list.innerHTML = emptyStateHtml('message-square', 'Noch keine Notizen', 'Hinterlasse dem anderen eine kurze Nachricht.');
    refreshIcons();
    return;
  }
  const me = userKey();
  list.innerHTML = notesStore.items.map(item => {
    const id = escapeHtml(item.id);
    const date = new Date(item.created_at).toLocaleString('de-CH', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `
      <div class="note-card ${isNewItem('notes', item.id) ? 'is-new' : ''}">
        <div class="note-header">
          <strong class="${item.author === me ? 'is-me' : ''}">${escapeHtml(formatUserName(item.author))}</strong>
          <div class="note-meta">
            <span>${date}</span>
            ${deleteBtnHtml(`deleteNoteItem('${id}')`)}
          </div>
        </div>
        <div class="note-body clickable" onclick="openEditModal('notes','${id}')">${escapeHtml(item.text)}</div>
      </div>`;
  }).join('');
  primeList('notes');
  refreshIcons();
}

async function addNoteItem() {
  const input = $('#new-note-input');
  const text = input.value.trim();
  if (!text) { input.focus(); return; }
  const ok = await saveWithFeedback($('#add-note-btn'), () => notesStore.insert({ text, author: userKey() }), 'Gesendet', 'Notiz gesendet');
  if (!ok) return;
  input.value = '';
}

function deleteNoteItem(id) {
  notesStore.remove(id, 'Notiz');
}
