/* ============================================================
   LanaTimoHome – app.js
   Homescreen-Dashboard mit iOS-Style Widgets
   ============================================================ */

const SUPABASE_URL  = 'https://byzlrafovhigellwnyay.supabase.co';
const SUPABASE_ANON = 'sb_publishable_JOqg8swYCaQPhPmPjLpyJA_yZ9DquTx';

const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_ANON);

// ── State ─────────────────────────────────────────────────────
let currentUser = null;
let realtimeChan = null;
let shoppingItems = [];
let todosItems = [];
let notesItems = [];
let foodItems = [];
let choresItems = [];
let countdownsItems = [];
let packagesItems = [];
let wishlistItems = [];
let currentCarouselPage = 0;
let clockInterval = null;
let foodChan = null;
let choresChan = null;
let countdownsChan = null;
let packagesChan = null;
let currentWeatherData = { temp: '--', icon: 'cloud-sun', desc: 'Laden...', high: '--', low: '--', daily: [] };

// ── Widget-Konfiguration ──────────────────────────────────────
const WIDGETS = [
  { 
    id: 'shopping', title: 'Einkaufsliste', icon: 'shopping-cart', color: 'var(--c-shopping)', action: openShopping,
    renderContent: () => {
      const pending = shoppingItems.filter(i => !i.is_done);
      if(pending.length === 0) return `<div class="mini-placeholder"><i data-lucide="shopping-bag"></i>Alles gekauft</div>`;
      return pending.slice(0, 3).map(i => `<div class="mini-list-item"><i data-lucide="circle"></i><span class="mini-text">${escapeHtml(i.text)}</span></div>`).join('');
    },
    getPreview: () => {
      const pending = shoppingItems.filter(i => !i.is_done);
      const total = pending.reduce((sum, item) => sum + parseInt(item.quantity || 1), 0);
      return total === 0 ? 'Alles erledigt' : `${total} Artikel`;
    }
  },
  { 
    id: 'todo', title: 'To-Do', icon: 'check-square', color: 'var(--c-todo)', action: openTodos,
    renderContent: () => {
      const pending = todosItems.filter(i => !i.is_done);
      if(pending.length === 0) return `<div class="mini-placeholder"><i data-lucide="check-circle-2"></i>Keine Aufgaben</div>`;
      return pending.slice(0, 3).map(i => `<div class="mini-list-item"><i data-lucide="square"></i><span class="mini-text">${escapeHtml(i.text)}</span></div>`).join('');
    },
    getPreview: () => {
      const c = todosItems.filter(i => !i.is_done).length;
      return c === 0 ? 'Alles erledigt' : `${c} Aufgaben`;
    }
  },

  { 
    id: 'calendar', title: 'Kalender', icon: 'calendar', color: 'var(--c-calendar)', action: () => openPlaceholderOverlay('Kalender', 'var(--c-calendar)', 'calendar'),
    renderContent: () => `<div class="mini-placeholder"><i data-lucide="calendar-clock"></i>Noch nicht bereit</div>`,
    getPreview: () => 'In Entwicklung'
  },
  { 
    id: 'weather', title: 'Wetter Region Basel', icon: 'cloud-sun', color: 'var(--c-weather)', action: openWeather,
    renderContent: () => `
      <div class="mini-weather-hero" style="flex-direction:column; align-items:flex-start; gap:4px;">
        <div style="display:flex; align-items:center; gap:8px; font-size:2.4rem; font-weight:300; color:var(--text);">
          <i data-lucide="${currentWeatherData.icon}" style="width:36px;height:36px;color:var(--c-weather);"></i> ${currentWeatherData.temp}°
        </div>
        <div style="font-size:0.85rem; color:var(--text-muted); font-weight:500;">
          H: ${currentWeatherData.high}° &nbsp;&middot;&nbsp; T: ${currentWeatherData.low}°
        </div>
      </div>
    `,
    getPreview: () => currentWeatherData.desc
  },
  { 
    id: 'countdown', title: 'Countdowns', icon: 'timer', color: 'var(--c-countdown)', action: openCountdowns,
    renderContent: () => {
      if(countdownsItems.length === 0) return `<div class="mini-placeholder"><i data-lucide="calendar-heart"></i>Keine Events</div>`;
      const next = [...countdownsItems].sort((a,b) => new Date(a.date) - new Date(b.date))[0];
      const today = new Date(); today.setHours(0,0,0,0);
      const target = new Date(next.date); target.setHours(0,0,0,0);
      const days = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
      return `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%;">
          <div style="font-size:2rem; font-weight:700; color:var(--c-countdown); line-height:1; margin-bottom:4px;">${days}</div>
          <div style="font-size:0.8rem; color:var(--text-muted); text-align:center;">Tage bis<br/>${escapeHtml(next.title)}</div>
        </div>
      `;
    },
    getPreview: () => {
      return countdownsItems.length > 0 ? `${countdownsItems.length} Events` : 'Leer';
    }
  },
  { 
    id: 'notes', title: 'Notizen', icon: 'sticky-note', color: 'var(--c-notes)', action: openNotes,
    hasBadge: () => {
      if (notesItems.length === 0) return false;
      const lastViewed = localStorage.getItem('last_viewed_notes');
      if (!lastViewed) return true;
      return new Date(notesItems[0].created_at) > new Date(lastViewed);
    },
    renderContent: () => {
      if(notesItems.length === 0) return `<div class="mini-placeholder"><i data-lucide="message-square"></i>Keine Notizen</div>`;
      return `<div style="white-space:normal;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;color:var(--text);font-size:0.85rem;">${escapeHtml(notesItems[0].text)}</div>`;
    },
    getPreview: () => {
      if (notesItems.length === 0) return 'Leer';
      const w = WIDGETS.find(x => x.id === 'notes');
      const isNew = w.hasBadge && w.hasBadge();
      return isNew ? 'Neue Notiz!' : `Von ${escapeHtml(formatUserName(notesItems[0].author))}`;
    }
  },
  { 
    id: 'food', title: 'Essensplan', icon: 'utensils', color: 'var(--c-food)', action: openFoodPlan,
    renderContent: () => {
      const todayIndex = new Date().getDay() || 7;
      const days = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'];
      const todayName = days[todayIndex-1];
      const tomorrowName = days[todayIndex % 7];
      const todayMeal = foodItems.find(f => f.day === todayName)?.meal;
      const tomorrowMeal = foodItems.find(f => f.day === tomorrowName)?.meal;
      
      let html = '';
      if(todayMeal) html += `<div class="mini-list-item"><i data-lucide="utensils"></i><span class="mini-text">Heute: ${escapeHtml(todayMeal)}</span></div>`;
      if(tomorrowMeal) html += `<div class="mini-list-item"><i data-lucide="utensils" style="opacity:0.5;"></i><span class="mini-text" style="opacity:0.8;">Morgen: ${escapeHtml(tomorrowMeal)}</span></div>`;
      
      if(!html) return `<div class="mini-placeholder"><i data-lucide="chef-hat"></i>Nichts geplant</div>`;
      return html;
    },
    getPreview: () => {
      const todayIndex = new Date().getDay() || 7;
      const todayName = ['Montag','Dienstag','Mittwoch','Donnerstag','Freitag','Samstag','Sonntag'][todayIndex-1];
      const meal = foodItems.find(f => f.day === todayName)?.meal;
      return meal ? meal : 'Nichts geplant';
    }
  },
  { 
    id: 'smarthome', title: 'Smart Home', icon: 'home', color: 'var(--c-home)', action: () => openPlaceholderOverlay('Smart Home', 'var(--c-home)', 'home'),
    renderContent: () => `<div class="mini-placeholder"><i data-lucide="plug"></i>Offline</div>`,
    getPreview: () => 'In Entwicklung'
  },
  { 
    id: 'chores', title: 'Ämtli-Plan', icon: 'sparkles', color: 'var(--c-chores)', action: openChores,
    renderContent: () => {
      const pending = choresItems.filter(i => !i.is_done);
      if(pending.length === 0) return `<div class="mini-placeholder"><i data-lucide="award"></i>Alles sauber!</div>`;
      return pending.slice(0, 3).map(i => `<div class="mini-list-item"><i data-lucide="circle"></i><span class="mini-text">${escapeHtml(i.text)}</span></div>`).join('');
    },
    getPreview: () => {
      const c = choresItems.filter(i => !i.is_done).length;
      return c === 0 ? 'Alles sauber' : `${c} offene Ämtli`;
    }
  },
  { 
    id: 'trash', title: 'Abfall', icon: 'trash-2', color: 'var(--c-trash)', action: () => openPlaceholderOverlay('Abfallkalender', 'var(--c-trash)', 'trash-2'),
    renderContent: () => `<div class="mini-placeholder"><i data-lucide="calendar-days"></i>Kein Kalender</div>`,
    getPreview: () => 'In Entwicklung'
  },
  { 
    id: 'wifi', title: 'WLAN', icon: 'wifi', color: '#5e5ce6', action: openWifi,
    renderContent: () => `<div class="mini-placeholder"><i data-lucide="qr-code"></i>Gast-Zugang</div>`,
    getPreview: () => 'Zum Scannen tippen'
  },
  { 
    id: 'packages', title: 'Pakete', icon: 'package', color: '#ffcc00', action: openPackages,
    renderContent: () => {
      const pending = packagesItems.filter(i => !i.is_delivered);
      if(pending.length === 0) return `<div class="mini-placeholder"><i data-lucide="package-check"></i>Nichts unterwegs</div>`;
      return pending.slice(0, 3).map(i => `<div class="mini-list-item"><i data-lucide="truck"></i><span class="mini-text">${escapeHtml(i.title)}</span></div>`).join('');
    },
    getPreview: () => {
      const c = packagesItems.filter(i => !i.is_delivered).length;
      return c === 0 ? 'Alles da' : `${c} unterwegs`;
    }
  },
  {
    id: 'wishlist', title: 'Anschaffungen', icon: 'shopping-bag', color: '#ff2d55', action: () => openWishlist(),
    renderContent: () => {
      if(wishlistItems.length === 0) return `<div class="mini-placeholder"><i data-lucide="shopping-bag"></i>Keine Wünsche</div>`;
      const item = wishlistItems[0];
      return `
        <div style="font-size:0.9rem; color:var(--text); font-weight:500; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden;">${escapeHtml(item.title)}</div>
        ${item.price ? `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px; font-weight:600;">${escapeHtml(item.price)}</div>` : ''}
      `;
    },
    getPreview: () => {
      const total = wishlistItems.reduce((sum, item) => sum + parseInt(item.quantity || 1), 0);
      return `${total} Wünsche`;
    }
  }
];

function openWifi() {
  openOverlay('WLAN Gastzugang', '#5e5ce6', () => `
    <div style="text-align:center; padding:var(--space-xl) 0; height:100%; display:flex; flex-direction:column; align-items:center; justify-content:center;">
      <h3 style="color:var(--text); margin-bottom:8px; font-size:1.5rem;">Noch kein WLAN eingerichtet</h3>
      <p style="color:var(--text-muted); margin-bottom:32px; max-width:300px; line-height:1.5;">Sobald ihr euer Internet habt, können wir hier das Netzwerk eintragen. Besucher müssen dann nur noch den Code scannen!</p>
      <div style="background:#fff; padding:24px; border-radius:16px; display:inline-block; opacity:0.2; box-shadow:0 10px 30px rgba(0,0,0,0.5);">
        <i data-lucide="qr-code" style="width:180px;height:180px;color:#000;stroke-width:1.5;"></i>
      </div>
    </div>
  `);
  setTimeout(() => lucide.createIcons(), 10);
}

// ── Bootstrap ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const savedTheme = localStorage.getItem('theme');
  if (savedTheme) document.documentElement.setAttribute('data-theme', savedTheme);

  const { data: { session } } = await db.auth.getSession();
  currentUser = session?.user ?? null;

  if (currentUser) {
    showDashboard();
    loadScreensaverImages(); // Bilder aus Bucket laden
  } else {
    showLoginScreen();
  }

  db.auth.onAuthStateChange((_event, session) => {
    currentUser = session?.user ?? null;
    if (currentUser) {
      showDashboard();
    } else {
      showLoginScreen();
    }
  });

  registerServiceWorker();
});

// ════════════════════════════════════════════════════════════════
// LOGIN SCREEN
// ════════════════════════════════════════════════════════════════
function showLoginScreen() {
  if (realtimeChan) { realtimeChan.unsubscribe(); realtimeChan = null; }
  if (clockInterval) clearInterval(clockInterval);

  document.getElementById('app').innerHTML = `
    <div class="login-screen">
      <div class="login-card">
        <div class="login-logo"><i data-lucide="home"></i></div>
        <h1 class="login-title">LanaTimoHome</h1>
        <p class="login-subtitle">Unser gemeinsames Dashboard</p>

        <form id="login-form" class="login-form" novalidate>
          <div class="form-group">
            <label for="login-email">E-Mail</label>
            <input type="email" id="login-email" placeholder="deine@email.ch" required />
          </div>
          <div class="form-group">
            <label for="login-password">Passwort</label>
            <div class="pw-wrap">
              <input type="password" id="login-password" placeholder="••••••••" required />
              <button type="button" id="pw-toggle" class="pw-eye"><i data-lucide="eye"></i></button>
            </div>
          </div>
          <div id="login-error" class="login-error" style="display:none"></div>
          <button type="submit" id="login-btn" class="btn btn-primary">Anmelden</button>
        </form>
      </div>
    </div>
  `;

  lucide.createIcons();

  const form = document.getElementById('login-form');
  const pwInput = document.getElementById('login-password');
  const pwToggle = document.getElementById('pw-toggle');

  pwToggle.addEventListener('click', () => {
    const isHidden = pwInput.type === 'password';
    pwInput.type = isHidden ? 'text' : 'password';
    pwToggle.innerHTML = isHidden ? '<i data-lucide="eye-off"></i>' : '<i data-lucide="eye"></i>';
    lucide.createIcons();
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    const btn = document.getElementById('login-btn');
    const errorEl = document.getElementById('login-error');

    errorEl.style.display = 'none';
    btn.disabled = true;
    btn.textContent = 'Anmelden…';

    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      errorEl.innerHTML = error.message === 'Invalid login credentials' ? 'Fehler: Falsche Daten' : `Fehler: ${error.message}`;
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Anmelden';
    }
  });
}

// ════════════════════════════════════════════════════════════════
// DASHBOARD (HOMESCREEN)
// ════════════════════════════════════════════════════════════════
function showDashboard() {
  document.getElementById('app').innerHTML = `
    <div id="homescreen-header">
      <div class="header-left">
        <div class="header-time" id="clock-time">--:--</div>
        <div class="header-date" id="clock-date">Laden...</div>
        <div style="display:flex; align-items:center; gap:12px; margin-top:6px;">
          <div class="header-weather" id="header-weather" style="margin-top:0;">
            <i data-lucide="cloud-sun"></i> --°C
          </div>
          <button onclick="window.location.reload(true)" title="Neu laden (Sync)" style="background:var(--bg-card); border:1px solid var(--border); color:var(--text-muted); border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; cursor:pointer;">
            <i data-lucide="refresh-cw" style="width:14px;height:14px;"></i>
          </button>
          <button onclick="toggleTheme()" title="Theme wechseln" style="background:var(--bg-card); border:1px solid var(--border); color:var(--text-muted); border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; cursor:pointer;">
            <i data-lucide="sun" id="theme-icon" style="width:14px;height:14px;"></i>
          </button>
          <button onclick="event.stopPropagation(); startScreensaver()" title="Screensaver starten" style="background:var(--bg-card); border:1px solid var(--border); color:var(--text-muted); border-radius:50%; width:28px; height:28px; display:flex; align-items:center; justify-content:center; cursor:pointer;">
            <i data-lucide="image" style="width:14px;height:14px;"></i>
          </button>
        </div>
      </div>
      <div class="header-center" id="header-center">
        <div class="ambient-bg" id="ambient-bg"></div>
        <div class="greeting-text">
          <h2 id="greeting-title">Guten Tag</h2>
          <p id="greeting-subtitle">Willkommen zuhause</p>
        </div>
      </div>
      <div class="header-right" id="tram-board" style="display:flex; flex-direction:column; gap:8px; margin-top:0;">
        <div class="sbb-title" style="font-size:1.1rem; color:var(--text); font-weight:600; display:flex; align-items:center; gap:6px; justify-content:flex-end;">
          <i data-lucide="train-front" style="width:20px;height:20px;color:var(--c-todo);"></i> Abfahrten Allschwil Dorf
        </div>
      </div>
    </div>
    
    <div class="carousel-container" id="carousel-container">
      <div class="carousel-track" id="carousel-track"></div>
    </div>
    <div class="page-indicators" id="page-indicators"></div>

    <div id="overlay-container">
      <div class="overlay-header" id="overlay-header">
        <button class="overlay-back" onclick="closeOverlay()">
          <i data-lucide="chevron-left"></i> <span style="font-weight:600">Zurück</span>
        </button>
        <div class="overlay-title" id="overlay-title">Titel</div>
      </div>
      <div class="overlay-content" id="overlay-content"></div>
    </div>
    <div id="toast"></div>
  `;

  startClock();
  renderWidgetGrid();
  initSwipeNavigation();
  
  loadShoppingData(); 
  loadTodosData();
  loadNotesData();
  loadFoodData();
  loadChoresData();
  loadCountdownsData();
  loadPackagesData();
  loadWishlistData();
  
  loadTramDepartures();
  updateGreeting();

  // Jede Minute die Trams aktualisieren
  setInterval(loadTramDepartures, 60000);
  setInterval(updateGreeting, 3600000); // Check greeting every hour

  loadWeather();
  // Wetter alle 30 Minuten aktualisieren
  setInterval(loadWeather, 30 * 60000);

  lucide.createIcons();
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const nextTheme = current === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', nextTheme);
  localStorage.setItem('theme', nextTheme);
  
  const icon = document.getElementById('theme-icon');
  if (icon) {
    icon.setAttribute('data-lucide', nextTheme === 'light' ? 'moon' : 'sun');
    lucide.createIcons();
  }
}

function startClock() {
  const timeEl = document.getElementById('clock-time');
  const dateEl = document.getElementById('clock-date');
  
  const updateTime = () => {
    const now = new Date();
    timeEl.textContent = now.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
    dateEl.textContent = now.toLocaleDateString('de-CH', { weekday: 'long', day: 'numeric', month: 'long' });
  };
  
  updateTime();
  clockInterval = setInterval(updateTime, 1000);
}

// ════════════════════════════════════════════════════════════════
// TRAM DEPARTURES (SBB API)
// ════════════════════════════════════════════════════════════════
async function loadTramDepartures() {
  const tramBoard = document.getElementById('tram-board');
  if (!tramBoard) return;
  try {
    const res = await fetch('https://transport.opendata.ch/v1/stationboard?station=Allschwil,+Dorf&limit=3');
    const data = await res.json();
    if (data.stationboard && data.stationboard.length > 0) {
      let html = `<div class="sbb-title" style="font-size:1.1rem; color:var(--text); font-weight:600; display:flex; align-items:center; gap:6px; justify-content:flex-end; margin-bottom:8px;">
                    <i data-lucide="train-front" style="width:20px;height:20px;color:var(--c-todo);"></i> Abfahrten Allschwil Dorf
                  </div>`;
      
      data.stationboard.slice(0, 3).forEach(dep => {
        const time = new Date(dep.stop.departure);
        const timeStr = time.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
        
        const now = new Date();
        const diffMs = time - now;
        const diffMins = Math.floor(diffMs / 60000);
        
        let timeDisplay = '';
        if (diffMins <= 0) timeDisplay = 'Jetzt';
        else if (diffMins < 60) timeDisplay = `in ${diffMins}'`;
        else timeDisplay = timeStr;

        const line = dep.number;
        const dest = dep.to;
        html += `
          <div class="sbb-row" style="display:flex; align-items:center; justify-content:space-between; gap:16px; font-size:1.05rem; width:100%; margin-bottom:4px;">
            <div class="sbb-left" style="display:flex; align-items:center; gap:10px; flex:1;">
              <span class="sbb-badge" style="background:var(--bg-card-bot); border:1px solid var(--border); color:var(--text); padding:3px 8px; border-radius:6px; font-size:0.9rem; font-weight:600; min-width:32px; text-align:center;">${line}</span>
              <span class="sbb-dest" style="color:var(--text); max-width:145px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${dest}</span>
            </div>
            <span class="sbb-time" style="color:var(--c-home); font-weight:600; width:55px; text-align:right;">${timeDisplay}</span>
          </div>
        `;
      });
      tramBoard.innerHTML = html;
      lucide.createIcons();
    }
  } catch(e) {
    console.error('SBB API Error', e);
  }
}

