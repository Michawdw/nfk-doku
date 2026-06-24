/* app.js – Bootstrap, Navigation, Projektkopf, Bilddoku-Tree, Bautagebuch-Formular,
   sowie gemeinsame Helfer (Modal, Toast, Datei-Weitergabe). */
const App = (() => {
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  let project = null;
  let activeUrls = [];      // Object-URLs der Thumbnails (für Revoke)
  let currentNode = null;   // Knoten für die nächste Foto-Auswahl

  // ---------------------------------------------------------------- Navigation
  const viewTitles = {
    'view-start': 'NFK Doku',
    'view-bilddoku': 'Bilddokumentation',
    'view-bautagebuch': 'Bautagebuch',
  };

  function show(viewId) {
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === viewId));
    $('#topTitle').textContent = viewTitles[viewId] || 'NFK Doku';
    $('#backBtn').hidden = (viewId === 'view-start');
    window.scrollTo(0, 0);
    if (viewId === 'view-bilddoku') renderTree();
    if (viewId === 'view-bautagebuch') initDiaryView();
  }

  // ------------------------------------------------------------------- Helpers
  function toast(msg, ms = 2600) {
    const t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(() => { t.hidden = true; }, ms);
  }

  function openInfoModal(title, html) {
    $('#modalTitle').textContent = title;
    $('#modalBody').innerHTML = html;
    $('#modalCancel').hidden = true;
    $('#modalOk').textContent = 'Schließen';
    const overlay = $('#modalOverlay');
    overlay.hidden = false;
    $('#modalOk').onclick = () => { overlay.hidden = true; };
  }

  // Generisches Formular-Modal. fields: [{name,label,type,value,placeholder,required}]
  function openFormModal(title, fields, onSubmit) {
    $('#modalTitle').textContent = title;
    const body = $('#modalBody');
    body.innerHTML = fields.map((f) => {
      if (f.type === 'select') {
        const opts = f.options.map((o) =>
          `<option value="${escAttr(o.value)}"${o.value === f.value ? ' selected' : ''}>${escHtml(o.label)}</option>`).join('');
        return `<label>${escHtml(f.label)}<select name="${f.name}">${opts}</select></label>`;
      }
      return `<label>${escHtml(f.label)}<input name="${f.name}" type="${f.type || 'text'}"
        value="${escAttr(f.value || '')}" placeholder="${escAttr(f.placeholder || '')}"
        ${f.required ? 'required' : ''} autocomplete="off" /></label>`;
    }).join('');
    $('#modalCancel').hidden = false;
    $('#modalOk').textContent = 'OK';
    const overlay = $('#modalOverlay');
    overlay.hidden = false;
    $('#modalCancel').onclick = () => { overlay.hidden = true; };
    $('#modalOk').onclick = () => {
      const data = {};
      $$('#modalBody [name]').forEach((el) => { data[el.name] = el.value.trim(); });
      const ok = onSubmit(data);
      if (ok !== false) overlay.hidden = true;
    };
  }

  async function shareFile(blob, filename, mime, title) {
    const file = new File([blob], filename, { type: mime });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: title || filename });
        toast('Geteilt: ' + filename);
        return;
      } catch (e) {
        if (e && e.name === 'AbortError') return; // Nutzer hat abgebrochen
        // sonst Fallback Download
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    toast('Gespeichert: ' + filename);
  }

  const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const escAttr = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ------------------------------------------------------------- Projektkopf
  function techRow(value = '') {
    const div = document.createElement('div');
    div.className = 'tech-item';
    div.innerHTML = `<input type="text" placeholder="Name" value="${escAttr(value)}" autocomplete="off" />
      <button type="button" class="tech-del" aria-label="Entfernen">✕</button>`;
    div.querySelector('.tech-del').onclick = () => div.remove();
    return div;
  }

  async function loadProjectForm() {
    project = await DB.getProject();
    const f = $('#projectForm');
    const list = $('#techList');
    list.innerHTML = '';
    if (project) {
      f.filiale.value = project.filiale || '';
      f.ort.value = project.ort || '';
      f.datum.value = project.datum || '';
      f.beauftragung.value = project.beauftragung || 'NFK Vollverkabelung';
      (project.techniker && project.techniker.length ? project.techniker : ['']).forEach((t) => list.appendChild(techRow(t)));
    } else {
      f.datum.value = new Date().toISOString().slice(0, 10);
      list.appendChild(techRow(''));
    }
  }

  async function saveProjectForm(e) {
    e.preventDefault();
    const f = e.target;
    const techniker = $$('#techList input').map((i) => i.value.trim()).filter(Boolean);
    project = {
      filiale: f.filiale.value.trim(),
      ort: f.ort.value.trim(),
      datum: f.datum.value,
      beauftragung: f.beauftragung.value.trim() || 'NFK Vollverkabelung',
      techniker,
    };
    await DB.saveProject(project);
    const saved = $('#projectSaved');
    saved.hidden = false;
    setTimeout(() => { saved.hidden = true; }, 2000);
    toast('Stammdaten gespeichert');
  }

  // --------------------------------------------------------- Bilddoku-Tree
  function revokeThumbs() {
    activeUrls.forEach((u) => URL.revokeObjectURL(u));
    activeUrls = [];
  }

  async function renderTree() {
    const info = $('#templateInfo');
    const tree = $('#structureTree');
    revokeThumbs();

    const nodes = await Structure.getMerged();
    const tplCount = (await DB.getStructure()).length;
    info.textContent = nodes.length
      ? `${nodes.length} Positionen (${tplCount} aus Template).`
      : 'Noch kein Template importiert. Beispiel: assets/beispiel_bilddoku_template.xlsx';

    if (nodes.length === 0) { tree.innerHTML = ''; return; }

    const enriched = await Overview.enrich(nodes);
    const grp = Structure.groupForDisplay(enriched);

    tree.innerHTML = '';
    for (const [ober, unterMap] of grp) {
      const h = document.createElement('div');
      h.className = 'tree-ober';
      h.textContent = ober;
      tree.appendChild(h);
      for (const [uk, list] of unterMap) {
        if (uk) {
          const u = document.createElement('div');
          u.className = 'tree-unter';
          u.textContent = uk;
          tree.appendChild(u);
        }
        for (const n of list) tree.appendChild(await nameRow(n));
      }
    }
  }

  async function nameRow(n) {
    const row = document.createElement('div');
    row.className = 'name-row' + (n.done ? ' done' : '');
    row.innerHTML = `
      <span class="count-badge">${n.ist}/${n.pflicht}</span>
      <div class="name-main">
        <div class="name-label">${escHtml(n.bildname)}</div>
        <div class="name-count">${n.done ? 'erledigt' : 'offen'}</div>
        <div class="thumbs"></div>
      </div>
      <button class="gal-btn" title="Aus Galerie">🖼️</button>
      <button class="cam-btn" title="Foto aufnehmen">📷</button>`;

    row.querySelector('.cam-btn').onclick = () => pickPhoto(n, true);
    row.querySelector('.gal-btn').onclick = () => pickPhoto(n, false);

    const thumbs = row.querySelector('.thumbs');
    const photos = await DB.getPhotos(n.key);
    for (const p of photos) {
      const url = URL.createObjectURL(p.blob);
      activeUrls.push(url);
      const wrap = document.createElement('div');
      wrap.className = 'thumb-wrap';
      wrap.innerHTML = `<img src="${url}" alt="" loading="lazy" /><span class="thumb-seq">${String(p.seq).padStart(2, '0')}</span>`;
      thumbs.appendChild(wrap);
    }
    return row;
  }

  // Versteckte File-Inputs (Kamera mit capture, Galerie ohne) gemeinsam genutzt.
  let cameraInput, galleryInput;
  function setupPhotoInputs() {
    cameraInput = document.createElement('input');
    cameraInput.type = 'file';
    cameraInput.accept = 'image/*';
    cameraInput.capture = 'environment';
    cameraInput.hidden = true;
    galleryInput = document.createElement('input');
    galleryInput.type = 'file';
    galleryInput.accept = 'image/*';
    galleryInput.multiple = true;
    galleryInput.hidden = true;
    document.body.append(cameraInput, galleryInput);
    cameraInput.addEventListener('change', onPhotosSelected);
    galleryInput.addEventListener('change', onPhotosSelected);
  }

  function pickPhoto(node, camera) {
    currentNode = node;
    (camera ? cameraInput : galleryInput).click();
  }

  async function onPhotosSelected(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = ''; // erlaubt erneute Auswahl derselben Datei
    if (!files.length || !currentNode) return;
    toast(files.length > 1 ? `Verarbeite ${files.length} Bilder…` : 'Verarbeite Bild…');
    try {
      for (const file of files) {
        await Photos.addToNode(currentNode, file);
      }
      await renderTree();
      toast('Gespeichert');
    } catch (err) {
      console.error(err);
      toast('Fehler beim Speichern des Bildes');
    }
  }

  // ------------------------------------------------- Eigenen Namen anlegen
  async function addCustomNameFlow() {
    const nodes = await Structure.getMerged();
    const obers = Array.from(new Set(nodes.map((n) => n.ober)));
    const oberOptions = [{ value: '__new__', label: '➕ Neuer Bereich…' }]
      .concat(obers.map((o) => ({ value: o, label: o })));

    openFormModal('Eigenen Namen anlegen', [
      { name: 'oberSelect', label: 'Bereich (Oberordner)', type: 'select', options: oberOptions, value: obers[0] || '__new__' },
      { name: 'oberNew', label: 'Neuer Bereich (falls oben „Neuer Bereich")', placeholder: 'z. B. 06_Sonstiges' },
      { name: 'unter', label: 'Unterordner (optional)', placeholder: 'leer = direkt im Bereich' },
      { name: 'bildname', label: 'Bildname', placeholder: 'z. B. Detailaufnahme', required: true },
      { name: 'pflicht', label: 'Pflichtanzahl', type: 'number', value: '1' },
    ], async (data) => {
      let ober = data.oberSelect === '__new__' ? (data.oberNew || '').trim() : data.oberSelect;
      const bildname = (data.bildname || '').trim();
      if (!ober) ober = 'Allgemein';
      if (!bildname) { toast('Bildname fehlt'); return false; }
      const unter = (data.unter || '').trim() || null;
      let pflicht = parseInt(data.pflicht, 10);
      if (!Number.isFinite(pflicht) || pflicht < 0) pflicht = 1;
      const node = {
        key: Structure.makeKey(ober, unter, bildname),
        ober, unter, bildname, pflicht, source: 'custom',
      };
      await DB.addCustomName(node);
      await renderTree();
      toast('Name angelegt');
    });
  }

  // -------------------------------------------------- Template importieren
  async function importTemplate(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const nodes = await Structure.importFile(file);
      await renderTree();
      toast(`Template importiert: ${nodes.length} Positionen`);
    } catch (err) {
      console.error(err);
      toast('Import fehlgeschlagen: ' + (err.message || err));
    }
  }

  // ------------------------------------------------------- Bautagebuch-View
  let diaryDate = null;

  async function initDiaryView() {
    project = await DB.getProject();
    const f = $('#diaryForm');
    if (!diaryDate) diaryDate = (project && project.datum) || new Date().toISOString().slice(0, 10);
    f.datum.value = diaryDate;
    await loadDiaryForDate(diaryDate);
    f.datum.onchange = async () => { diaryDate = f.datum.value; await loadDiaryForDate(diaryDate); };
  }

  async function loadDiaryForDate(datum) {
    const f = $('#diaryForm');
    const saved = await DB.getDiary(datum);
    const techs = (project && project.techniker) || [];

    if (saved) {
      f.anzTechniker.value = saved.anzTechniker ?? techs.length;
      f.taetigkeiten.value = saved.taetigkeiten || '';
      f.behinderungen.value = saved.behinderungen || '';
      f.vorkommnisse.value = saved.vorkommnisse || '';
      f.ortDatum.value = saved.ortDatum || defaultOrtDatum(datum);
      renderDiaryRows(saved.rows || techs.map((t) => ({ name: t })));
    } else {
      f.anzTechniker.value = techs.length || '';
      f.taetigkeiten.value = '';
      f.behinderungen.value = '';
      f.vorkommnisse.value = '';
      f.ortDatum.value = defaultOrtDatum(datum);
      renderDiaryRows(techs.map((t) => ({ name: t })));
    }
  }

  function defaultOrtDatum(datum) {
    const ort = (project && project.ort) || '';
    if (!datum) return ort;
    const [y, m, d] = datum.split('-');
    return `${ort} ${d}.${m}.${y}`.trim();
  }

  function renderDiaryRows(rows) {
    const cont = $('#diaryRows');
    cont.innerHTML = '';
    const data = (rows || []).slice(0, 5);
    while (data.length < 5) data.push({});
    data.forEach((r, i) => {
      const div = document.createElement('div');
      div.className = 'diary-row';
      div.innerHTML = `
        <input class="dr-name" type="text" placeholder="Techniker ${i + 1}" value="${escAttr(r.name || '')}" autocomplete="off" />
        <div class="dr-times">
          <label>Start<input class="dr-start" type="time" value="${escAttr(r.start || '')}" /></label>
          <label>Ende<input class="dr-ende" type="time" value="${escAttr(r.ende || '')}" /></label>
          <label>Pause<input class="dr-pause" type="time" value="${escAttr(r.pause || '')}" /></label>
        </div>
        <textarea class="dr-bem" rows="1" placeholder="Bemerkung">${escHtml(r.bemerkung || '')}</textarea>`;
      cont.appendChild(div);
    });
  }

  function gatherDiary() {
    const f = $('#diaryForm');
    const rows = $$('#diaryRows .diary-row').map((d) => ({
      name: d.querySelector('.dr-name').value.trim(),
      start: d.querySelector('.dr-start').value,
      ende: d.querySelector('.dr-ende').value,
      pause: d.querySelector('.dr-pause').value,
      bemerkung: d.querySelector('.dr-bem').value.trim(),
    })).filter((r) => r.name || r.start || r.ende || r.pause || r.bemerkung);

    return {
      datum: f.datum.value,
      anzTechniker: f.anzTechniker.value,
      rows,
      taetigkeiten: f.taetigkeiten.value,
      behinderungen: f.behinderungen.value,
      vorkommnisse: f.vorkommnisse.value,
      ortDatum: f.ortDatum.value.trim(),
    };
  }

  async function saveDiary() {
    const model = gatherDiary();
    if (!model.datum) { toast('Datum fehlt'); return; }
    await DB.saveDiary(model);
    const s = $('#diarySaved');
    s.hidden = false; setTimeout(() => { s.hidden = true; }, 2000);
    toast('Tag gespeichert');
  }

  async function exportDiary() {
    const model = gatherDiary();
    if (!model.datum) { toast('Datum fehlt'); return; }
    await DB.saveDiary(model); // immer mitspeichern
    if (!project) project = await DB.getProject();
    const full = Object.assign({}, model, {
      filiale: (project && project.filiale) || '',
      ort: (project && project.ort) || '',
      beauftragung: (project && project.beauftragung) || 'NFK Vollverkabelung',
    });
    try {
      const name = await Bautagebuch.exportFile(full);
      toast('Bautagebuch erstellt');
    } catch (err) {
      console.error(err);
      toast('Export fehlgeschlagen: ' + (err.message || err));
    }
  }

  // ------------------------------------------------------------------- Init
  function bindEvents() {
    $('#backBtn').onclick = () => show('view-start');
    $$('[data-go]').forEach((b) => b.onclick = () => show(b.dataset.go));
    $('#projectForm').addEventListener('submit', saveProjectForm);
    $('#addTechBtn').onclick = () => $('#techList').appendChild(techRow(''));
    $('#importTemplate').addEventListener('change', importTemplate);
    $('#addCustomBtn').onclick = addCustomNameFlow;
    $('#overviewBtn').onclick = () => Overview.show();
    $('#exportZipBtn').onclick = async () => {
      toast('Erzeuge ZIP…');
      try { await ExportZip.build(); } catch (e) { console.error(e); toast('ZIP-Fehler: ' + (e.message || e)); }
    };
    $('#diarySaveBtn').onclick = saveDiary;
    $('#diaryExportBtn').onclick = exportDiary;
    $('#modalOverlay').addEventListener('click', (e) => {
      if (e.target.id === 'modalOverlay') e.currentTarget.hidden = true;
    });
  }

  function updateNetDot() {
    $('#netDot').classList.toggle('offline', !navigator.onLine);
  }

  async function init() {
    setupPhotoInputs();
    bindEvents();
    updateNetDot();
    window.addEventListener('online', updateNetDot);
    window.addEventListener('offline', updateNetDot);
    await loadProjectForm();
    show('view-start');

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch((e) => console.warn('SW-Registrierung fehlgeschlagen', e));
    }
  }

  document.addEventListener('DOMContentLoaded', init);

  // Öffentlich für andere Module:
  return { toast, openInfoModal, openFormModal, shareFile, show };
})();
