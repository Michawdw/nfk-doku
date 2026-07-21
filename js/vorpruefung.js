/* vorpruefung.js – Baustellen-Vorprüfung (Pflicht-Checkliste vor Arbeitsbeginn).
   7 feste Prüfpunkte, je Punkt „i.O." / „nicht i.O.". Bei „nicht i.O." Freitext +
   beliebig viele Fotos (mit Bildunterschrift). Erscheint einmalig nach dem Anlegen
   eines Auftrags; solange ein Punkt unbeantwortet ist, ist keine weitere Bearbeitung
   möglich (Gating in app.js über isIncomplete/flagMissing). Nach Abschluss read-only.

   Daten liegen am Job-Objekt (kein DB-Schema-Bump):
     job.vorpruefung = { done, completedAt, items: { p1: {status:'io'|'nio'|null, text}, ... } }
   Fotos liegen im photos-Store mit reserviertem nodeKey '__vorpruefung__<pid>'
   (Feld kind:'vorpruefung', caption) – dadurch tauchen sie nie in der Bilddoku auf.
*/
const Vorpruefung = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);

  const NS = '__vorpruefung__';
  const POINTS = [
    { id: 'p1', titel: 'Kontrolle Trassenplan / Kabelwege / Gitterrinne oberhalb NWS' },
    { id: 'p2', titel: 'Transport Einbringung der NWS möglich' },
    { id: 'p3', titel: 'Brandschott noch nicht geschlossen' },
    { id: 'p4', titel: 'OWA Raster und Decke noch offen für die Verkabelung' },
    { id: 'p5', titel: 'Kontrolle Ladenlayout FK-Fresh oder FK 2025' },
    { id: 'p6', titel: 'Übergabe Sage glass und Teile buchen' },
    { id: 'p7', titel: 'Kleinverteiler Seriennummer buchen' },
  ];

  const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const escAttr = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let activeUrls = [];        // Object-URLs der Thumbnails (für Revoke)
  let currentPointId = null;  // Punkt, für den gerade ein Foto ausgewählt wird
  let cameraInput = null, galleryInput = null;
  let saveTimer = null;
  let lastRender = Promise.resolve();

  const nodeKeyFor = (pid) => NS + pid;

  // Legt das vorpruefung-Objekt am Job an, falls es fehlt, und füllt alle Punkte.
  function ensureModel(job) {
    if (!job.vorpruefung) job.vorpruefung = { done: false, completedAt: null, items: {} };
    const v = job.vorpruefung;
    if (!v.items) v.items = {};
    for (const p of POINTS) if (!v.items[p.id]) v.items[p.id] = { status: null, text: '' };
    return v;
  }

  // Ist die Vorprüfung unvollständig (mind. ein Punkt ohne Antwort)? Steuert das Gating.
  function isIncomplete(job) {
    if (!job || !job.vorpruefung || !job.vorpruefung.items) return true;
    return POINTS.some((p) => {
      const it = job.vorpruefung.items[p.id];
      return !it || (it.status !== 'io' && it.status !== 'nio');
    });
  }

  function answeredCount(job) {
    if (!job || !job.vorpruefung || !job.vorpruefung.items) return 0;
    return POINTS.filter((p) => {
      const it = job.vorpruefung.items[p.id];
      return it && (it.status === 'io' || it.status === 'nio');
    }).length;
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { App.saveCurrentJob(); }, 500);
  }

  // ---- versteckte File-Inputs (Kamera / Galerie) ----
  function setupInputs() {
    if (cameraInput) return;
    cameraInput = document.createElement('input');
    cameraInput.type = 'file'; cameraInput.accept = 'image/*';
    cameraInput.capture = 'environment'; cameraInput.hidden = true;
    galleryInput = document.createElement('input');
    galleryInput.type = 'file'; galleryInput.accept = 'image/*';
    galleryInput.multiple = true; galleryInput.hidden = true;
    cameraInput.addEventListener('change', onPhotosSelected);
    galleryInput.addEventListener('change', onPhotosSelected);
    document.body.appendChild(cameraInput);
    document.body.appendChild(galleryInput);
  }

  async function onPhotosSelected(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length || !currentPointId) return;
    const job = App.getCurrentJob();
    const pid = currentPointId;
    const nodeKey = nodeKeyFor(pid);
    const deviceId = await DB.getDeviceId();
    for (const file of files) {
      try {
        const blob = await Photos.compress(file);
        const local = await DB.countPhotos(job.id, nodeKey);
        await DB.addPhoto({
          jobId: job.id, nodeKey, seq: local + 1, blob,
          createdAt: Date.now(), caption: '', kind: 'vorpruefung',
          srcId: deviceId + ':' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        });
      } catch (err) {
        console.error(err);
        App.toast('Foto konnte nicht hinzugefügt werden: ' + (err.message || err));
      }
    }
    await renderList();
  }

  // ---- Rendering ----
  function enter() { lastRender = renderList(); return lastRender; }

  async function renderList() {
    const job = App.getCurrentJob();
    const list = $('#vpList');
    const intro = $('#vpIntro');
    if (!job || !list) return;
    setupInputs();
    const v = ensureModel(job);
    const ro = !!v.done;

    // Intro / Kopf
    const name = job.name || (job.header && job.header.filiale) || 'Auftrag';
    if (intro) {
      intro.innerHTML = ro
        ? `<p class="hint">Vorprüfung für <b>${escHtml(name)}</b> – <b>abgeschlossen</b>${
            v.completedAt ? ' am ' + new Date(v.completedAt).toLocaleString('de-DE') : ''
          }. Die Angaben sind nicht mehr änderbar; das Protokoll kann erneut versendet werden.</p>`
        : `<p class="hint">Pflicht-Vorprüfung für <b>${escHtml(name)}</b>. Bitte jeden Punkt mit
            <b>i.O.</b> oder <b>nicht i.O.</b> beantworten. Erst danach sind Bilddokumentation und
            Bautagebuch verfügbar. Bei „nicht i.O." Beschreibung und Fotos der Behinderung ergänzen.</p>`;
    }

    // Liste neu aufbauen
    activeUrls.forEach((u) => URL.revokeObjectURL(u));
    activeUrls = [];
    list.innerHTML = '';

    for (let i = 0; i < POINTS.length; i++) {
      const p = POINTS[i];
      const it = v.items[p.id];
      const card = document.createElement('div');
      card.className = 'vp-item';
      card.dataset.pid = p.id;
      const isIo = it.status === 'io';
      const isNio = it.status === 'nio';
      card.innerHTML = `
        <div class="vp-q">${i + 1}. ${escHtml(p.titel)}</div>
        <div class="vp-seg" role="group" aria-label="Status">
          <button type="button" class="vp-io${isIo ? ' active' : ''}"${ro ? ' disabled' : ''}>i.O.</button>
          <button type="button" class="vp-nio${isNio ? ' active' : ''}"${ro ? ' disabled' : ''}>nicht i.O.</button>
        </div>
        <div class="vp-detail"${isNio ? '' : ' hidden'}>
          <label class="vp-textlabel">Beschreibung der Behinderung
            <textarea class="vp-text" rows="3"${ro ? ' disabled' : ''}>${escHtml(it.text || '')}</textarea>
          </label>
          <div class="vp-photos"></div>
          ${ro ? '' : `<div class="toolrow vp-photobtns">
            <button type="button" class="btn ghost vp-cam">📷 Foto</button>
            <button type="button" class="btn ghost vp-gal">🖼 Galerie</button>
          </div>`}
        </div>`;

      // Status-Umschalter
      const ioBtn = card.querySelector('.vp-io');
      const nioBtn = card.querySelector('.vp-nio');
      if (!ro) {
        ioBtn.onclick = async () => { it.status = 'io'; card.classList.remove('missing'); await App.saveCurrentJob(); await renderList(); };
        nioBtn.onclick = async () => { it.status = 'nio'; card.classList.remove('missing'); await App.saveCurrentJob(); await renderList(); };
      }

      // Freitext
      const ta = card.querySelector('.vp-text');
      if (ta && !ro) ta.oninput = () => { it.text = ta.value; scheduleSave(); };

      // Foto-Buttons
      if (!ro) {
        const cam = card.querySelector('.vp-cam');
        const gal = card.querySelector('.vp-gal');
        if (cam) cam.onclick = () => { currentPointId = p.id; cameraInput.click(); };
        if (gal) gal.onclick = () => { currentPointId = p.id; galleryInput.click(); };
      }

      list.appendChild(card);
      if (isNio) await renderThumbs(card, job, p.id, ro);
    }

    // Footer
    const completeBtn = $('#vpCompleteBtn');
    if (completeBtn) completeBtn.hidden = ro;
    const doneNote = $('#vpDoneNote');
    if (doneNote) doneNote.hidden = !ro;
  }

  async function renderThumbs(card, job, pid, ro) {
    const cont = card.querySelector('.vp-photos');
    if (!cont) return;
    const photos = await DB.getPhotos(job.id, nodeKeyFor(pid));
    cont.innerHTML = '';
    for (const ph of photos) {
      const url = URL.createObjectURL(ph.blob);
      activeUrls.push(url);
      const w = document.createElement('div');
      w.className = 'vp-thumb';
      w.innerHTML = `
        <img src="${url}" alt="" loading="lazy" />
        <input class="vp-cap" type="text" placeholder="Bildunterschrift"
          value="${escAttr(ph.caption || '')}"${ro ? ' disabled' : ''} autocomplete="off" />
        ${ro ? '' : '<button type="button" class="vp-del" title="Foto entfernen">✕</button>'}`;
      const cap = w.querySelector('.vp-cap');
      if (cap && !ro) cap.onchange = async () => { ph.caption = cap.value; await DB.updatePhoto(ph); };
      const del = w.querySelector('.vp-del');
      if (del) del.onclick = async () => {
        const ok = await App.openConfirm('Foto entfernen?', '<p>Dieses Behinderungs-Foto wirklich entfernen?</p>', 'Entfernen', true);
        if (!ok) return;
        await DB.deletePhotoById(ph.id);
        await renderList();
      };
      cont.appendChild(w);
    }
  }

  // Markiert offene Punkte rot und springt zum ersten offenen Punkt.
  async function flagMissing() {
    await lastRender;
    const job = App.getCurrentJob();
    if (!job) return;
    const v = ensureModel(job);
    let first = null;
    for (const p of POINTS) {
      const it = v.items[p.id];
      const missing = !it || (it.status !== 'io' && it.status !== 'nio');
      const card = document.querySelector(`.vp-item[data-pid="${p.id}"]`);
      if (card) card.classList.toggle('missing', missing);
      if (missing && !first) first = card;
    }
    if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  async function complete() {
    const job = App.getCurrentJob();
    if (!job) return;
    ensureModel(job);
    if (isIncomplete(job)) {
      await flagMissing();
      App.toast('Bitte alle Punkte beantworten.');
      return;
    }
    job.vorpruefung.done = true;
    job.vorpruefung.completedAt = Date.now();
    await App.saveCurrentJob();
    await renderList();
    App.toast('Vorprüfung abgeschlossen');
  }

  async function makeProtokoll() {
    const job = App.getCurrentJob();
    if (!job) return;
    const v = ensureModel(job);
    if (isIncomplete(job)) {
      await flagMissing();
      App.toast('Bitte zuerst alle Punkte beantworten.');
      return;
    }
    const h = job.header || {};
    const points = [];
    for (const p of POINTS) {
      const it = v.items[p.id] || {};
      const nio = it.status === 'nio';
      const photos = [];
      if (nio) {
        const recs = await DB.getPhotos(job.id, nodeKeyFor(p.id));
        for (const r of recs) photos.push({ blob: r.blob, caption: r.caption || '' });
      }
      points.push({ titel: p.titel, status: nio ? 'nio' : 'io', text: it.text || '', photos });
    }
    const model = {
      filiale: h.filiale || '', ort: h.ort || '', datum: h.datum || '',
      beauftragung: h.beauftragung || 'NFK Vollverkabelung',
      auftragsname: job.name || '', points,
    };
    App.toast('Erzeuge Protokoll…');
    try {
      const name = await Protokoll.exportFile(model);
      App.toast('Protokoll erstellt: ' + name);
    } catch (err) {
      console.error(err);
      App.toast('Protokoll fehlgeschlagen: ' + (err.message || err));
    }
  }

  // Footer-Buttons einmalig binden.
  function init() {
    setupInputs();
    const completeBtn = $('#vpCompleteBtn');
    const protoBtn = $('#vpProtokollBtn');
    if (completeBtn) completeBtn.onclick = complete;
    if (protoBtn) protoBtn.onclick = makeProtokoll;
  }

  return { POINTS, init, enter, isIncomplete, answeredCount, flagMissing };
})();