// ════════════════════════════════════════════════════════════════
// WEATHER (Open-Meteo API)
// ════════════════════════════════════════════════════════════════
function getWeatherIconAndDesc(code, isDay = true) {
  let icon = 'cloud'; let desc = 'Bewölkt';
  if (code === 0) { icon = isDay ? 'sun' : 'moon'; desc = 'Klar'; }
  else if (code === 1 || code === 2) { icon = isDay ? 'cloud-sun' : 'cloud-moon'; desc = 'Leicht bewölkt'; }
  else if (code === 3) { icon = 'cloud'; desc = 'Bedeckt'; }
  else if (code === 45 || code === 48) { icon = 'cloud-fog'; desc = 'Nebel'; }
  else if (code >= 51 && code <= 67) { icon = 'cloud-rain'; desc = 'Regen'; }
  else if (code >= 71 && code <= 77) { icon = 'cloud-snow'; desc = 'Schnee'; }
  else if (code >= 80 && code <= 82) { icon = 'cloud-rain'; desc = 'Schauer'; }
  else if (code >= 85 && code <= 86) { icon = 'cloud-snow'; desc = 'Schneeschauer'; }
  else if (code >= 95) { icon = 'cloud-lightning'; desc = 'Gewitter'; }
  return { icon, desc };
}

async function loadWeather() {
  try {
    const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=47.5596&longitude=7.5886&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FZurich');
    const data = await res.json();
    
    if (data && data.current_weather && data.daily) {
      const cw = data.current_weather;
      currentWeatherData.temp = Math.round(cw.temperature);
      currentWeatherData.high = Math.round(data.daily.temperature_2m_max[0]);
      currentWeatherData.low = Math.round(data.daily.temperature_2m_min[0]);
      
      const isDay = cw.is_day === 1;
      const { icon, desc } = getWeatherIconAndDesc(cw.weathercode, isDay);
      currentWeatherData.icon = icon;
      currentWeatherData.desc = desc;

      currentWeatherData.daily = data.daily.time.map((t, i) => ({
        date: new Date(t),
        max: Math.round(data.daily.temperature_2m_max[i]),
        min: Math.round(data.daily.temperature_2m_min[i]),
        rain: data.daily.precipitation_probability_max[i],
        code: data.daily.weathercode[i]
      }));

      // Update Header
      const hw = document.getElementById('header-weather');
      if (hw) {
        hw.innerHTML = `<i data-lucide="${icon}"></i> ${currentWeatherData.temp}°C`;
        lucide.createIcons();
      }

      // Update ambient background
      const ambientBg = document.getElementById('ambient-bg');
      if (ambientBg) {
        ambientBg.className = 'ambient-bg'; // reset
        if (icon.includes('sun')) ambientBg.classList.add('weather-sun');
        else if (icon.includes('rain') || icon.includes('drizzle')) ambientBg.classList.add('weather-rain');
        else if (icon.includes('cloud')) ambientBg.classList.add('weather-cloud');
        else if (icon.includes('moon')) ambientBg.classList.add('weather-night');
      }

      // Update Widget
      updateWidgetInGrid('weather');
      if (document.getElementById('overlay-container').classList.contains('open') && document.getElementById('weather-list')) {
        openWeather();
      }
    }
  } catch(e) {
    console.error('Weather API Error', e);
  }
}

async function updateGreeting() {
  const titleEl = document.getElementById('greeting-title');
  if (!titleEl) return;
  
  const hour = new Date().getHours();
  let greeting = 'Guten Tag';
  if (hour >= 5 && hour < 12) greeting = 'Guten Morgen';
  else if (hour >= 12 && hour < 18) greeting = 'Guten Tag';
  else if (hour >= 18 && hour < 23) greeting = 'Guten Abend';
  else greeting = 'Gute Nacht';

  const name = currentUser?.email?.split('@')[0];
  if (name) {
    greeting += `, ${formatUserName(name)}`;
  }
  
  titleEl.innerText = greeting;
  updateGreetingSubtitle();
}

