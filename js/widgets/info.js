/* ── Wetter und Platzhalter-Widgets ────────────────────────── */
let currentWeatherData = { temp: '--', icon: 'cloud-sun', desc: 'Laden…', high: '--', low: '--', daily: [], hourly: [], now: null };

registerWidget({
  id: 'calendar', pos: 3, title: 'Kalender', icon: 'calendar', color: 'var(--c-calendar)',
  open: () => openPlaceholderOverlay('Kalender', 'var(--c-calendar)', 'calendar'),
  renderContent: () => miniPlaceholder('calendar-clock', 'Noch nicht bereit'),
  getPreview: () => 'In Entwicklung',
  placeholder: true
});

registerWidget({
  id: 'weather', pos: 4, title: 'Wetter Region Basel', icon: 'cloud-sun', color: 'var(--c-weather)', open: openWeather,
  renderContent: () => `
    <div class="mini-hero mini-hero-left">
      <div class="hero-number hero-weather">${icon(currentWeatherData.icon, 'lg')}<span>${currentWeatherData.temp}°</span></div>
      <div class="hero-caption">H: ${currentWeatherData.high}° &nbsp;·&nbsp; T: ${currentWeatherData.low}°</div>
      ${currentWeatherData.now ? `
      <div class="weather-chips">
        <span title="Gefühlt">${icon('thermometer', 'xs')}${currentWeatherData.now.feels}°</span>
        <span title="Regen heute">${icon('umbrella', 'xs')}${currentWeatherData.daily[0]?.rain ?? 0}%</span>
        <span title="Wind">${icon('wind', 'xs')}${currentWeatherData.now.wind} km/h</span>
      </div>` : ''}
    </div>`,
  getPreview: () => currentWeatherData.now
    ? `${currentWeatherData.temp}° · ${currentWeatherData.desc}`
    : currentWeatherData.desc
});

registerWidget({
  id: 'smarthome', pos: 8, title: 'Smart Home', icon: 'house', color: 'var(--c-home)',
  open: () => openPlaceholderOverlay('Smart Home', 'var(--c-home)', 'house'),
  renderContent: () => miniPlaceholder('plug', 'Offline'),
  getPreview: () => 'In Entwicklung',
  placeholder: true
});

registerWidget({
  id: 'trash', pos: 10, title: 'Abfall', icon: 'trash-2', color: 'var(--c-trash)',
  open: () => openPlaceholderOverlay('Abfallkalender', 'var(--c-trash)', 'trash-2'),
  renderContent: () => miniPlaceholder('calendar-days', 'Kein Kalender'),
  getPreview: () => 'In Entwicklung',
  placeholder: true
});

registerWidget({
  id: 'wifi', pos: 11, title: 'WLAN', icon: 'wifi', color: 'var(--c-wifi)', open: openWifi,
  renderContent: () => miniPlaceholder('qr-code', 'Gast-Zugang'),
  getPreview: () => 'Zum Scannen tippen',
  placeholder: true
});

function openPlaceholderOverlay(title, color, iconName) {
  openOverlay({
    key: 'placeholder', title, color,
    render: () => emptyStateHtml(iconName, title, 'Diese Ansicht wird bald entwickelt. Freu dich drauf!')
  });
}

function openWifi() {
  openOverlay({
    key: 'wifi', title: 'WLAN Gastzugang', color: 'var(--c-wifi)',
    render: () => `
      <div class="wifi-empty">
        <h3>Noch kein WLAN eingerichtet</h3>
        <p>Sobald ihr euer Internet habt, können wir hier das Netzwerk eintragen. Besucher müssen dann nur noch den Code scannen!</p>
        <div class="wifi-qr">${icon('qr-code', 'xl')}</div>
      </div>`
  });
}

