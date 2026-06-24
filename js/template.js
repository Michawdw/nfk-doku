/* template.js – Import der Bilddoku-Struktur aus .xlsx (ExcelJS, nur Lesen)
   und Zusammenführung mit den im Feld angelegten eigenen Namen. */
const Structure = (() => {
  const SEP = '␟'; // Trennzeichen für stabile Knoten-Keys

  function makeKey(ober, unter, bildname) {
    return [ober, unter || '', bildname].join(SEP);
  }

  function cellText(cell) {
    if (cell == null) return '';
    const v = (cell && cell.value != null) ? cell.value : cell;
    if (v == null) return '';
    if (typeof v === 'object') {
      if (v.richText) return v.richText.map((r) => r.text).join('');
      if (v.text != null) return String(v.text);
      if (v.result != null) return String(v.result);
      return '';
    }
    return String(v);
  }

  // Liest ein importiertes Template (ArrayBuffer) -> Array von Knoten.
  async function parseWorkbook(arrayBuffer) {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(arrayBuffer);
    const ws = wb.worksheets[0];
    if (!ws) throw new Error('Keine Tabelle im Template gefunden.');

    const nodes = [];
    let headerSeen = false;
    ws.eachRow({ includeEmpty: false }, (row) => {
      const ober = cellText(row.getCell(1)).trim();
      const unter = cellText(row.getCell(2)).trim();
      const bildname = cellText(row.getCell(3)).trim();
      const pflichtRaw = cellText(row.getCell(4)).trim();

      // Kopfzeile überspringen (erste Zeile, die "Oberordner"/"Bildname" enthält).
      if (!headerSeen) {
        const joined = (ober + unter + bildname).toLowerCase();
        if (joined.includes('oberordner') || joined.includes('bildname')) {
          headerSeen = true;
          return;
        }
        headerSeen = true; // falls keine erkennbare Kopfzeile: trotzdem ab jetzt Daten
      }

      if (!ober && !bildname) return; // Leerzeile
      if (!bildname) return;          // ohne Bildnamen kein Knoten

      let pflicht = parseInt(pflichtRaw, 10);
      if (!Number.isFinite(pflicht) || pflicht < 0) pflicht = 1;

      nodes.push({
        key: makeKey(ober, unter, bildname),
        ober: ober || 'Allgemein',
        unter: unter || null,
        bildname,
        pflicht,
        source: 'template',
      });
    });

    if (nodes.length === 0) throw new Error('Template enthält keine gültigen Zeilen.');
    return nodes;
  }

  // Importiert und speichert die Struktur (ersetzt nur 'structure', nicht 'customNames').
  async function importFile(file) {
    const buf = await file.arrayBuffer();
    const nodes = await parseWorkbook(buf);
    await DB.saveStructure(nodes);
    return nodes;
  }

  // Liefert die zusammengeführte, anzuzeigende Knotenliste: Template ∪ eigene Namen.
  async function getMerged() {
    const [tpl, custom] = await Promise.all([DB.getStructure(), DB.getCustomNames()]);
    const map = new Map();
    for (const n of tpl) map.set(n.key, n);
    for (const c of custom) if (!map.has(c.key)) map.set(c.key, c); // eigene ergänzen, keine Doppel
    return Array.from(map.values());
  }

  // Gruppiert flache Knoten zu Ober -> (Unter|null) -> [Knoten] für die Anzeige.
  function groupForDisplay(nodes) {
    const obers = new Map(); // ober -> Map(unterKeyOrNull -> [nodes])
    for (const n of nodes) {
      if (!obers.has(n.ober)) obers.set(n.ober, new Map());
      const unterMap = obers.get(n.ober);
      const uk = n.unter || '';
      if (!unterMap.has(uk)) unterMap.set(uk, []);
      unterMap.get(uk).push(n);
    }
    return obers;
  }

  return { SEP, makeKey, parseWorkbook, importFile, getMerged, groupForDisplay };
})();