function updateGreetingSubtitle() {
  const subtitleEl = document.getElementById('greeting-subtitle');
  if (!subtitleEl) return;

  const pendingShopping = shoppingItems.filter(i => !i.is_done).length;
  const pendingTodos = todosItems.filter(i => !i.is_done).length;
  
  const myName = formatUserName(currentUser?.email?.split('@')[0]);
  const pendingChores = choresItems.filter(i => {
    if (i.is_done) return false;
    // Wenn explizit dem anderen zugewiesen, nicht mitzählen
    if (i.text.includes('(Timo)') && myName !== 'Timo') return false;
    if (i.text.includes('(Lana)') && myName !== 'Lana') return false;
    return true; // ansonsten meins oder für beide
  }).length;

  const lastViewedNotes = localStorage.getItem('last_viewed_notes');
  const pendingNotes = lastViewedNotes ? notesItems.filter(n => new Date(n.created_at) > new Date(lastViewedNotes)).length : notesItems.length;
  const pendingPackages = packagesItems.filter(i => !i.is_delivered).length;
  
  let parts = [];
  if (pendingShopping > 0) parts.push(`${pendingShopping} im Einkauf`);
  if (pendingTodos > 0) parts.push(`${pendingTodos} To-Do${pendingTodos > 1 ? 's' : ''}`);
  if (pendingChores > 0) parts.push(`${pendingChores} Ämtli`);
  if (pendingNotes > 0) parts.push(`${pendingNotes} Notiz${pendingNotes > 1 ? 'en' : ''}`);
  if (pendingPackages > 0) parts.push(`${pendingPackages} Paket${pendingPackages > 1 ? 'e' : ''}`);
  
  if (parts.length > 0) {
    subtitleEl.innerText = 'Heute: ' + parts.join(' · ');
  } else {
    subtitleEl.innerText = 'Heute: Alles erledigt!';
  }
}

function openWeather() {
  openOverlay('7-Tage Wetter Region Basel', 'var(--c-weather)', () => {
    if (!currentWeatherData.daily || currentWeatherData.daily.length === 0) {
      return `<div class="empty-state">
                <div class="empty-icon"><i data-lucide="cloud-sun"></i></div>
                <h3>Lade Wetterdaten...</h3>
              </div>`;
    }
    
    let html = `<div id="weather-list" style="display:flex; flex-direction:column; gap:8px; margin-top:8px;">`;
    
    currentWeatherData.daily.slice(0, 7).forEach((day, index) => {
      const isToday = index === 0;
      const dayName = isToday ? 'Heute' : day.date.toLocaleDateString('de-CH', { weekday: 'short' });
      const { icon } = getWeatherIconAndDesc(day.code, true);
      
      // Regen-Wahrscheinlichkeit nur anzeigen wenn > 10%
      const rainInfo = day.rain > 10 
        ? `<div style="color:#64d2ff; font-size:0.75rem; font-weight:600; display:flex; align-items:center; gap:4px; width:45px;"><i data-lucide="droplets" style="width:12px;height:12px;"></i> ${day.rain}%</div>` 
        : `<div style="width:45px;"></div>`;

      html += `
        <div class="list-item" style="padding:16px;">
          <span style="font-weight:600; width:60px; color:var(--text);">${dayName}</span>
          <i data-lucide="${icon}" style="width:24px;height:24px;color:var(--c-weather);"></i>
          ${rainInfo}
          <div style="display:flex; gap:16px; flex:1; justify-content:flex-end; font-size:1rem;">
            <span style="color:var(--text-muted);">${day.min}°</span>
            <span style="color:var(--text); font-weight:600;">${day.max}°</span>
          </div>
        </div>
      `;
    });
    
    html += `</div>`;
    return html;
  });
}

function renderWidgetGrid() {
  const track = document.getElementById('carousel-track');
  const indicators = document.getElementById('page-indicators');
  track.innerHTML = '';
  indicators.innerHTML = '';

  const widgetsPerPage = 8;
  const pages = Math.ceil(WIDGETS.length / widgetsPerPage);

  for (let i = 0; i < pages; i++) {
    const pageEl = document.createElement('div');
    pageEl.className = 'carousel-page';
    
    const pageWidgets = WIDGETS.slice(i * widgetsPerPage, (i + 1) * widgetsPerPage);
    pageWidgets.forEach(w => {
      const widgetEl = document.createElement('div');
      widgetEl.className = 'widget';
      widgetEl.id = `widget-${w.id}`;
      widgetEl.onclick = w.action;
      widgetEl.style.setProperty('--w-color', w.color);
      widgetEl.innerHTML = `
        <div class="widget-header-row">
          <div class="widget-icon"><i data-lucide="${w.icon}"></i></div>
          ${w.hasBadge && w.hasBadge() ? `<div style="width:12px; height:12px; border-radius:50%; background:var(--w-color); box-shadow: 0 0 10px var(--w-color);"></div>` : ''}
        </div>
        <div class="widget-content" id="content-${w.id}">${w.renderContent()}</div>
        <div class="widget-footer">
          <div class="widget-title">${w.title}</div>
          <div class="widget-preview" id="preview-${w.id}">${w.getPreview()}</div>
        </div>
      `;
      pageEl.appendChild(widgetEl);
    });

    track.appendChild(pageEl);
    const dot = document.createElement('div');
    dot.className = `indicator-dot ${i === 0 ? 'active' : ''}`;
    indicators.appendChild(dot);
  }
  
  // Initialize Sortable for each page
  if (typeof Sortable !== 'undefined') {
    document.querySelectorAll('.carousel-page').forEach(pageEl => {
      new Sortable(pageEl, {
        group: 'dashboard',
        animation: 150,
        delay: 250, // Wichtig für Touch/Mobile: Erst nach 250ms halten wird gedraggt
        delayOnTouchOnly: true,
        ghostClass: 'sortable-ghost',
        onEnd: function () {
          const newOrder = [];
          document.querySelectorAll('.widget').forEach(el => {
            const id = el.id.replace('widget-', '');
            newOrder.push(id);
          });
          
          WIDGETS.sort((a, b) => {
            let indexA = newOrder.indexOf(a.id);
            let indexB = newOrder.indexOf(b.id);
            if (indexA === -1) indexA = 999;
            if (indexB === -1) indexB = 999;
            return indexA - indexB;
          });
          
          localStorage.setItem('lanatimohome_widget_order', JSON.stringify(newOrder));
          renderWidgetGrid(); // Grid neu aufbauen (für Pagination-Ausgleich)
          lucide.createIcons();
        }
      });
    });
  }
}

// Lade gespeicherte Reihenfolge beim Start
const savedOrder = JSON.parse(localStorage.getItem('lanatimohome_widget_order'));
if (savedOrder) {
  WIDGETS.sort((a, b) => {
    let indexA = savedOrder.indexOf(a.id);
    let indexB = savedOrder.indexOf(b.id);
    if (indexA === -1) indexA = 999;
    if (indexB === -1) indexB = 999;
    return indexA - indexB;
  });
}

// Update specific widget without full re-render
function updateWidgetInGrid(id) {
  const w = WIDGETS.find(x => x.id === id);
  if (!w) return;
  const contentEl = document.getElementById(`content-${id}`);
  const previewEl = document.getElementById(`preview-${id}`);
  if (contentEl) contentEl.innerHTML = w.renderContent();
  if (previewEl) previewEl.textContent = w.getPreview();
  lucide.createIcons();
  
  // Update the summary subtitle in the header
  if (['shopping', 'todo', 'notes', 'chores', 'packages'].includes(id)) {
    updateGreetingSubtitle();
  }
}

function initSwipeNavigation() {
  const container = document.getElementById('carousel-container');
  const track = document.getElementById('carousel-track');
  const indicators = document.getElementById('page-indicators').children;
  
  let startX = 0, currentTranslate = 0, prevTranslate = 0, isDragging = false, animationID;
  const pagesCount = Math.ceil(WIDGETS.length / 8);

  const startDrag = (x) => {
    startX = x; isDragging = true;
    animationID = requestAnimationFrame(animation);
    track.style.transition = 'none';
  };

  const moveDrag = (x) => {
    if (!isDragging) return;
    currentTranslate = prevTranslate + (x - startX);
  };

  const endDrag = () => {
    if (!isDragging) return;
    isDragging = false; cancelAnimationFrame(animationID);
    const movedBy = currentTranslate - prevTranslate;
    track.style.transition = 'transform 0.3s cubic-bezier(0.25, 0.8, 0.25, 1)';
    if (movedBy < -50 && currentCarouselPage < pagesCount - 1) currentCarouselPage += 1;
    else if (movedBy > 50 && currentCarouselPage > 0) currentCarouselPage -= 1;
    
    currentTranslate = currentCarouselPage * -window.innerWidth;
    prevTranslate = currentTranslate;
    track.style.transform = `translateX(${currentTranslate}px)`;
    Array.from(indicators).forEach((dot, index) => dot.classList.toggle('active', index === currentCarouselPage));
  };

  // Touch Events
  container.addEventListener('touchstart', e => startDrag(e.touches[0].clientX));
  container.addEventListener('touchmove', e => moveDrag(e.touches[0].clientX));
  container.addEventListener('touchend', endDrag);

  // Trackpad / Wheel Events (2-Finger Swipe)
  let wheelTimeout = null;
  container.addEventListener('wheel', e => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      e.preventDefault();
      if (wheelTimeout) return; // Debounce
      
      if (e.deltaX > 20 && currentCarouselPage < pagesCount - 1) {
        currentCarouselPage += 1;
        triggerWheelChange();
      } else if (e.deltaX < -20 && currentCarouselPage > 0) {
        currentCarouselPage -= 1;
        triggerWheelChange();
      }
    }
  }, { passive: false });

  function triggerWheelChange() {
    track.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.8, 0.25, 1)';
    currentTranslate = currentCarouselPage * -window.innerWidth;
    prevTranslate = currentTranslate;
    track.style.transform = `translateX(${currentTranslate}px)`;
    Array.from(indicators).forEach((dot, index) => dot.classList.toggle('active', index === currentCarouselPage));
    wheelTimeout = setTimeout(() => { wheelTimeout = null; }, 600);
  }

  function animation() {
    track.style.transform = `translateX(${currentTranslate}px)`;
    if (isDragging) requestAnimationFrame(animation);
  }
}

// ════════════════════════════════════════════════════════════════
// OVERLAYS (Detail Views)
// ════════════════════════════════════════════════════════════════
function openOverlay(title, color, renderFn, onInit) {
  const container = document.getElementById('overlay-container');
  const header = document.getElementById('overlay-header');
  
  container.style.setProperty('--w-color', color);
  document.getElementById('overlay-title').textContent = title;
  
  const content = document.getElementById('overlay-content');
  content.innerHTML = renderFn();
  if (onInit) onInit();
  
  lucide.createIcons();
  container.classList.add('open');
}

function closeOverlay() {
  document.getElementById('overlay-container').classList.remove('open');
}

function openPlaceholderOverlay(title, color, iconName) {
  openOverlay(title, color, () => `
    <div class="empty-state">
      <div class="empty-icon"><i data-lucide="${iconName}"></i></div>
      <h3>${title}</h3>
      <p>Diese Ansicht wird bald entwickelt. Freu dich drauf!</p>
    </div>
  `);
}

// ════════════════════════════════════════════════════════════════
// SHOPPING LIST WIDGET
// ════════════════════════════════════════════════════════════════
async function loadShoppingData() {
  const { data, error } = await db.from('shopping_items').select('*').order('created_at', { ascending: true });
  if (!error && data) {
    shoppingItems = data;
    updateWidgetInGrid('shopping');
  }
  if (!realtimeChan) {
    realtimeChan = db.channel('shopping_realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'shopping_items' }, payload => {
      if (payload.eventType === 'INSERT' && !shoppingItems.find(i => i.id === payload.new.id)) shoppingItems.push(payload.new);
      if (payload.eventType === 'UPDATE') shoppingItems = shoppingItems.map(i => i.id === payload.new.id ? payload.new : i);
      if (payload.eventType === 'DELETE') shoppingItems = shoppingItems.filter(i => i.id !== payload.old.id);
      updateWidgetInGrid('shopping');
      if (document.getElementById('overlay-container').classList.contains('open') && document.getElementById('shopping-list')) renderShoppingList();
    }).subscribe();
  }
}

function openShopping() {
  openOverlay('Einkaufsliste', 'var(--c-shopping)', () => `
    <div class="input-row">
      <input type="text" id="new-item-input" placeholder="Neues Item..." autocomplete="off" />
      <button id="add-item-btn" class="btn-compact"><i data-lucide="plus"></i></button>
    </div>
    <div class="list-toolbar">
      <span>Artikel</span>
      <button id="clear-done-btn" style="display:none; height:32px; padding:0 12px; border-radius:16px; align-items:center; gap:6px; background:var(--bg-card); border:1px solid var(--border); color:var(--text); font-size:0.85rem; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='var(--bg-card-bot)'" onmouseout="this.style.background='var(--bg-card)'"><i data-lucide="trash-2" style="width:16px;height:16px;"></i> Erledigte löschen</button>
    </div>
    <div id="shopping-list"></div>
  `, () => {
    document.getElementById('add-item-btn').addEventListener('click', addShoppingItem);
    document.getElementById('new-item-input').addEventListener('keydown', e => { if (e.key === 'Enter') addShoppingItem(); });
    document.getElementById('clear-done-btn').addEventListener('click', clearDoneShoppingItems);
    renderShoppingList();
  });
}

