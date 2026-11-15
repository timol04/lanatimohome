/* ── Wetter und Platzhalter-Widgets ────────────────────────── */
let currentWeatherData = { temp: '--', icon: 'cloud-sun', desc: 'Laden…', high: '--', low: '--', daily: [] };

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
    </div>`,
  getPreview: () => currentWeatherData.desc
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

async function loadWeather() {
  try {
    const res = await fetch(WEATHER_URL);
    const data = await res.json();
    if (!data?.current_weather || !data.daily) return;
    const cw = data.current_weather;
    const { icon: ic, desc } = getWeatherIconAndDesc(cw.weathercode, cw.is_day === 1);
    currentWeatherData = {
      temp: Math.round(cw.temperature),
      high: Math.round(data.daily.temperature_2m_max[0]),
      low: Math.round(data.daily.temperature_2m_min[0]),
      icon: ic,
      desc,
      daily: data.daily.time.map((t, i) => ({
        date: parseIsoDate(t),
        max: Math.round(data.daily.temperature_2m_max[i]),
        min: Math.round(data.daily.temperature_2m_min[i]),
        rain: data.daily.precipitation_probability_max[i],
        code: data.daily.weathercode[i]
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

function openWeather() {
  openOverlay({
    key: 'weather', title: '7-Tage Wetter Region Basel', color: 'var(--c-weather)',
    render: () => {
      if (!currentWeatherData.daily.length) return emptyStateHtml('cloud-sun', 'Lade Wetterdaten…');
      return `<div class="list weather-list">${currentWeatherData.daily.slice(0, 7).map((day, index) => {
        const { icon: ic } = getWeatherIconAndDesc(day.code, true);
        const name = index === 0 ? 'Heute' : day.date.toLocaleDateString('de-CH', { weekday: 'short' });
        return `
          <div class="list-item weather-row">
            <span class="weather-day">${name}</span>
            ${icon(ic, 'md', 'weather-icon')}
            <span class="weather-rain">${day.rain > 10 ? `${icon('droplets', 'xs')}${day.rain}%` : ''}</span>
            <span class="weather-temps"><span class="muted">${day.min}°</span><strong>${day.max}°</strong></span>
          </div>`;
      }).join('')}</div>`;
    }
  });
}
