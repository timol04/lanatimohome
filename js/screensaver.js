/* ============================================================
   LanaTimoHome – screensaver.js
   Nach 5 Min. Fotos, nach 30 Min. schwarz. Antippen weckt auf.
   ============================================================ */

let screensaverTimer, blackoutTimer, screensaverInterval;

let screensaverImages = [
  'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=2560&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1472214103451-9374bd1c798e?q=80&w=2560&auto=format&fit=crop',
  'https://images.unsplash.com/photo-1501854140801-50d01698950b?q=80&w=2560&auto=format&fit=crop'
];

async function loadScreensaverImages() {
  try {
    const { data, error } = await db.storage.from('screensaver').list();
    if (error || !data) return;
    const files = data.map(f => f.name).filter(n => /\.(jpe?g|png|webp|heic)$/i.test(n));
    if (!files.length) return;
    // Signierte Links, nur für eingeloggte Haushalts-Mitglieder (7 Tage gültig, täglich erneuert)
    const { data: signed, error: signError } = await db.storage.from('screensaver').createSignedUrls(files, 7 * 24 * 3600);
    if (signError || !signed) return;
    screensaverImages = signed.map(u => u.signedUrl).filter(Boolean);
    // Zufällige Reihenfolge (Fisher-Yates)
    for (let i = screensaverImages.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [screensaverImages[i], screensaverImages[j]] = [screensaverImages[j], screensaverImages[i]];
    }
  } catch (err) {
    console.warn('Screensaver-Bilder konnten nicht geladen werden', err);
  }
}

function isScreensaverActive() {
  return !!(document.getElementById('screensaver')?.classList.contains('active') || document.getElementById('blackout')?.classList.contains('active'));
}

function resetActivityTimers() {
  clearTimeout(screensaverTimer);
  clearTimeout(blackoutTimer);

  const wasActive = isScreensaverActive();
  if (wasActive) {
    clearInterval(screensaverInterval);
    const ss = document.getElementById('screensaver');
    if (ss) {
      ss.classList.remove('active');
      setTimeout(() => { if (!ss.classList.contains('active')) ss.innerHTML = ''; }, 500);
    }
    document.getElementById('blackout')?.classList.remove('active');
    // Nach dem Aufwachen: Daten und Abfahrten auffrischen
    if (typeof resync === 'function') resync(true);
  }

  // Timer nur, wenn jemand eingeloggt ist
  if (currentUser) {
    screensaverTimer = setTimeout(startScreensaver, SCREENSAVER_MS);
    blackoutTimer = setTimeout(startBlackout, BLACKOUT_MS);
  }
}

function makeWakeLayer(id) {
  const el = document.createElement('div');
  el.id = id;
  // Verhindert das "Durchklicken" auf Widgets beim Aufwecken
  const wake = e => { e.preventDefault(); e.stopPropagation(); resetActivityTimers(); };
  el.addEventListener('touchstart', wake, { passive: false });
  el.addEventListener('click', wake);
  document.body.appendChild(el);
  return el;
}

function startScreensaver() {
  if (!currentUser) return;
  const ss = document.getElementById('screensaver') || makeWakeLayer('screensaver');
  clearInterval(screensaverInterval);
  ss.innerHTML = '<div id="screensaver-time" class="screensaver-time"></div>';
  ss.classList.add('active');

  let idx = 0;
  const addImage = () => {
    const img = document.createElement('img');
    img.className = 'screensaver-img';
    img.alt = '';
    img.src = screensaverImages[idx];
    img.onload = () => img.classList.add('visible');
    ss.appendChild(img);
    setTimeout(() => {
      const imgs = ss.querySelectorAll('.screensaver-img');
      if (imgs.length > 2) imgs[0].remove();
    }, 3500);
  };
  const timeEl = document.getElementById('screensaver-time');
  const updateTime = () => { timeEl.textContent = new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }); };
  updateTime();
  addImage();

  screensaverInterval = setInterval(() => {
    updateTime();
    idx = (idx + 1) % screensaverImages.length;
    addImage();
  }, 12000); // Bildwechsel alle 12 Sekunden
}

function startBlackout() {
  clearInterval(screensaverInterval);
  (document.getElementById('blackout') || makeWakeLayer('blackout')).classList.add('active');
}

// Aktivität erkennen (Mausbewegung gedrosselt, damit nicht bei jedem Pixel neu gestartet wird)
let lastActivity = 0;
function onActivity(e) {
  if (e.type === 'mousemove') {
    const now = Date.now();
    if (now - lastActivity < 1000 && !isScreensaverActive()) return;
    lastActivity = now;
  }
  resetActivityTimers();
}
['touchstart', 'mousemove', 'click', 'keydown', 'wheel'].forEach(evt => document.addEventListener(evt, onActivity, { passive: true, capture: true }));