function renderShoppingList() {
  const list = document.getElementById('shopping-list');
  const clearBtn = document.getElementById('clear-done-btn');
  if (!list) return;

  const doneCount = shoppingItems.filter(i => i.is_done).length;
  if (clearBtn) clearBtn.style.display = doneCount > 0 ? 'flex' : 'none';

  list.innerHTML = '';
  const sorted = [...shoppingItems.filter(i => !i.is_done), ...shoppingItems.filter(i => i.is_done)];
  
  if (sorted.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i data-lucide="shopping-bag"></i></div>
        <h3>Alles eingekauft!</h3>
        <p>Der Kühlschrank ist voll. Füge oben neue Artikel hinzu.</p>
      </div>`;
    lucide.createIcons();
    return;
  }

  sorted.forEach(item => {
    const el = document.createElement('div');
    el.className = `list-item ${item.is_done ? 'done' : ''}`;
    let itemContentHtml = '';
    const isMenu = item.text.startsWith('[Menü]');
    if (isMenu) {
      const parts = item.text.replace('[Menü] ', '').split('\nZutaten: ');
      const title = parts[0];
      const ingredients = parts[1] || 'Keine Zutaten angegeben';
      itemContentHtml = `
        <div class="list-item-content">
          <div style="font-weight:500; color:var(--text); display:flex; align-items:center; gap:6px;">
            <i data-lucide="chef-hat" style="width:14px;height:14px;"></i> ${escapeHtml(title)}
          </div>
          <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
            ${escapeHtml(ingredients)}
          </div>
        </div>
      `;
    } else {
      itemContentHtml = `
        <div class="list-item-content">
          <div style="font-weight:500; color:var(--text);">${escapeHtml(item.text)}</div>
        </div>
      `;
    }

    const qty = item.quantity || 1;
    el.innerHTML = `
      <div class="list-item-check" onclick="toggleShoppingItem('${item.id}')">
        <i data-lucide="${item.is_done ? 'check-square' : 'square'}"></i>
      </div>
      ${itemContentHtml}
      
      <div style="display:flex; align-items:center; background:var(--bg-input); border:1px solid var(--border); border-radius:16px; padding:3px 4px; margin-right:12px; gap:6px; box-shadow:0 2px 8px rgba(0,0,0,0.2);">
        <button style="width:26px; height:26px; border-radius:13px; background:var(--bg-card); border:1px solid var(--border); color:var(--text); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='var(--bg-card-bot)'" onmouseout="this.style.background='var(--bg-card)'" onclick="updateShoppingQuantity('${item.id}', -1)"><i data-lucide="minus" style="width:14px;height:14px;"></i></button>
        <span style="font-size:0.95rem; font-weight:700; width:18px; text-align:center; color:var(--text);">${qty}</span>
        <button style="width:26px; height:26px; border-radius:13px; background:var(--bg-card); border:1px solid var(--border); color:var(--text); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='var(--bg-card-bot)'" onmouseout="this.style.background='var(--bg-card)'" onclick="updateShoppingQuantity('${item.id}', 1)"><i data-lucide="plus" style="width:14px;height:14px;"></i></button>
      </div>

      <button class="item-delete" onclick="deleteShoppingItem('${item.id}')">
        <i data-lucide="trash-2"></i>
      </button>
    `;
    list.appendChild(el);
  });

  lucide.createIcons();
}

async function addShoppingItem() {
  const input = document.getElementById('new-item-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  
  const tempId = 'temp-' + Date.now();
  shoppingItems.push({ id: tempId, text, is_done: false, quantity: 1, created_at: new Date().toISOString() });
  updateWidgetInGrid('shopping');
  renderShoppingList();

  const { error } = await db.from('shopping_items').insert([{ text, is_done: false, quantity: 1 }]);
  if (error) showToast('Fehler beim Speichern');
  else loadShoppingData();
}

async function toggleShoppingItem(id) {
  const item = shoppingItems.find(i => i.id === id);
  if (!item) return;
  item.is_done = !item.is_done;
  updateWidgetInGrid('shopping');
  renderShoppingList();
  await db.from('shopping_items').update({ is_done: item.is_done }).eq('id', id);
}

async function updateShoppingQuantity(id, delta) {
  const item = shoppingItems.find(i => i.id === id);
  if (!item) return;
  const currentQty = item.quantity || 1;
  const newQty = Math.max(1, currentQty + delta);
  if (currentQty === newQty) return;
  item.quantity = newQty;
  updateWidgetInGrid('shopping');
  renderShoppingList();
  await db.from('shopping_items').update({ quantity: newQty }).eq('id', id);
}

async function deleteShoppingItem(id) {
  shoppingItems = shoppingItems.filter(i => i.id !== id);
  updateWidgetInGrid('shopping');
  renderShoppingList();
  await db.from('shopping_items').delete().eq('id', id);
}

async function clearDoneShoppingItems() {
  const doneIds = shoppingItems.filter(i => i.is_done).map(i => i.id);
  shoppingItems = shoppingItems.filter(i => !i.is_done);
  updateWidgetInGrid('shopping');
  renderShoppingList();
  await db.from('shopping_items').delete().in('id', doneIds);
}

// ════════════════════════════════════════════════════════════════
// TODO LIST WIDGET
// ════════════════════════════════════════════════════════════════
let todosChan = null;

async function loadTodosData() {
  const { data, error } = await db.from('todos').select('*').order('created_at', { ascending: true });
  if (!error && data) {
    todosItems = data;
    updateWidgetInGrid('todo');
  }
  if (!todosChan) {
    todosChan = db.channel('todos_realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'todos' }, payload => {
      if (payload.eventType === 'INSERT' && !todosItems.find(i => i.id === payload.new.id)) todosItems.push(payload.new);
      if (payload.eventType === 'UPDATE') todosItems = todosItems.map(i => i.id === payload.new.id ? payload.new : i);
      if (payload.eventType === 'DELETE') todosItems = todosItems.filter(i => i.id !== payload.old.id);
      updateWidgetInGrid('todo');
      if (document.getElementById('overlay-container').classList.contains('open') && document.getElementById('todo-list')) renderTodoList();
    }).subscribe();
  }
}

function openTodos() {
  openOverlay('To-Do', 'var(--c-todo)', () => `
    <div class="input-row">
      <input type="text" id="new-todo-input" placeholder="Neue Aufgabe..." autocomplete="off" />
      <input type="date" id="new-todo-date" style="flex:none; width:auto; padding-right:12px;" />
      <button id="add-todo-btn" class="btn-compact"><i data-lucide="plus"></i></button>
    </div>
    <div class="list-toolbar">
      <span>Aufgaben</span>
      <button id="clear-done-todo-btn" style="display:none; height:32px; padding:0 12px; border-radius:16px; align-items:center; gap:6px; background:var(--bg-card); border:1px solid var(--border); color:var(--text); font-size:0.85rem; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='var(--bg-card-bot)'" onmouseout="this.style.background='var(--bg-card)'"><i data-lucide="trash-2" style="width:16px;height:16px;"></i> Erledigte löschen</button>
    </div>
    <div id="todo-list"></div>
  `, () => {
    document.getElementById('add-todo-btn').addEventListener('click', addTodoItem);
    document.getElementById('new-todo-input').addEventListener('keydown', e => { if (e.key === 'Enter') addTodoItem(); });
    document.getElementById('clear-done-todo-btn').addEventListener('click', clearDoneTodos);
    renderTodoList();
  });
}

function renderTodoList() {
  const list = document.getElementById('todo-list');
  const clearBtn = document.getElementById('clear-done-todo-btn');
  if (!list) return;

  const doneCount = todosItems.filter(i => i.is_done).length;
  if (clearBtn) clearBtn.style.display = doneCount > 0 ? 'flex' : 'none';

  list.innerHTML = '';
  const sorted = [...todosItems.filter(i => !i.is_done), ...todosItems.filter(i => i.is_done)];
  if (sorted.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i data-lucide="check-circle-2"></i></div>
        <h3>Alles erledigt! 🎉</h3>
        <p>Genieße den Tag, du hast keine offenen Aufgaben mehr.</p>
      </div>`;
    lucide.createIcons();
    return;
  }
  sorted.forEach(item => {
    const el = document.createElement('div');
    el.className = `list-item ${item.is_done ? 'done' : ''}`;
    el.innerHTML = `
      <div class="item-check" onclick="toggleTodoItem('${item.id}')"><i data-lucide="check" style="width:16px;height:16px;"></i></div>
      <div class="item-text">${escapeHtml(item.text)}</div>
      <button class="item-delete" onclick="deleteTodoItem('${item.id}')"><i data-lucide="x" style="width:16px;height:16px;"></i></button>
    `;
    list.appendChild(el);
  });
  
  lucide.createIcons();
}

async function addTodoItem() {
  const input = document.getElementById('new-todo-input');
  const dateInput = document.getElementById('new-todo-date');
  let text = input.value.trim();
  const dateVal = dateInput.value;
  if (!text) return;
  
  if (dateVal) {
     const dateObj = new Date(dateVal);
     const dateStr = dateObj.toLocaleDateString('de-CH', {day: '2-digit', month: '2-digit'});
     text = `${text} (bis ${dateStr})`;
  }
  
  input.value = '';
  dateInput.value = '';
  
  const tempId = 'temp-' + Date.now();
  todosItems.push({ id: tempId, text, is_done: false, created_at: new Date().toISOString() });
  updateWidgetInGrid('todo');
  renderTodoList();

  const { error } = await db.from('todos').insert([{ text, is_done: false }]);
  if (error) showToast('Fehler beim Speichern');
  else loadTodosData();
}

async function toggleTodoItem(id) {
  const item = todosItems.find(i => i.id === id);
  if (!item) return;
  item.is_done = !item.is_done;
  updateWidgetInGrid('todo');
  renderTodoList();
  await db.from('todos').update({ is_done: item.is_done }).eq('id', id);
}

async function deleteTodoItem(id) {
  todosItems = todosItems.filter(i => i.id !== id);
  updateWidgetInGrid('todo');
  renderTodoList();
  await db.from('todos').delete().eq('id', id);
}

async function clearDoneTodos() {
  const doneIds = todosItems.filter(i => i.is_done).map(i => i.id);
  todosItems = todosItems.filter(i => !i.is_done);
  updateWidgetInGrid('todo');
  renderTodoList();
  await db.from('todos').delete().in('id', doneIds);
}

// ════════════════════════════════════════════════════════════════
// NOTES WIDGET
// ════════════════════════════════════════════════════════════════
let notesChan = null;

async function loadNotesData() {
  const { data, error } = await db.from('notes').select('*').order('created_at', { ascending: false });
  if (!error && data) {
    notesItems = data;
    updateWidgetInGrid('notes');
  }
  if (!notesChan) {
    notesChan = db.channel('notes_realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'notes' }, payload => {
      if (payload.eventType === 'INSERT' && !notesItems.find(i => i.id === payload.new.id)) notesItems.unshift(payload.new);
      if (payload.eventType === 'DELETE') notesItems = notesItems.filter(i => i.id !== payload.old.id);
      updateWidgetInGrid('notes');
      if (document.getElementById('overlay-container').classList.contains('open') && document.getElementById('notes-list')) renderNotesList();
    }).subscribe();
  }
}

function openNotes() {
  localStorage.setItem('last_viewed_notes', new Date().toISOString());
  updateGreetingSubtitle();
  updateWidgetInGrid('notes');

  openOverlay('Notizen', 'var(--c-notes)', () => `
    <div class="input-row">
      <textarea id="new-note-input" placeholder="Neue Notiz schreiben..." rows="2"></textarea>
      <button id="add-note-btn" class="btn-compact" style="height: auto;"><i data-lucide="send"></i></button>
    </div>
    <div id="notes-list"></div>
  `, () => {
    document.getElementById('add-note-btn').addEventListener('click', addNoteItem);
    renderNotesList();
  });
}

