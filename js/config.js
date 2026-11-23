/* ============================================================
   LanaTimoHome – config.js
   Alle festen Einstellungen an einer Stelle
   ============================================================ */

const SUPABASE_URL  = 'https://byzlrafovhigellwnyay.supabase.co';
const SUPABASE_ANON = 'sb_publishable_JOqg8swYCaQPhPmPjLpyJA_yZ9DquTx';

// E-Mail-Präfix → Anzeigename
const PEOPLE = { 'timo.lanter': 'Timo', 'lana.bopp': 'Lana' };
const PEOPLE_NAMES = ['Timo', 'Lana'];

const WEEKDAYS = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
const RECURRENCES = ['Täglich', 'Wöchentlich', 'Monatlich'];

const COURIERS = {
  post:    { label: 'Schweizerische Post', url: tn => `https://www.post.ch/swisspost-tracking?formattedParcelCodes=${tn}` },
  dhl:     { label: 'DHL',     url: tn => `https://www.dhl.com/ch-de/home/tracking.html?tracking-id=${tn}` },
  dpd:     { label: 'DPD',     url: tn => `https://tracking.dpd.de/status/de_CH/parcel/${tn}` },
  planzer: { label: 'Planzer', url: tn => `https://planzer.ch/de/privatkunden/sendungsverfolgung/?tracking=${tn}` },
  andere:  { label: 'Andere',  url: null }
};

const TRAM_STATION = 'Allschwil, Dorf';
const TRAM_LABEL = 'Abfahrten Allschwil Dorf';
// Open-Meteo (kostenlos, ohne Schlüssel): aktuelle Werte, Stundenverlauf und 7-Tage-Vorhersage
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast?latitude=47.5596&longitude=7.5886'
  + '&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,is_day,wind_speed_10m,wind_direction_10m,wind_gusts_10m'
  + '&hourly=temperature_2m,precipitation_probability,weather_code,is_day'
  + '&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,sunrise,sunset,uv_index_max'
  + '&timezone=Europe%2FZurich&forecast_days=7';

const WIDGETS_PER_PAGE = { wide: 9, normal: 8 };  // Querformat-iPad 3×3, sonst 8
const UNDO_MS = 5000;              // So lange kann man Löschen rückgängig machen
const SCREENSAVER_MS = 5 * 60 * 1000;
const BLACKOUT_MS = 30 * 60 * 1000;