// ── Wetter (Open-Meteo) ──────────────────────────────────────
function getWeatherIconAndDesc(code, isDay = true) {
  let icon = 'cloud', desc = 'Bewölkt';
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

// Hilfen für die Detailansicht
const WIND_DIRS = ['N', 'NO', 'O', 'SO', 'S', 'SW', 'W', 'NW'];
function windDirection(deg) { return WIND_DIRS[Math.round(((deg % 360) + 360) % 360 / 45) % 8]; }
function uvLabel(uv) {
  if (uv < 3) return 'Niedrig';
  if (uv < 6) return 'Mässig';
  if (uv < 8) return 'Hoch';
  if (uv < 11) return 'Sehr hoch';
  return 'Extrem';
}
// Open-Meteo liefert Ortszeit ohne Zeitzone ("2026-11-23T07:45"), darum direkt die Uhrzeit herausschneiden
function isoTime(str) { return String(str || '').slice(11, 16) || '--:--'; }
function formatMm(mm) { return mm >= 10 ? Math.round(mm) : (Math.round(mm * 10) / 10).toLocaleString('de-CH'); }

async function loadWeather() {
  try {
    const res = await fetch(WEATHER_URL);
    const data = await res.json();
    if (!data?.current || !data.daily) return;
    const cur = data.current;
    const { icon: ic, desc } = getWeatherIconAndDesc(cur.weather_code, cur.is_day === 1);

    // Stundenverlauf ab der aktuellen Stunde, 24 Stunden
    const hourKey = String(cur.time).slice(0, 13);
    const hourly = data.hourly?.time ? data.hourly.time.map((t, i) => ({
      time: t,
      temp: Math.round(data.hourly.temperature_2m[i]),
      rain: data.hourly.precipitation_probability[i] ?? 0,
      code: data.hourly.weather_code[i],
      isDay: data.hourly.is_day[i] === 1
    })) : [];
    const startIdx = Math.max(0, hourly.findIndex(h => h.time.slice(0, 13) === hourKey));

    currentWeatherData = {
      temp: Math.round(cur.temperature_2m),
      high: Math.round(data.daily.temperature_2m_max[0]),
      low: Math.round(data.daily.temperature_2m_min[0]),
      icon: ic,
      desc,
      now: {
        feels: Math.round(cur.apparent_temperature),
        humidity: Math.round(cur.relative_humidity_2m),
        wind: Math.round(cur.wind_speed_10m),
        gusts: Math.round(cur.wind_gusts_10m),
        windDir: windDirection(cur.wind_direction_10m),
        precipitation: cur.precipitation
      },
      hourly: hourly.slice(startIdx, startIdx + 24),
      daily: data.daily.time.map((t, i) => ({
        date: parseIsoDate(t),
        max: Math.round(data.daily.temperature_2m_max[i]),
        min: Math.round(data.daily.temperature_2m_min[i]),
        rain: data.daily.precipitation_probability_max[i] ?? 0,
        rainSum: data.daily.precipitation_sum?.[i] ?? 0,
        sunrise: isoTime(data.daily.sunrise?.[i]),
        sunset: isoTime(data.daily.sunset?.[i]),
        uv: data.daily.uv_index_max?.[i] ?? 0,
        code: data.daily.weather_code[i]
      }))
    };

    const hw = $('#header-weather');
    if (hw) { hw.innerHTML = `${icon(ic, 'sm')}<span>${currentWeatherData.temp}°C</span>`; refreshIcons(); }

    const ambient = $('#ambient-bg');
    if (ambient) {
      ambient.className = 'ambient-bg';
      if (ic.includes('sun')) ambient.classList.add('weather-sun');
      else if (ic.includes('rain')) ambient.classList.add('weather-rain');
      else if (ic.includes('cloud')) ambient.classList.add('weather-cloud');
      else if (ic.includes('moon')) ambient.classList.add('weather-night');
    }

    updateWidget('weather');
    if (currentOverlay === 'weather') openWeather();
  } catch (e) {
    console.error('Wetter-Fehler', e);
  }
}

function weatherStatHtml(iconName, label, value, sub = '') {
  return `
    <div class="card weather-stat">
      <div class="card-kicker">${icon(iconName, 'xs')}${label}</div>
      <div class="weather-stat-value">${value}</div>
      ${sub ? `<div class="weather-stat-sub">${sub}</div>` : ''}
    </div>`;
}

function openWeather() {
  openOverlay({
    key: 'weather', title: 'Wetter Region Basel', color: 'var(--c-weather)',
    render: () => {
      const w = currentWeatherData;
      if (!w.daily.length || !w.now) return emptyStateHtml('cloud-sun', 'Lade Wetterdaten…');
      const today = w.daily[0];
      const weekMin = Math.min(...w.daily.slice(0, 7).map(d => d.min));
      const weekMax = Math.max(...w.daily.slice(0, 7).map(d => d.max));
      const span = Math.max(1, weekMax - weekMin);

      const nowHtml = `
        <div class="card weather-now">
          <div class="weather-now-main">
            ${icon(w.icon, 'lg', 'weather-icon')}
            <span class="weather-now-temp">${w.temp}°</span>
          </div>
          <div class="weather-now-info">
            <div class="weather-now-desc">${w.desc}</div>
            <div class="muted">Gefühlt ${w.now.feels}° &nbsp;·&nbsp; H: ${w.high}° &nbsp;·&nbsp; T: ${w.low}°</div>
          </div>
        </div>`;

      const statsHtml = `
        <div class="weather-stats">
          ${weatherStatHtml('umbrella', 'Regen heute', `${today.rain}%`, today.rainSum > 0 ? `${formatMm(today.rainSum)} mm erwartet` : 'Kein Niederschlag erwartet')}
          ${weatherStatHtml('wind', 'Wind', `${w.now.wind} <small>km/h</small>`, `aus ${w.now.windDir} · Böen ${w.now.gusts} km/h`)}
          ${weatherStatHtml('droplet', 'Luftfeuchte', `${w.now.humidity}%`)}
          ${weatherStatHtml('sun', 'UV-Index', Math.round(today.uv), uvLabel(today.uv))}
          ${weatherStatHtml('sunrise', 'Sonnenaufgang', today.sunrise)}
          ${weatherStatHtml('sunset', 'Sonnenuntergang', today.sunset)}
        </div>`;

      const hourlyHtml = w.hourly.length ? `
        <div class="group-title">Nächste 24 Stunden</div>
        <div class="card weather-hours">${w.hourly.map((h, i) => {
          const { icon: hic } = getWeatherIconAndDesc(h.code, h.isDay);
          return `
            <div class="weather-hour">
              <span class="weather-hour-time">${i === 0 ? 'Jetzt' : isoTime(h.time).slice(0, 2)}</span>
              ${icon(hic, 'sm', 'weather-icon')}
              <span class="weather-hour-rain">${h.rain >= 20 ? `${h.rain}%` : ''}</span>
              <strong>${h.temp}°</strong>
            </div>`;
        }).join('')}</div>` : '';

      const dailyHtml = `
        <div class="group-title">7 Tage</div>
        <div class="list weather-list">${w.daily.slice(0, 7).map((day, index) => {
          const { icon: ic } = getWeatherIconAndDesc(day.code, true);
          const name = index === 0 ? 'Heute' : day.date.toLocaleDateString('de-CH', { weekday: 'short' });
          const left = ((day.min - weekMin) / span) * 100;
          const width = Math.max(4, ((day.max - day.min) / span) * 100);
          return `
          <div class="list-item weather-row">
            <span class="weather-day">${name}</span>
            ${icon(ic, 'md', 'weather-icon')}
            <span class="weather-rain">${day.rain > 10 ? `${icon('droplets', 'xs')}${day.rain}%` : ''}</span>
            <span class="weather-temps"><span class="muted">${day.min}°</span>
              <svg class="weather-range" viewBox="0 0 100 6" preserveAspectRatio="none" aria-hidden="true"><rect class="weather-range-track" x="0" y="0" width="100" height="6" rx="3" /><rect class="weather-range-bar" x="${left.toFixed(1)}" y="0" width="${width.toFixed(1)}" height="6" rx="3" /></svg>
              <strong>${day.max}°</strong></span>
          </div>`;
        }).join('')}</div>`;

      return nowHtml + statsHtml + hourlyHtml + dailyHtml;
    }
  });
}