function renderNotesList() {
  const list = document.getElementById('notes-list');
  if (!list) return;

  list.innerHTML = '';
  if (notesItems.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon"><i data-lucide="message-square"></i></div>
        <h3>Noch keine Notizen</h3>
        <p>Hinterlasse dem anderen eine kurze Nachricht.</p>
      </div>`;
    lucide.createIcons();
    return;
  }
  notesItems.forEach(item => {
    const el = document.createElement('div');
    el.className = 'note-card';
    const isMe = item.author === (currentUser?.email?.split('@')[0] ?? 'Unbekannt');
    const date = new Date(item.created_at).toLocaleString('de-CH', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' });

    el.innerHTML = `
      <div class="note-header">
        <strong class="${isMe ? 'is-me' : ''}">${escapeHtml(formatUserName(item.author))}</strong>
        <span>${date}</span>
      </div>
      <div class="note-body">${escapeHtml(item.text)}</div>
      <button class="note-delete" onclick="deleteNoteItem('${item.id}')"><i data-lucide="x" style="width:16px;height:16px;"></i></button>
    `;
    list.appendChild(el);
  });
  
  lucide.createIcons();
}

async function addNoteItem() {
  const input = document.getElementById('new-note-input');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  
  const author = currentUser?.email?.split('@')[0] ?? 'Unbekannt';
  const tempId = 'temp-' + Date.now();
  notesItems.unshift({ id: tempId, text, author, created_at: new Date().toISOString() });
  updateWidgetInGrid('notes');
  renderNotesList();

  const { error } = await db.from('notes').insert([{ text, author }]);
  if (error) showToast('Fehler beim Speichern');
  else loadNotesData();
}

async function deleteNoteItem(id) {
  notesItems = notesItems.filter(i => i.id !== id);
  updateWidgetInGrid('notes');
  renderNotesList();
  await db.from('notes').delete().eq('id', id);
}

// ════════════════════════════════════════════════════════════════
// ESSENSPLAN OVERLAY
// ════════════════════════════════════════════════════════════════
async function loadFoodData() {
  const { data, error } = await db.from('food_plan').select('*');
  if (!error && data) {
    foodItems = data;
    updateWidgetInGrid('food');
  }
  if (!foodChan) {
    foodChan = db.channel('food_realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'food_plan' }, payload => {
      if (payload.eventType === 'INSERT' && !foodItems.find(i => i.id === payload.new.id)) foodItems.push(payload.new);
      if (payload.eventType === 'UPDATE') foodItems = foodItems.map(i => i.id === payload.new.id ? payload.new : i);
      if (payload.eventType === 'DELETE') foodItems = foodItems.filter(i => i.id !== payload.old.id);
      updateWidgetInGrid('food');
      if (document.getElementById('overlay-container').classList.contains('open') && document.querySelector('.food-day-card')) {
        openFoodPlan(); // Reload view
      }
    }).subscribe();
  }
}

function openFoodPlan() {
  const days = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
  const todayIndex = new Date().getDay() || 7;
  
  openOverlay('Essensplan', 'var(--c-food)', () => {
    let html = `<div style="display:flex; flex-direction:column; gap:12px; margin-top:8px;">`;
    
    days.forEach((day, index) => {
      const isToday = (index + 1 === todayIndex);
      const existing = foodItems.find(f => f.day === day);
      const mealText = existing ? escapeHtml(existing.meal) : '';
      
      html += `
        <div class="food-day-card ${isToday ? 'is-today' : ''}" style="background:var(--bg-card); padding:12px; border-radius:var(--radius-md); ${isToday ? 'border:1px solid var(--c-food); box-shadow:0 0 12px color-mix(in srgb, var(--c-food) 20%, transparent);' : ''}">
          <div class="food-day-title" style="font-weight:600; color:var(--text); font-size:0.95rem; margin-bottom:8px; display:flex; justify-content:space-between;">
            ${day} ${isToday ? '<span style="color:var(--c-food);font-size:0.8rem;">(Heute)</span>' : ''}
          </div>
          <div class="input-row" style="margin-bottom:0; display:flex; gap:8px;">
            <input type="text" id="food-input-${day}" class="food-day-input" placeholder="Was gibt's?" value="${mealText}" onchange="saveFoodPlan('${day}', this.value)" style="flex:1; min-width:0; background:var(--bg-input); border:2px solid transparent; box-shadow:var(--shadow-inner); border-radius:var(--radius-sm); color:var(--text); padding:8px 12px; font-size:1rem; width:100%; -webkit-appearance:none; appearance:none;" />
            <button class="btn-compact" onclick="saveFoodPlanAndReload('${day}', document.getElementById('food-input-${day}').value)" title="Speichern" style="background:var(--bg-button); color:var(--text); border:none; border-radius:var(--radius-sm); width:40px; height:40px; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0;"><i data-lucide="check"></i></button>
            ${mealText ? `<button class="btn-compact" onclick="addMealToShopping('${escapeHtml(mealText.replace(/'/g, "\\'"))}')" title="Zur Einkaufsliste hinzufügen" style="background:var(--bg-button); color:var(--text); border:none; border-radius:var(--radius-sm); width:40px; height:40px; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0;"><i data-lucide="shopping-cart"></i></button>` : ''}
          </div>
        </div>
      `;
    });
    
    html += `</div>`;
    return html;
  });
}

async function saveFoodPlan(day, meal) {
  const existing = foodItems.find(f => f.day === day);
  const trimmed = meal.trim();
  
  if (existing) {
    if (!trimmed) {
      foodItems = foodItems.filter(f => f.id !== existing.id);
      const { error } = await db.from('food_plan').delete().eq('id', existing.id);
      if (error) showToast('Fehler beim Löschen: ' + error.message);
    } else if (existing.meal !== trimmed) {
      existing.meal = trimmed;
      const { error } = await db.from('food_plan').update({ meal: trimmed }).eq('id', existing.id);
      if (error) showToast('Fehler beim Speichern: ' + error.message);
    }
  } else if (trimmed) {
    const tempId = 'temp-' + Date.now();
    foodItems.push({ id: tempId, day, meal: trimmed });
    const { data, error } = await db.from('food_plan').insert([{ day, meal: trimmed }]).select();
    if (error) {
      showToast('Fehler beim Einfügen: ' + error.message);
      foodItems = foodItems.filter(f => f.id !== tempId); // Revert
    } else if (data && data.length > 0) {
      const idx = foodItems.findIndex(f => f.id === tempId);
      if (idx !== -1) foodItems[idx] = data[0];
    }
  }
  updateWidgetInGrid('food');
}

async function saveFoodPlanAndReload(day, meal) {
  await saveFoodPlan(day, meal);
  openFoodPlan();
}

async function addMealToShopping(meal) {
  const ingredients = prompt(`Zutaten für ${meal} (kommagetrennt):`);
  if (ingredients === null) return; // User cancelled
  
  const text = `[Menü] ${meal}\nZutaten: ${ingredients.trim() ? ingredients.trim() : '... (nichts eingetragen)'}`;
  
  const tempId = 'temp-' + Date.now();
  shoppingItems.unshift({ id: tempId, text, is_done: false, created_at: new Date().toISOString() });
  updateWidgetInGrid('shopping');
  
  const { error } = await db.from('shopping_items').insert([{ text, is_done: false }]);
  if (error) {
    showToast('Fehler: ' + error.message);
  } else {
    showToast(`${meal} zur Einkaufsliste hinzugefügt`);
    loadShoppingData();
  }
}

// ════════════════════════════════════════════════════════════════
// ÄMTLI-PLAN (CHORES)
// ════════════════════════════════════════════════════════════════
async function loadChoresData() {
  const { data, error } = await db.from('chores').select('*').order('created_at', { ascending: false });
  if (!error && data) {
    choresItems = data;
    await autoResetChores();
    updateWidgetInGrid('chores');
  }
  if (!choresChan) {
    choresChan = db.channel('chores_realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'chores' }, payload => {
      if (payload.eventType === 'INSERT' && !choresItems.find(i => i.id === payload.new.id)) choresItems.unshift(payload.new);
      if (payload.eventType === 'UPDATE') choresItems = choresItems.map(i => i.id === payload.new.id ? payload.new : i);
      if (payload.eventType === 'DELETE') choresItems = choresItems.filter(i => i.id !== payload.old.id);
      updateWidgetInGrid('chores');
      renderChoresList();
    }).subscribe();
  }
}

async function autoResetChores() {
  const today = new Date();
  today.setHours(0,0,0,0);
  let changed = false;
  
  for (let item of choresItems) {
    if (item.is_done) {
      const isRecurring = item.text.includes('[Täglich]') || item.text.includes('[Wöchentlich]') || item.text.includes('[Monatlich]');
      if (isRecurring) {
        const dateMatch = item.text.match(/\(bis (\d{2})\.(\d{2})\.?(\d{4}|\d{2})?\)/);
        if (dateMatch) {
          let [_, d, m, y] = dateMatch;
          if (!y) y = new Date().getFullYear().toString();
          else if (y.length === 2) y = '20' + y;
          const dueDate = new Date(`${y}-${m}-${d}`);
          dueDate.setHours(0,0,0,0);
          
          if (today >= dueDate) {
            item.is_done = false;
            changed = true;
            await db.from('chores').update({ is_done: false }).eq('id', item.id);
          }
        }
      }
    }
  }
  if (changed) {
    updateWidgetInGrid('chores');
    renderChoresList();
  }
}

function openChores() {
  openOverlay('Ämtli-Plan', 'var(--c-chores)', () => `
    <div style="display:flex; flex-direction:column; gap:0;">
      <div class="input-row" style="margin-bottom:8px;">
        <input type="text" id="new-chore-input" placeholder="Was muss geputzt/erledigt werden?" />
        <button id="add-chore-btn" class="btn-compact"><i data-lucide="plus"></i></button>
      </div>
      <div class="input-row">
        <select id="new-chore-assignee" style="flex:1;">
          <option value="">Wer?</option>
          <option value="Timo">Timo</option>
          <option value="Lana">Lana</option>
        </select>
        <select id="new-chore-recurrence" style="flex:1;">
          <option value="">Einmalig (Todo)</option>
          <option value="Täglich" selected>Täglich</option>
          <option value="Wöchentlich">Wöchentlich</option>
          <option value="Monatlich">Monatlich</option>
        </select>
      </div>
    </div>
    <div class="list-toolbar">
      <span>Ämtli</span>
      <button id="clear-done-chore-btn" style="display:none; height:32px; padding:0 12px; border-radius:16px; align-items:center; gap:6px; background:var(--bg-card); border:1px solid var(--border); color:var(--text); font-size:0.85rem; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='var(--bg-card-bot)'" onmouseout="this.style.background='var(--bg-card)'"><i data-lucide="trash-2" style="width:16px;height:16px;"></i> Erledigte löschen</button>
    </div>
    <div id="chores-list"></div>
  `, () => {
    document.getElementById('add-chore-btn').addEventListener('click', addChore);
    document.getElementById('new-chore-input').addEventListener('keydown', e => { if (e.key === 'Enter') addChore(); });
    document.getElementById('clear-done-chore-btn').addEventListener('click', clearDoneChores);
    renderChoresList();
  });
}

function renderChoresList() {
  const list = document.getElementById('chores-list');
  const clearBtn = document.getElementById('clear-done-chore-btn');
  if (!list) return;
  list.innerHTML = '';
  
  const doneCount = choresItems.filter(i => i.is_done).length;
  if (clearBtn) clearBtn.style.display = doneCount > 0 ? 'flex' : 'none';
  
  const recurring = choresItems.filter(i => i.text.includes('[Täglich]') || i.text.includes('[Wöchentlich]') || i.text.includes('[Monatlich]'));
  const oneOff = choresItems.filter(i => !recurring.includes(i));
  
  if (choresItems.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" style="background:color-mix(in srgb, var(--c-chores) 15%, transparent); color:var(--c-chores);"><i data-lucide="sparkles"></i></div>
        <h3>Alles blitzblank!</h3>
        <p>Es gibt aktuell keine offenen Ämtli.</p>
      </div>`;
    lucide.createIcons();
    return;
  }

  const renderItems = (items) => {
    const sorted = [...items.filter(i => !i.is_done), ...items.filter(i => i.is_done)];
    sorted.forEach(item => {
      const el = document.createElement('div');
      el.className = `list-item ${item.is_done ? 'done' : ''}`;
      el.innerHTML = `
        <div class="item-check" onclick="toggleChore('${item.id}')"><i data-lucide="check" style="width:16px;height:16px;"></i></div>
        <div class="item-text">${escapeHtml(item.text)}</div>
        <button class="item-delete" onclick="deleteChore('${item.id}')"><i data-lucide="x" style="width:16px;height:16px;"></i></button>
      `;
      list.appendChild(el);
    });
  };

  if (recurring.length > 0) {
    const header = document.createElement('div');
    header.style.color = 'var(--c-chores)';
    header.style.fontSize = '0.9rem';
    header.style.fontWeight = '700';
    header.style.marginTop = '8px';
    header.style.marginBottom = '8px';
    header.style.textTransform = 'uppercase';
    header.style.letterSpacing = '1px';
    header.innerHTML = 'Wiederkehrend';
    list.appendChild(header);
    renderItems(recurring);
  }

  if (oneOff.length > 0) {
    const header = document.createElement('div');
    header.style.color = 'var(--text-muted)';
    header.style.fontSize = '0.9rem';
    header.style.fontWeight = '600';
    header.style.marginTop = '16px';
    header.style.marginBottom = '8px';
    header.innerHTML = 'Einmalig';
    list.appendChild(header);
    renderItems(oneOff);
  }

  lucide.createIcons();
}

