/* overview.js – berechnet Ist-Anzahl/Status je Knoten und rendert die
   Übersicht offener/erledigter Positionen. */
const Overview = (() => {

  // Reichert Knoten mit ist (Anzahl Bilder) und done (ist >= pflicht) an.
  async function enrich(nodes) {
    const counts = await Promise.all(nodes.map((n) => DB.countPhotos(n.key)));
    return nodes.map((n, i) => ({ ...n, ist: counts[i], done: counts[i] >= n.pflicht }));
  }

  // Baut HTML für die Übersicht: nach Ober/Unter gruppiert, offen zuerst markiert.
  function buildHtml(enriched) {
    const offen = enriched.filter((n) => !n.done);
    const erledigt = enriched.filter((n) => n.done);

    const grp = Structure.groupForDisplay(enriched);
    let html = `<div class="ov-summary">
        <span class="ov-pill open">${offen.length} offen</span>
        <span class="ov-pill done">${erledigt.length} erledigt</span>
      </div>`;

    for (const [ober, unterMap] of grp) {
      html += `<div class="ov-ober">${esc(ober)}</div>`;
      for (const [uk, list] of unterMap) {
        if (uk) html += `<div class="ov-unter">${esc(uk)}</div>`;
        for (const n of list) {
          const cls = n.done ? 'ov-item done' : 'ov-item open';
          const mark = n.done ? '✓' : '○';
          html += `<div class="${cls}">
              <span class="ov-mark">${mark}</span>
              <span class="ov-name">${esc(n.bildname)}</span>
              <span class="ov-cnt">${n.ist}/${n.pflicht}</span>
            </div>`;
        }
      }
    }
    return html;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  async function show() {
    const nodes = await Structure.getMerged();
    if (nodes.length === 0) {
      App.toast('Noch keine Struktur – bitte Template importieren.');
      return;
    }
    const enriched = await enrich(nodes);
    App.openInfoModal('Übersicht', buildHtml(enriched));
  }

  return { enrich, buildHtml, show };
})();
