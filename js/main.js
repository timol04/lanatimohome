/* ============================================================
   LanaTimoHome – main.js
   Start der App und Login
   ============================================================ */

document.addEventListener('DOMContentLoaded', async () => {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

  const { data: { session } } = await db.auth.getSession();
  currentUser = session?.user ?? null;
  if (currentUser) {
    showDashboard();
    loadScreensaverImages();
  } else {
    showLoginScreen();
  }

  // Nur auf echtes Ein-/Ausloggen reagieren. Token-Refreshes (ca. stündlich) würden
  // sonst das ganze Dashboard neu aufbauen und offene Ansichten schliessen.
  db.auth.onAuthStateChange((event, session) => {
    const wasLoggedIn = !!currentUser;
    currentUser = session?.user ?? null;
    if (currentUser && !wasLoggedIn) {
      showDashboard();
      loadScreensaverImages();
    } else if (!currentUser && wasLoggedIn) {
      showLoginScreen();
    }
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW:', err));
  }
});

function showLoginScreen() {
  stopDashboard();
  resetActivityTimers();
  document.getElementById('app').innerHTML = `
    <div class="login-screen">
      <div class="login-card">
        <div class="login-logo">${icon('house', 'md')}</div>
        <h1 class="login-title">LanaTimoHome</h1>
        <p class="login-subtitle">Unser gemeinsames Dashboard</p>
        <form id="login-form" class="login-form" novalidate>
          <div class="form-group">
            <label for="login-email">E-Mail</label>
            <input type="email" id="login-email" placeholder="deine@email.ch" autocomplete="username" required />
          </div>
          <div class="form-group">
            <label for="login-password">Passwort</label>
            <div class="pw-wrap">
              <input type="password" id="login-password" placeholder="••••••••" autocomplete="current-password" required />
              <button type="button" id="pw-toggle" class="pw-eye" aria-label="Passwort anzeigen">${icon('eye', 'sm')}</button>
            </div>
          </div>
          <div id="login-error" class="login-error" hidden></div>
          <button type="submit" id="login-btn" class="btn btn-primary btn-block btn-login">Anmelden</button>
        </form>
      </div>
    </div>
    <div id="toast" class="toast" role="status" aria-live="polite"></div>`;
  refreshIcons();

  const pwInput = $('#login-password');
  const pwToggle = $('#pw-toggle');
  pwToggle.addEventListener('click', () => {
    const show = pwInput.type === 'password';
    pwInput.type = show ? 'text' : 'password';
    pwToggle.innerHTML = icon(show ? 'eye-off' : 'eye', 'sm');
    refreshIcons();
  });

  $('#login-form').addEventListener('submit', async e => {
    e.preventDefault();
    const email = $('#login-email').value.trim();
    const password = pwInput.value;
    const btn = $('#login-btn');
    const errorEl = $('#login-error');
    errorEl.hidden = true;
    if (!email || !password) {
      errorEl.textContent = 'Bitte E-Mail und Passwort eingeben';
      errorEl.hidden = false;
      return;
    }
    btn.disabled = true;
    btn.innerHTML = `${icon('loader', 'sm', 'spin')}<span>Anmelden…</span>`;
    refreshIcons();
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      errorEl.textContent = error.message === 'Invalid login credentials' ? 'E-Mail oder Passwort stimmt nicht' : `Fehler: ${error.message}`;
      errorEl.hidden = false;
      $('.login-card').classList.remove('shake');
      void $('.login-card').offsetWidth;
      $('.login-card').classList.add('shake');
      haptic([20, 40, 20]);
      btn.disabled = false;
      btn.textContent = 'Anmelden';
    }
  });
}