async function addChore() {
  const input = document.getElementById('new-chore-input');
  const assigneeSelect = document.getElementById('new-chore-assignee');
  const recurrenceSelect = document.getElementById('new-chore-recurrence');
  
  const text = input.value.trim();
  const assignee = assigneeSelect.value;
  const recurrence = recurrenceSelect.value;
  if (!text) return;
  
  input.value = '';
  assigneeSelect.value = '';
  recurrenceSelect.value = 'Täglich'; // Zurück auf den neuen Default setzen
  
  let finalText = text;
  if (assignee) finalText += ` (${assignee})`;
  if (recurrence) finalText += ` [${recurrence}]`;
  
  const tempId = 'temp-' + Date.now();
  choresItems.unshift({ id: tempId, text: finalText, is_done: false, created_at: new Date().toISOString() });
  updateWidgetInGrid('chores');
  renderChoresList();

  const { error } = await db.from('chores').insert([{ text: finalText, is_done: false }]);
  if (error) showToast('Fehler beim Speichern');
  else loadChoresData();
}

async function toggleChore(id) {
  const item = choresItems.find(i => i.id === id);
  if (!item) return;

  const isRecurring = item.text.includes('[Täglich]') || item.text.includes('[Wöchentlich]') || item.text.includes('[Monatlich]');
  
  if (!item.is_done && isRecurring) {
    let nextDate = new Date();
    let newText = item.text;
    
    const dateMatch = newText.match(/\(bis (\d{2})\.(\d{2})\.?(\d{4}|\d{2})?\)/);
    if (dateMatch) {
      let [_, d, m, y] = dateMatch;
      if (!y) y = new Date().getFullYear().toString();
      else if (y.length === 2) y = '20' + y;
      nextDate = new Date(`${y}-${m}-${d}`);
    }

    if (newText.includes('[Täglich]')) {
      nextDate.setDate(nextDate.getDate() + 1);
    } else if (newText.includes('[Wöchentlich]')) {
      nextDate.setDate(nextDate.getDate() + 7);
    } else if (newText.includes('[Monatlich]')) {
      nextDate.setMonth(nextDate.getMonth() + 1);
    }

    const nextStr = nextDate.toLocaleDateString('de-CH', {day: '2-digit', month: '2-digit'});

    if (dateMatch) {
      newText = newText.replace(dateMatch[0], `(bis ${nextStr})`);
    } else {
      newText += ` (bis ${nextStr})`;
    }

    item.text = newText;
    item.is_done = true; // Nun wird es ausgegraut!
    updateWidgetInGrid('chores');
    renderChoresList();
    showToast('Bis zum nächsten Intervall ausgegraut!');
    await db.from('chores').update({ text: newText, is_done: true }).eq('id', id);
    return;
  }

  item.is_done = !item.is_done;
  updateWidgetInGrid('chores');
  renderChoresList();
  await db.from('chores').update({ is_done: item.is_done }).eq('id', id);
}

async function clearDoneChores() {
  const doneItems = choresItems.filter(i => i.is_done);
  const toDelete = [];
  
  doneItems.forEach(item => {
    // Wiederkehrende Ämtlis ignorieren (sie bleiben ausgegraut, bis das Datum fällig ist)
    const isRecurring = item.text.includes('[Täglich]') || item.text.includes('[Wöchentlich]') || item.text.includes('[Monatlich]');
    if (!isRecurring) {
      toDelete.push(item.id);
    }
  });

  choresItems = choresItems.filter(i => !toDelete.includes(i.id));
  updateWidgetInGrid('chores');
  renderChoresList();

  if (toDelete.length > 0) {
    await db.from('chores').delete().in('id', toDelete);
  }
}

async function deleteChore(id) {
  choresItems = choresItems.filter(i => i.id !== id);
  updateWidgetInGrid('chores');
  renderChoresList();
  await db.from('chores').delete().eq('id', id);
}

// ════════════════════════════════════════════════════════════════
// COUNTDOWNS
// ════════════════════════════════════════════════════════════════
async function loadCountdownsData() {
  const { data, error } = await db.from('countdowns').select('*').order('date', { ascending: true });
  if (!error && data) {
    countdownsItems = data;
    updateWidgetInGrid('countdown');
  }
  if (!countdownsChan) {
    countdownsChan = db.channel('countdowns_realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'countdowns' }, payload => {
      if (payload.eventType === 'INSERT' && !countdownsItems.find(i => i.id === payload.new.id)) countdownsItems.push(payload.new);
      if (payload.eventType === 'UPDATE') countdownsItems = countdownsItems.map(i => i.id === payload.new.id ? payload.new : i);
      if (payload.eventType === 'DELETE') countdownsItems = countdownsItems.filter(i => i.id !== payload.old.id);
      updateWidgetInGrid('countdown');
      renderCountdownsList();
    }).subscribe();
  }
}

function openCountdowns() {
  openOverlay('Countdowns', 'var(--c-countdown)', () => `
    <div class="input-row">
      <input type="text" id="new-cd-title" placeholder="Ereignis eintragen..." />
      <input type="date" id="new-cd-date" style="flex:none; width:auto; padding-right:12px;" />
      <button id="add-cd-btn" class="btn-compact"><i data-lucide="plus"></i></button>
    </div>
    <div id="countdowns-list"></div>
  `, () => {
    document.getElementById('add-cd-btn').addEventListener('click', addCountdown);
    renderCountdownsList();
  });
}

function renderCountdownsList() {
  const list = document.getElementById('countdowns-list');
  if (!list) return;
  list.innerHTML = '';
  
  const sorted = [...countdownsItems].sort((a,b) => new Date(a.date) - new Date(b.date));
  
  if (sorted.length === 0) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon" style="background:color-mix(in srgb, var(--c-countdown) 15%, transparent); color:var(--c-countdown);"><i data-lucide="timer"></i></div>
        <h3>Keine Events</h3>
        <p>Worauf freust du dich als Nächstes?</p>
      </div>`;
    lucide.createIcons();
    return;
  }

  const today = new Date(); today.setHours(0,0,0,0);

  sorted.forEach(item => {
    const target = new Date(item.date); target.setHours(0,0,0,0);
    const days = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    
    const el = document.createElement('div');
    el.className = `list-item`;
    el.style.alignItems = 'center';
    el.innerHTML = `
      <div style="background:color-mix(in srgb, var(--c-countdown) 15%, transparent); color:var(--c-countdown); border-radius:8px; padding:4px 12px; font-weight:bold; font-size:1.2rem; min-width:40px; text-align:center;">
        ${days}
      </div>
      <div class="item-text" style="display:flex; flex-direction:column; justify-content:center;">
        <div style="font-weight:600;">${escapeHtml(item.title)}</div>
        <div style="font-size:0.75rem; color:var(--text-muted);">${target.toLocaleDateString('de-CH')}</div>
      </div>
      <button class="item-delete" onclick="deleteCountdown('${item.id}')"><i data-lucide="x" style="width:16px;height:16px;"></i></button>
    `;
    list.appendChild(el);
  });
  lucide.createIcons();
}

async function addCountdown() {
  const title = document.getElementById('new-cd-title').value.trim();
  const dateStr = document.getElementById('new-cd-date').value;
  if (!title || !dateStr) {
    showToast('Bitte Titel und Datum angeben');
    return;
  }
  
  document.getElementById('new-cd-title').value = '';
  document.getElementById('new-cd-date').value = '';
  
  const tempId = 'temp-' + Date.now();
  countdownsItems.push({ id: tempId, title, date: dateStr, created_at: new Date().toISOString() });
  updateWidgetInGrid('countdown');
  renderCountdownsList();

  const { error } = await db.from('countdowns').insert([{ title, date: dateStr }]);
  if (error) showToast('Fehler beim Speichern');
  else loadCountdownsData();
}

async function deleteCountdown(id) {
  countdownsItems = countdownsItems.filter(i => i.id !== id);
  updateWidgetInGrid('countdown');
  renderCountdownsList();
  await db.from('countdowns').delete().eq('id', id);
}


// ════════════════════════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════════════════════════
let toastTimer = null;
function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2500);
}

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatUserName(rawName) {
  if (!rawName) return 'Unbekannt';
  const name = rawName.toLowerCase();
  if (name === 'timo.lanter') return 'Timo';
  if (name === 'lana.bopp') return 'Lana';
  return name.charAt(0).toUpperCase() + name.slice(1);
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(err => console.warn('SW:', err));
  }
}

window.closeOverlay = closeOverlay;
window.toggleShoppingItem = toggleShoppingItem;
window.deleteShoppingItem = deleteShoppingItem;
window.toggleTodoItem = toggleTodoItem;
window.deleteTodoItem = deleteTodoItem;
window.deleteNoteItem = deleteNoteItem;
window.saveFoodPlan = saveFoodPlan;
window.addMealToShopping = addMealToShopping;
window.saveFoodPlanAndReload = saveFoodPlanAndReload;
window.addChore = addChore;
window.toggleChore = toggleChore;
window.deleteChore = deleteChore;
window.addCountdown = addCountdown;
window.deleteCountdown = deleteCountdown;

window.deleteCountdown = deleteCountdown;
window.addPackage = addPackage;
window.togglePackage = togglePackage;
window.deletePackage = deletePackage;
window.clearDeliveredPackages = clearDeliveredPackages;

// ── Packages ───────────────────────────────────────────────────
async function loadPackagesData() {
  const { data, error } = await db.from('packages').select('*').order('created_at', { ascending: false });
  if (!error && data) {
    packagesItems = data;
    updateWidgetInGrid('packages');
  }
  if (!packagesChan) {
    packagesChan = db.channel('packages_realtime').on('postgres_changes', { event: '*', schema: 'public', table: 'packages' }, payload => {
      if (payload.eventType === 'INSERT' && !packagesItems.find(i => i.id === payload.new.id)) packagesItems.unshift(payload.new);
      if (payload.eventType === 'UPDATE') packagesItems = packagesItems.map(i => i.id === payload.new.id ? payload.new : i);
      if (payload.eventType === 'DELETE') packagesItems = packagesItems.filter(i => i.id !== payload.old.id);
      updateWidgetInGrid('packages');
      if (document.getElementById('overlay-container').classList.contains('open') && document.getElementById('packages-list')) renderPackagesList();
    }).subscribe();
  }
}

function openPackages() {
  openOverlay('Pakete', '#ffcc00', () => `
    <div style="display:flex; flex-direction:column; gap:0;">
      <div class="input-row" style="margin-bottom:8px;">
        <input type="text" id="new-pkg-title" placeholder="Was hast du bestellt? (z.B. Digitec)" />
        <button id="add-pkg-btn" class="btn-compact"><i data-lucide="plus"></i></button>
      </div>
      <div class="input-row">
        <select id="new-pkg-courier" style="flex:1;">
          <option value="post">Schweizerische Post</option>
          <option value="dhl">DHL</option>
          <option value="dpd">DPD</option>
          <option value="planzer">Planzer</option>
          <option value="andere">Andere</option>
        </select>
        <input type="text" id="new-pkg-tracking" placeholder="Tracking-Nummer (optional)" style="flex:2;" />
      </div>
    </div>
    
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; margin-top:24px;">
      <h3 style="color:var(--text); font-size:1.1rem; font-weight:600;">Unterwegs</h3>
      <button style="height:32px; padding:0 12px; border-radius:16px; display:flex; align-items:center; gap:6px; background:var(--bg-card); border:1px solid var(--border); color:var(--text); font-size:0.85rem; cursor:pointer; transition:all 0.2s;" onclick="clearDeliveredPackages()" onmouseover="this.style.background='var(--bg-card-bot)'" onmouseout="this.style.background='var(--bg-card)'">
        <i data-lucide="trash-2" style="width:16px;height:16px;"></i> Erhaltene löschen
      </button>
    </div>
    <div id="packages-list"></div>
  `, () => {
    document.getElementById('add-pkg-btn').addEventListener('click', addPackage);
    document.getElementById('new-pkg-title').addEventListener('keydown', e => { if(e.key === 'Enter') addPackage(); });
    document.getElementById('new-pkg-tracking').addEventListener('keydown', e => { if(e.key === 'Enter') addPackage(); });
    renderPackagesList();
  });
}

function renderPackagesList() {
  const list = document.getElementById('packages-list');
  if (!list) return;

  list.innerHTML = '';
  if (packagesItems.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon"><i data-lucide="package-open"></i></div><h3>Keine Pakete</h3><p>Aktuell bist du wunschlos glücklich.</p></div>`;
    lucide.createIcons();
    return;
  }

  packagesItems.forEach(item => {
    const el = document.createElement('div');
    el.className = 'list-item ' + (item.is_delivered ? 'done' : '');
    
    // Tracking URL Logic
    let trackingUrl = '#';
    let courierName = item.courier.toUpperCase();
    if (item.tracking_number) {
      if (item.courier === 'post') trackingUrl = `https://www.post.ch/swisspost-tracking?formattedParcelCodes=${item.tracking_number}`;
      else if (item.courier === 'dhl') trackingUrl = `https://www.dhl.com/ch-de/home/tracking.html?tracking-id=${item.tracking_number}`;
      else if (item.courier === 'dpd') trackingUrl = `https://tracking.dpd.de/status/de_CH/parcel/${item.tracking_number}`;
      else if (item.courier === 'planzer') trackingUrl = `https://planzer.ch/de/privatkunden/sendungsverfolgung/?tracking=${item.tracking_number}`;
    }

    const trackBtnHtml = item.tracking_number 
      ? `<button onclick="window.open('${trackingUrl}', '_blank')" style="margin-right:12px; color:var(--text); background:var(--bg-card); border:1px solid var(--border); padding:6px 12px; border-radius:8px; display:flex; align-items:center; gap:6px; font-size:0.85rem; cursor:pointer;"><i data-lucide="external-link" style="width:14px;height:14px;"></i> Verfolgen</button>`
      : '';

    el.innerHTML = `
      <div class="list-item-check" onclick="togglePackage(${item.id})">
        <i data-lucide="${item.is_delivered ? 'check-square' : 'square'}"></i>
      </div>
      <div class="list-item-content">
        <div style="font-weight:500; color:var(--text);">${escapeHtml(item.title)}</div>
        <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
          ${courierName} ${item.tracking_number ? `· ${escapeHtml(item.tracking_number)}` : ''} · ${escapeHtml(formatUserName(item.author))}
        </div>
      </div>
      ${trackBtnHtml}
      <button class="item-delete" onclick="deletePackage(${item.id})">
        <i data-lucide="trash-2"></i>
      </button>
    `;
    list.appendChild(el);
  });
  lucide.createIcons();
}

