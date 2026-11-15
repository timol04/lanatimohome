/* ── To-Do ─────────────────────────────────────────────────── */
const todoStore = createStore({ table: 'todos' });

registerWidget({
  id: 'todo', pos: 2, title: 'To-Do', icon: 'square-check', color: 'var(--c-todo)', open: openTodos,
  store: todoStore,
  renderContent: () => {
    const pending = sortedTodos().filter(i => !i.is_done);
    if (!pending.length) return miniPlaceholder('circle-check', 'Keine Aufgaben');
    return pending.slice(0, 3).map(i => {
      const t = parseTask(i.text);
      const overdue = t.due && daysUntil(t.due) < 0;
      return miniItem(overdue ? 'circle-alert' : 'circle', t.title, overdue ? 'is-overdue' : '');
    }).join('');
  },
  getPreview: () => {
    const pending = todoStore.items.filter(i => !i.is_done);
    if (!pending.length) return 'Alles erledigt';
    const overdue = pending.filter(i => { const d = parseTask(i.text).due; return d && daysUntil(d) < 0; }).length;
    return `${pending.length} Aufgabe${pending.length > 1 ? 'n' : ''}${overdue ? ` · ${overdue} überfällig` : ''}`;
  }
});

todoStore.onChange(() => {
  updateWidget('todo');
  if (currentOverlay === 'todo') renderTodoList();
});

// Offene nach Fälligkeit (ohne Datum zuletzt), dann erledigte
function sortedTodos() {
  const withDue = todoStore.items.map(item => ({ item, due: parseTask(item.text).due }));
  const byDue = (a, b) => {
    if (a.due && b.due) return a.due - b.due;
    if (a.due) return -1;
    if (b.due) return 1;
    return String(a.item.created_at).localeCompare(String(b.item.created_at));
  };
  const open = withDue.filter(x => !x.item.is_done).sort(byDue);
  const done = withDue.filter(x => x.item.is_done);
  return [...open, ...done].map(x => x.item);
}

function openTodos() {
  resetListMemory('todo');
  openOverlay({
    key: 'todo', title: 'To-Do', color: 'var(--c-todo)',
    render: () => `
      <div class="input-row">
        <input type="text" id="new-todo-input" placeholder="Neue Aufgabe…" autocomplete="off" enterkeyhint="done" />
        <input type="date" id="new-todo-date" class="date-input" aria-label="Fällig am (optional)" />
        <button id="add-todo-btn" class="btn-add" aria-label="Hinzufügen">${icon('plus', 'md')}</button>
      </div>
      <div class="list-toolbar">
        <span class="section-title">Aufgaben</span>
        ${clearDoneBtnHtml('clear-done-todo-btn', 'Erledigte löschen', 0)}
      </div>
      <div id="todo-list" class="list"></div>`,
    init: () => {
      $('#add-todo-btn').addEventListener('click', addTodoItem);
      $('#new-todo-input').addEventListener('keydown', e => { if (e.key === 'Enter') addTodoItem(); });
      $('#clear-done-todo-btn').addEventListener('click', clearDoneTodos);
      renderTodoList();
    }
  });
}

function renderTodoList() {
  const list = $('#todo-list');
  if (!list) return;
  const items = sortedTodos();
  const clearBtn = $('#clear-done-todo-btn');
  if (clearBtn) clearBtn.hidden = !items.some(i => i.is_done);

  if (!items.length) {
    list.innerHTML = emptyStateHtml('circle-check', 'Alles erledigt!', 'Geniesse den Tag, es gibt keine offenen Aufgaben.');
    refreshIcons();
    return;
  }
  list.innerHTML = items.map(item => {
    const id = escapeHtml(item.id);
    const t = parseTask(item.text);
    return `
      <div class="list-item ${item.is_done ? 'done' : ''} ${isNewItem('todo', item.id) ? 'is-new' : ''} ${lastToggled === String(item.id) ? 'pop' : ''}">
        ${checkHtml(item.is_done, `toggleTodoItem('${id}')`)}
        <div class="item-content clickable" onclick="openEditModal('todo','${id}')">
          <div class="item-title">${escapeHtml(t.title)}</div>
          ${taskChipsHtml(t, { isDone: item.is_done })}
        </div>
        <div class="item-actions">${deleteBtnHtml(`deleteTodoItem('${id}')`)}</div>
      </div>`;
  }).join('');
  primeList('todo');
  refreshIcons();
}

async function addTodoItem() {
  const input = $('#new-todo-input');
  const dateInput = $('#new-todo-date');
  const title = input.value.trim();
  if (!title) { input.focus(); return; }
  const text = composeTask({ title, due: dateInput.value || null });
  const ok = await saveWithFeedback($('#add-todo-btn'), () => todoStore.insert({ text, is_done: false }), 'Hinzugefügt', 'Aufgabe hinzugefügt');
  if (!ok) return;
  input.value = '';
  dateInput.value = '';
  input.focus();
}

function toggleTodoItem(id) {
  const item = todoStore.find(id);
  if (!item) return;
  markToggled(id);
  haptic();
  todoStore.patch(id, { is_done: !item.is_done });
}

function deleteTodoItem(id) {
  todoStore.remove(id, 'Aufgabe');
}

function clearDoneTodos() {
  const ids = todoStore.items.filter(i => i.is_done).map(i => i.id);
  if (ids.length) todoStore.remove(ids, ids.length > 1 ? 'Aufgaben' : 'Aufgabe');
}
