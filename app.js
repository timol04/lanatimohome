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
let currentCarouselPage = 0;
let clockInterval = null;
let foodChan = null;
let choresChan = null;
let countdownsChan = null;
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
      const c = shoppingItems.filter(i => !i.is_done).length;
      return c === 0 ? 'Alles erledigt' : `${c} offene Artikel`;
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
    id: 'weather', title: 'Wetter', icon: 'cloud-sun', color: 'var(--c-weather)', action: openWeather,
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
    renderContent: () => {
      if(notesItems.length === 0) return `<div class="mini-placeholder"><i data-lucide="message-square"></i>Keine Notizen</div>`;
      return `<div style="white-space:normal;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;color:var(--text);font-size:0.85rem;">${escapeHtml(notesItems[0].text)}</div>`;
    },
    getPreview: () => notesItems.length > 0 ? `Von ${escapeHtml(formatUserName(notesItems[0].author))}` : 'Leer'
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
  }
];

// ── Bootstrap ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const { data: { session } } = await db.auth.getSession();
  currentUser = session?.user ?? null;

  if (currentUser) {
    showDashboard();
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
  
  loadTramDepartures();
  // Jede Minute die Trams aktualisieren
  setInterval(loadTramDepartures, 60000);

  loadWeather();
  // Wetter alle 30 Minuten aktualisieren
  setInterval(loadWeather, 30 * 60000);

  lucide.createIcons();
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
    const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=47.55&longitude=7.53&current_weather=true&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=Europe%2FZurich');
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

function openWeather() {
  openOverlay('7-Tage Wetter', 'var(--c-weather)', () => {
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
      <button id="clear-done-btn" class="btn-text" style="display:none;"><i data-lucide="trash-2" style="width:14px;height:14px;"></i> Erledigte löschen</button>
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
        <div class="shopping-menu-card">
          <div class="menu-title"><i data-lucide="chef-hat" style="width:16px;height:16px;"></i> ${escapeHtml(title)}</div>
          <div class="menu-ingredients">${escapeHtml(ingredients)}</div>
        </div>
      `;
    } else {
      itemContentHtml = `<div class="item-text">${escapeHtml(item.text)}</div>`;
    }

    el.innerHTML = `
      <div class="item-check" onclick="toggleShoppingItem('${item.id}')"><i data-lucide="check" style="width:16px;height:16px;"></i></div>
      ${itemContentHtml}
      <button class="item-delete" onclick="deleteShoppingItem('${item.id}')"><i data-lucide="x" style="width:16px;height:16px;"></i></button>
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
  shoppingItems.push({ id: tempId, text, is_done: false, created_at: new Date().toISOString() });
  updateWidgetInGrid('shopping');
  renderShoppingList();

  const { error } = await db.from('shopping_items').insert([{ text, is_done: false }]);
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
      <button id="clear-done-todo-btn" class="btn-text" style="display:none;"><i data-lucide="trash-2" style="width:14px;height:14px;"></i> Erledigte löschen</button>
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
      <button id="clear-done-chore-btn" class="btn-text" style="display:none;"><i data-lucide="trash-2" style="width:14px;height:14px;"></i> Erledigte löschen</button>
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