async function addPackage() {
  const titleInput = document.getElementById('new-pkg-title');
  const courierInput = document.getElementById('new-pkg-courier');
  const trackInput = document.getElementById('new-pkg-tracking');
  const title = titleInput.value.trim();
  const courier = courierInput.value;
  const tracking_number = trackInput.value.trim();

  if (!title) return;

  const authorStr = currentUser?.email?.split('@')[0] ?? 'Unbekannt';

  const newItem = { 
    id: Date.now(), 
    title, 
    courier, 
    tracking_number, 
    author: authorStr,
    is_delivered: false, 
    created_at: new Date().toISOString() 
  };
  packagesItems.unshift(newItem);
  titleInput.value = '';
  trackInput.value = '';
  
  updateWidgetInGrid('packages');
  renderPackagesList();

  const { data, error } = await db.from('packages').insert([{ title, courier, tracking_number, author: authorStr, is_delivered: false }]).select();
  if (error) {
    console.error("Fehler beim Speichern:", error);
    showToast("Fehler beim Speichern: " + error.message);
  } else if (data) {
    packagesItems = packagesItems.map(i => i.id === newItem.id ? data[0] : i);
  }
}

async function togglePackage(id) {
  const item = packagesItems.find(i => i.id === id);
  if (!item) return;
  item.is_delivered = !item.is_delivered;
  updateWidgetInGrid('packages');
  renderPackagesList();
  await db.from('packages').update({ is_delivered: item.is_delivered }).eq('id', id);
}

async function deletePackage(id) {
  packagesItems = packagesItems.filter(i => i.id !== id);
  updateWidgetInGrid('packages');
  renderPackagesList();
  await db.from('packages').delete().eq('id', id);
}

async function clearDeliveredPackages() {
  const toDelete = packagesItems.filter(i => i.is_delivered).map(i => i.id);
  packagesItems = packagesItems.filter(i => !i.is_delivered);
  updateWidgetInGrid('packages');
  renderPackagesList();
  if (toDelete.length > 0) {
    await db.from('packages').delete().in('id', toDelete);
  }
}

// ── WISHLIST WIDGET ───────────────────────────────────────────
async function loadWishlistData() {
  const { data, error } = await db.from('wishlist').select('*').order('created_at', { ascending: false });
  if (!error && data) {
    wishlistItems = data;
    updateWidgetInGrid('wishlist');
    if (currentUser) {
      db.channel('public:wishlist').on('postgres_changes', { event: '*', schema: 'public', table: 'wishlist' }, payload => {
        if (payload.eventType === 'INSERT' && !wishlistItems.find(i => i.id === payload.new.id)) wishlistItems.unshift(payload.new);
        if (payload.eventType === 'UPDATE') wishlistItems = wishlistItems.map(i => i.id === payload.new.id ? payload.new : i);
        if (payload.eventType === 'DELETE') wishlistItems = wishlistItems.filter(i => i.id !== payload.old.id);
        updateWidgetInGrid('wishlist');
        if (document.getElementById('overlay-container').classList.contains('open') && document.getElementById('wishlist-list')) renderWishlist();
      }).subscribe();
    }
  }
}

function openWishlist() {
  openOverlay('Anschaffungen', '#ff2d55', () => `
    <div style="display:flex; flex-direction:column; gap:8px;">
      <div class="input-row">
        <input type="url" id="new-wish-url" placeholder="Link zum Produkt einfügen (z.B. ikea.com/...)" />
        <button id="scan-wish-btn" class="btn-compact" style="width:auto; padding:0 12px; font-size:0.85rem; font-weight:600;"><i data-lucide="scan-line"></i> Scannen</button>
      </div>
      <div id="wish-preview-box" style="display:none; background:var(--bg-card); padding:16px; border-radius:12px; border:1px solid var(--border); margin-top:12px;">
        <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.5px;">Gefundenes Produkt (Bitte prüfen)</div>
        
        <img id="wish-preview-img" src="" style="width:100%; height:auto; max-height:220px; object-fit:contain; border-radius:8px; display:none; margin-bottom:12px; background:var(--bg-input);" />
        
        <div class="input-row" style="margin-bottom:8px;">
          <input type="text" id="new-wish-title" placeholder="Titel (z.B. Sofa SÖDERHAMN)" style="width:100%;" />
        </div>
        
        <div style="display:flex; gap:8px;">
          <div class="input-row" style="flex:1;">
            <input type="text" id="new-wish-price" placeholder="Preis (z.B. 499 CHF)" style="width:100%;" />
          </div>
          <div class="input-row" style="flex:1;">
            <input type="text" id="new-wish-color" placeholder="Farbe (optional)" style="width:100%;" />
          </div>
        </div>
        
        <button id="add-wish-btn" style="width:100%; margin-top:16px; height:44px; border-radius:12px; background:#ff2d55; color:white; border:none; font-weight:600; font-size:1rem; cursor:pointer; transition:opacity 0.2s;" onmouseover="this.style.opacity=0.9" onmouseout="this.style.opacity=1">Zur Wunschliste hinzufügen</button>
      </div>
    </div>
    
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; margin-top:24px;">
      <h3 style="color:var(--text); font-size:1.1rem; font-weight:600;">Wünsche</h3>
      <button style="height:32px; padding:0 12px; border-radius:16px; display:flex; align-items:center; gap:6px; background:var(--bg-card); border:1px solid var(--border); color:var(--text); font-size:0.85rem; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='var(--bg-card-bot)'" onmouseout="this.style.background='var(--bg-card)'" onclick="clearPurchasedWishes()">
        <i data-lucide="trash-2" style="width:16px;height:16px;"></i> Gekaufte löschen
      </button>
    </div>
    <div id="wishlist-list"></div>
  `, () => {
    document.getElementById('scan-wish-btn').addEventListener('click', scanWishUrl);
    document.getElementById('new-wish-url').addEventListener('keydown', e => { if(e.key === 'Enter') scanWishUrl(); });
    document.getElementById('add-wish-btn').addEventListener('click', addWishItem);
    renderWishlist();
  });
}

let lastScannedImageUrl = '';

async function scanWishUrl() {
  const urlInput = document.getElementById('new-wish-url');
  const btn = document.getElementById('scan-wish-btn');
  const url = urlInput.value.trim();
  if (!url || !url.startsWith('http')) {
    showToast("Bitte einen gültigen Link inkl. https:// eingeben");
    return;
  }

  btn.innerHTML = '<i data-lucide="loader" class="spin"></i> Lade...';
  lucide.createIcons();
  
  try {
    // Rufe unsere neue Edge Function auf
    const { data, error } = await db.functions.invoke('scrape-link', { body: { url } });
    
    if (error || !data) throw new Error(error?.message || "Fehler beim Scannen");
    
    document.getElementById('wish-preview-box').style.display = 'block';
    document.getElementById('new-wish-title').value = data.title || '';
    document.getElementById('new-wish-price').value = data.price || '';
    
    const imgEl = document.getElementById('wish-preview-img');
    if (data.image) {
      imgEl.src = data.image;
      imgEl.style.display = 'block';
      lastScannedImageUrl = data.image;
    } else {
      imgEl.style.display = 'none';
      lastScannedImageUrl = '';
    }
  } catch (err) {
    console.warn("Edge Function failed, trying client-side fallback...", err);
    try {
      // 1. Fallback: Corsproxy direkt vom iPad (umgeht Datacenter-Blockaden)
      let html = '';
      const corsRes = await fetch(`https://corsproxy.io/?${encodeURIComponent(url)}`);
      if (corsRes.ok) html = await corsRes.text();
      else {
        // 2. Fallback: Allorigins
        const allRes = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(url)}`);
        if (allRes.ok) html = (await allRes.json()).contents || '';
      }

      if (html) {
        const getMeta = (regexList) => {
          for (const regex of regexList) {
            const match = html.match(regex);
            if (match && match[1]) return match[1].replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
          }
          return '';
        };

        let title = getMeta([
          /<meta[^>]*property="og:title"[^>]*content="([^"]+)"/i,
          /<title[^>]*>([^<]+)<\/title>/i
        ]);
        if (title.includes('Galaxus') || title.includes('digitec')) title = title.split('- Galaxus')[0].split('| Galaxus')[0].split('- digitec')[0].trim();

        let image = getMeta([
          /<meta[^>]*property="og:image"[^>]*content="([^"]+)"/i
        ]);

        let priceAmount = getMeta([/<meta[^>]*property="product:price:amount"[^>]*content="([^"]+)"/i]);
        let price = '';
        if (priceAmount) {
          price = `CHF ${priceAmount}`;
        } else {
          const jsonLdPriceMatch = html.match(/"price"\s*:\s*"?(\d+[\.\,]\d{0,2})"?/i);
          if (jsonLdPriceMatch && jsonLdPriceMatch[1]) price = `CHF ${jsonLdPriceMatch[1]}`;
        }

        document.getElementById('wish-preview-box').style.display = 'block';
        document.getElementById('new-wish-title').value = title || '';
        document.getElementById('new-wish-price').value = price || '';
        const imgEl = document.getElementById('wish-preview-img');
        if (image) {
          imgEl.src = image;
          imgEl.style.display = 'block';
          lastScannedImageUrl = image;
        } else {
          imgEl.style.display = 'none';
          lastScannedImageUrl = '';
        }
        return; // Success, skip throwing error
      }
    } catch (fallbackErr) {
      console.warn("Client fallback also failed", fallbackErr);
    }
    
    console.error(err);
    showToast("Scan fehlgeschlagen. Bitte Felder manuell ausfüllen.");
    document.getElementById('wish-preview-box').style.display = 'block';
  } finally {
    btn.innerHTML = '<i data-lucide="scan-line"></i> Scannen';
    lucide.createIcons();
  }
}

async function addWishItem() {
  const url = document.getElementById('new-wish-url').value.trim();
  const title = document.getElementById('new-wish-title').value.trim();
  const price = document.getElementById('new-wish-price').value.trim();
  const color = document.getElementById('new-wish-color').value.trim();
  const authorStr = currentUser?.email?.split('@')[0] ?? 'Unbekannt';

  if (!title) return;

  const newItem = { 
    id: Date.now(), title, url, price, color, image: lastScannedImageUrl, author: authorStr, is_purchased: false, quantity: 1, created_at: new Date().toISOString() 
  };
  wishlistItems.unshift(newItem);
  
  document.getElementById('new-wish-url').value = '';
  document.getElementById('new-wish-title').value = '';
  document.getElementById('new-wish-price').value = '';
  document.getElementById('new-wish-color').value = '';
  document.getElementById('wish-preview-box').style.display = 'none';
  lastScannedImageUrl = '';
  
  updateWidgetInGrid('wishlist');
  renderWishlist();

  const { data, error } = await db.from('wishlist').insert([{ 
    title, url, price, color, image: newItem.image, author: authorStr, is_purchased: false, quantity: 1 
  }]).select();
  
  if (error) {
    console.error("Fehler beim Speichern:", error);
    showToast("Fehler beim Speichern: " + error.message);
  } else if (data) {
    wishlistItems = wishlistItems.map(i => i.id === newItem.id ? data[0] : i);
  }
}

function renderWishlist() {
  const list = document.getElementById('wishlist-list');
  if (!list) return;

  list.innerHTML = '';
  if (wishlistItems.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon"><i data-lucide="shopping-bag"></i></div><h3>Keine Wünsche</h3><p>Zeit für Inspiration.</p></div>`;
    lucide.createIcons();
    return;
  }

  let total = 0;

  wishlistItems.forEach(item => {
    const qty = item.quantity || 1;
    // Total calculation for unpurchased items
    if (!item.is_purchased && item.price) {
      let s = item.price.replace(/['’\s]/g, '');
      s = s.replace(/[^\d\.,]/g, '');
      const lastDot = s.lastIndexOf('.');
      const lastComma = s.lastIndexOf(',');
      const decimalPos = Math.max(lastDot, lastComma);
      
      let val = 0;
      if (decimalPos !== -1 && s.length - decimalPos <= 3) {
        const intPart = s.substring(0, decimalPos).replace(/[\.,]/g, '');
        const decPart = s.substring(decimalPos + 1);
        val = parseFloat(`${intPart}.${decPart}`);
      } else {
        val = parseFloat(s.replace(/[\.,]/g, ''));
      }
      if (!isNaN(val)) total += (val * qty);
    }

    const el = document.createElement('div');
    el.className = 'list-item ' + (item.is_purchased ? 'done' : '');
    
    let infoParts = [];
    if (item.price) infoParts.push(escapeHtml(item.price));
    if (item.color) infoParts.push(`Farbe: ${escapeHtml(item.color)}`);
    infoParts.push(`von ${escapeHtml(formatUserName(item.author))}`);

    el.innerHTML = `
      <div class="list-item-check" onclick="toggleWish(${item.id})">
        <i data-lucide="${item.is_purchased ? 'check-square' : 'square'}"></i>
      </div>
      ${item.image ? `<img src="${escapeHtml(item.image)}" style="width:40px; height:40px; border-radius:8px; object-fit:cover; margin-right:12px; border:1px solid var(--border);" />` : ''}
      <div class="list-item-content">
        <div style="font-weight:500; color:var(--text);">${escapeHtml(item.title)}</div>
        <div style="font-size:0.8rem; color:var(--text-muted); margin-top:2px;">
          ${infoParts.join(' · ')}
        </div>
      </div>
      ${item.url ? `<button onclick="window.open('${escapeHtml(item.url)}', '_blank')" style="margin-right:8px; color:var(--text); background:var(--bg-card); border:1px solid var(--border); padding:6px 10px; border-radius:8px; display:flex; align-items:center; gap:6px; font-size:0.85rem; cursor:pointer;"><i data-lucide="external-link" style="width:14px;height:14px;"></i></button>` : ''}
      
      <div style="display:flex; align-items:center; background:var(--bg-input); border:1px solid var(--border); border-radius:16px; padding:3px 4px; margin-right:12px; gap:6px; box-shadow:0 2px 8px rgba(0,0,0,0.2);">
        <button style="width:26px; height:26px; border-radius:13px; background:var(--bg-card); border:1px solid var(--border); color:var(--text); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='var(--bg-card-bot)'" onmouseout="this.style.background='var(--bg-card)'" onclick="updateWishQuantity(${item.id}, -1)"><i data-lucide="minus" style="width:14px;height:14px;"></i></button>
        <span style="font-size:0.95rem; font-weight:700; width:18px; text-align:center; color:var(--text);">${qty}</span>
        <button style="width:26px; height:26px; border-radius:13px; background:var(--bg-card); border:1px solid var(--border); color:var(--text); display:flex; align-items:center; justify-content:center; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='var(--bg-card-bot)'" onmouseout="this.style.background='var(--bg-card)'" onclick="updateWishQuantity(${item.id}, 1)"><i data-lucide="plus" style="width:14px;height:14px;"></i></button>
      </div>
      
      <button class="item-delete" onclick="deleteWish(${item.id})">
        <i data-lucide="trash-2"></i>
      </button>
    `;
    list.appendChild(el);
  });

  if (wishlistItems.length > 0) {
    const totalEl = document.createElement('div');
    totalEl.style = "margin-top:24px; padding-top:16px; border-top:1px solid var(--border); display:flex; justify-content:space-between; align-items:center;";
    totalEl.innerHTML = `
      <div style="font-weight:600; color:var(--text-muted); text-transform:uppercase; font-size:0.85rem; letter-spacing:0.5px;">Offenes Total</div>
      <div style="font-weight:700; color:var(--text); font-size:1.2rem;">CHF ${total.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
    `;
    list.appendChild(totalEl);
  }

  lucide.createIcons();
}

async function toggleWish(id) {
  const item = wishlistItems.find(i => i.id === id);
  if (!item) return;
  item.is_purchased = !item.is_purchased;
  updateWidgetInGrid('wishlist');
  renderWishlist();
  await db.from('wishlist').update({ is_purchased: item.is_purchased }).eq('id', id);
}

async function updateWishQuantity(id, delta) {
  const item = wishlistItems.find(i => i.id === id);
  if (!item) return;
  const currentQty = item.quantity || 1;
  const newQty = Math.max(1, currentQty + delta);
  if (currentQty === newQty) return;
  item.quantity = newQty;
  updateWidgetInGrid('wishlist');
  renderWishlist();
  await db.from('wishlist').update({ quantity: newQty }).eq('id', id);
}

async function deleteWish(id) {
  wishlistItems = wishlistItems.filter(i => i.id !== id);
  updateWidgetInGrid('wishlist');
  renderWishlist();
  await db.from('wishlist').delete().eq('id', id);
}

async function clearPurchasedWishes() {
  const toDelete = wishlistItems.filter(i => i.is_purchased).map(i => i.id);
  wishlistItems = wishlistItems.filter(i => !i.is_purchased);
  updateWidgetInGrid('wishlist');
  renderWishlist();
  if (toDelete.length > 0) {
    await db.from('wishlist').delete().in('id', toDelete);
  }
}

// ── Screensaver & Blackout ────────────────────────────────────
let screensaverTimer;
let blackoutTimer;
let screensaverInterval;
const SCREENSAVER_MS = 5 * 60 * 1000;  // 5 Minuten
const BLACKOUT_MS = 30 * 60 * 1000;    // 30 Minuten

let screensaverImages = [
  'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=2560&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?q=80&w=2560&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1501854140801-50d01698950b?q=80&w=2560&auto=format&fit=crop'
];

async function loadScreensaverImages() {
  try {
    const { data, error } = await db.storage.from('screensaver').list();
    if (error || !data) return;
    
    // Filtere nur gültige Bilder (keine Ordner-Platzhalter etc.)
    const validFiles = data.filter(f => f.name !== '.emptyFolderPlaceholder' && 
      (f.name.toLowerCase().endsWith('.jpg') || f.name.toLowerCase().endsWith('.jpeg') || 
       f.name.toLowerCase().endsWith('.png') || f.name.toLowerCase().endsWith('.webp') || 
       f.name.toLowerCase().endsWith('.heic'))
    );
    
    if (validFiles.length > 0) {
      const fileNames = validFiles.map(f => f.name);
      
      // Erstelle sichere Links, die nur für eingeloggte User abrufbar sind (10 Jahre gültig, damit das iPad nicht neu laden muss)
      const { data: signedUrls, error: signError } = await db.storage.from('screensaver').createSignedUrls(fileNames, 315360000);
      
      if (!signError && signedUrls) {
        screensaverImages = signedUrls.map(u => u.signedUrl);
        // Zufällige Reihenfolge mischen
        screensaverImages.sort(() => Math.random() - 0.5);
      }
    }
  } catch (err) {
    console.warn("Konnte Screensaver Bilder aus Supabase nicht laden", err);
  }
}


function resetActivityTimers() {
  clearTimeout(screensaverTimer);
  clearTimeout(blackoutTimer);
  clearInterval(screensaverInterval);
  
  const screensaver = document.getElementById('screensaver');
  const blackout = document.getElementById('blackout');
  
  if (screensaver) {
    screensaver.classList.remove('active');
    setTimeout(() => screensaver.innerHTML = '', 500); // Cleanup DOM after fast fade
  }
  if (blackout) blackout.classList.remove('active');

  // Starte die Timer NUR neu, wenn jemand eingeloggt ist!
  if (currentUser) {
    screensaverTimer = setTimeout(startScreensaver, SCREENSAVER_MS);
    blackoutTimer = setTimeout(startBlackout, BLACKOUT_MS);
  }
}

function startScreensaver() {
  let screensaver = document.getElementById('screensaver');
  if (!screensaver) {
    screensaver = document.createElement('div');
    screensaver.id = 'screensaver';
    
    // Verhindert das "Durchklicken" auf Widgets beim Aufwecken
    const wakeUp = (e) => {
      e.preventDefault();
      e.stopPropagation();
      resetActivityTimers();
    };
    screensaver.addEventListener('touchstart', wakeUp, { passive: false });
    screensaver.addEventListener('click', wakeUp);
    
    document.body.appendChild(screensaver);
  }
  
  screensaver.innerHTML = `<div style="color:#fff; z-index:9999; font-size:4rem; font-weight:300; position:absolute; bottom:40px; right:40px; text-shadow:0 4px 16px rgba(0,0,0,0.5);" id="screensaver-time"></div>`;
  screensaver.classList.add('active');
  
  let currentIdx = 0;
  const img1 = document.createElement('img');
  img1.className = 'screensaver-img visible';
  img1.src = screensaverImages[currentIdx];
  screensaver.appendChild(img1);
  
  const timeEl = document.getElementById('screensaver-time');
  const updateTime = () => { if(timeEl) timeEl.textContent = new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }); };
  updateTime();

  screensaverInterval = setInterval(() => {
    updateTime();
    currentIdx = (currentIdx + 1) % screensaverImages.length;
    const nextImg = document.createElement('img');
    nextImg.className = 'screensaver-img';
    nextImg.src = screensaverImages[currentIdx];
    screensaver.appendChild(nextImg);
    
    // Trigger reflow
    void nextImg.offsetWidth;
    nextImg.classList.add('visible');
    
    setTimeout(() => {
      const images = screensaver.querySelectorAll('.screensaver-img');
      if (images.length > 2) images[0].remove();
    }, 3500);
  }, 12000); // Bildwechsel alle 12 Sekunden
}

function startBlackout() {
  clearInterval(screensaverInterval); 
  let blackout = document.getElementById('blackout');
  if (!blackout) {
    blackout = document.createElement('div');
    blackout.id = 'blackout';

    // Verhindert das "Durchklicken" auf Widgets beim Aufwecken
    const wakeUp = (e) => {
      e.preventDefault();
      e.stopPropagation();
      resetActivityTimers();
    };
    blackout.addEventListener('touchstart', wakeUp, { passive: false });
    blackout.addEventListener('click', wakeUp);

    document.body.appendChild(blackout);
  }
  blackout.classList.add('active');
}

// Interaktions-Listener registrieren
['touchstart', 'mousemove', 'click', 'scroll'].forEach(evt => document.addEventListener(evt, resetActivityTimers, { passive: true }));
resetActivityTimers();
