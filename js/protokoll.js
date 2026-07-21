/* protokoll.js – erzeugt das Baustellen-Vorprüfungs-/Behinderungsprotokoll als .docx.
   Methode: OOXML-ZIP-Container komplett selbst per JSZip zusammenbauen (keine Vorlage,
   keine Word-Bibliothek). So sind variable Punkt- und Fotoanzahlen problemlos möglich.
   Muster/Konventionen analog js/bautagebuch.js (IIFE, generateBlob/exportFile/buildName,
   escapeXml, App.shareFile). Das Ergebnis öffnet in Microsoft Word und Google Docs.

   model = {
     filiale, ort, datum, beauftragung, auftragsname,
     points: [
       { titel, status: 'io' | 'nio',
         text,                                  // Freitext (nur bei 'nio' relevant)
         photos: [ { blob: Blob(image/jpeg), caption } ] }
     ]
   }
*/
const Protokoll = (() => {
  const MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const EMU_PER_PX = 9525;        // 914400 EMU/Zoll ÷ 96 dpi
  const MAX_W_EMU = 15 * 360000;  // 15 cm maximale Bildbreite (A4, ~2 cm Rand)

  // ---- XML-Helfer ----
  const escapeXml = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const escapeAttr = (s) => escapeXml(s).replace(/"/g, '&quot;');

  // Pixelmaße eines Bild-Blobs (bevorzugt createImageBitmap, sonst Image-Fallback).
  async function imageSizePx(blob) {
    if (typeof createImageBitmap === 'function') {
      try {
        const bmp = await createImageBitmap(blob);
        const s = { w: bmp.width, h: bmp.height };
        bmp.close();
        return s;
      } catch (e) { /* Fallback unten */ }
    }
    return await new Promise((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve({ w: img.naturalWidth, h: img.naturalHeight }); };
      img.onerror = (e) => { URL.revokeObjectURL(url); reject(e); };
      img.src = url;
    });
  }

  function emuSize(px) {
    let cx = Math.max(1, px.w) * EMU_PER_PX;
    let cy = Math.max(1, px.h) * EMU_PER_PX;
    if (cx > MAX_W_EMU) { cy = Math.round(cy * MAX_W_EMU / cx); cx = MAX_W_EMU; }
    return { cx, cy };
  }

  // ---- Absatz-Bausteine ----
  // Mehrzeiliger Text: an \n splitten, Segmente mit <w:br/> verbinden, alles in EINEM w:r.
  function runText(str) {
    const parts = String(str == null ? '' : str).replace(/\r\n?/g, '\n').split('\n');
    return parts.map((p) => `<w:t xml:space="preserve">${escapeXml(p)}</w:t>`).join('<w:br/>');
  }
  const pText = (str) => `<w:p><w:r>${runText(str)}</w:r></w:p>`;
  const pBold = (str) => `<w:p><w:r><w:rPr><w:b/></w:rPr>${runText(str)}</w:r></w:p>`;
  const pEmpty = () => '<w:p/>';
  // Kopfzeile „Label: Wert" – Label fett, Wert normal.
  const pHead = (label, val) =>
    `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t xml:space="preserve">${escapeXml(label)}: </w:t></w:r>` +
    `<w:r>${runText(val)}</w:r></w:p>`;
  // Überschrift größer (24 half-points = 12pt fett -> hier 32 = 16pt).
  const pTitle = (str) =>
    `<w:p><w:r><w:rPr><w:b/><w:sz w:val="32"/></w:rPr>${runText(str)}</w:r></w:p>`;

  // Ein eingebettetes Bild als eigener Absatz.
  function drawingParagraph(seq, emu) {
    return '<w:p><w:r><w:drawing>' +
      '<wp:inline distT="0" distB="0" distL="0" distR="0">' +
      `<wp:extent cx="${emu.cx}" cy="${emu.cy}"/>` +
      '<wp:effectExtent l="0" t="0" r="0" b="0"/>' +
      `<wp:docPr id="${seq}" name="Bild ${seq}"/>` +
      '<wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr>' +
      '<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      `<pic:pic><pic:nvPicPr><pic:cNvPr id="${seq}" name="Bild ${seq}"/><pic:cNvPicPr/></pic:nvPicPr>` +
      `<pic:blipFill><a:blip r:embed="rId${seq}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>` +
      `<pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${emu.cx}" cy="${emu.cy}"/></a:xfrm>` +
      '<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr>' +
      '</pic:pic></a:graphicData></a:graphic>' +
      '</wp:inline></w:drawing></w:r></w:p>';
  }

  async function generateBlob(model) {
    const zip = new JSZip();
    const rels = [];   // { id, target } je Bild
    const body = [];   // Absatz-XML
    let seq = 0;       // gemeinsamer Zähler: rId / imageN.jpeg / docPr id / cNvPr id

    // Kopf
    body.push(pTitle('Baustellen-Vorprüfung / Behinderungsprotokoll'));
    body.push(pEmpty());
    if (model.auftragsname) body.push(pHead('Auftrag', model.auftragsname));
    body.push(pHead('Filiale / Bauvorhaben', model.filiale));
    body.push(pHead('Ort', model.ort));
    body.push(pHead('Datum', fmtDate(model.datum)));
    body.push(pHead('Beauftragung', model.beauftragung || 'NFK Vollverkabelung'));
    body.push(pEmpty());

    // Prüfpunkte
    const points = model.points || [];
    for (let idx = 0; idx < points.length; idx++) {
      const pt = points[idx];
      const nio = pt.status === 'nio';
      const statusTxt = nio ? 'nicht i.O.' : 'i.O.';
      body.push(pBold(`${idx + 1}. ${pt.titel} — ${statusTxt}`));
      if (nio) {
        if (pt.text && pt.text.trim()) body.push(pText(pt.text));
        for (const ph of (pt.photos || [])) {
          if (!ph || !ph.blob) continue;
          seq++;
          let emu;
          try {
            emu = emuSize(await imageSizePx(ph.blob));
          } catch (e) {
            emu = { cx: MAX_W_EMU, cy: Math.round(MAX_W_EMU * 3 / 4) }; // 4:3-Fallback
          }
          zip.file(`word/media/image${seq}.jpeg`, ph.blob);
          rels.push({ id: seq, target: `media/image${seq}.jpeg` });
          body.push(drawingParagraph(seq, emu));
          if (ph.caption && ph.caption.trim()) body.push(pText(ph.caption));
        }
      }
      body.push(pEmpty());
    }

    // word/document.xml
    const documentXml =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"' +
      ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"' +
      ' xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"' +
      ' xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"' +
      ' xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">' +
      '<w:body>' + body.join('') +
      '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/>' +
      '<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"' +
      ' w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>' +
      '</w:body></w:document>';

    // Feste Container-Teile
    zip.file('[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Default Extension="jpeg" ContentType="image/jpeg"/>' +
      '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
      '</Types>');

    zip.file('_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
      '</Relationships>');

    zip.file('word/document.xml', documentXml);

    zip.file('word/_rels/document.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      rels.map((r) =>
        `<Relationship Id="rId${r.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${escapeAttr(r.target)}"/>`
      ).join('') +
      '</Relationships>');

    return zip.generateAsync({ type: 'blob', mimeType: MIME, compression: 'DEFLATE' });
  }

  function fmtDate(datum) {
    if (!datum) return '';
    const m = String(datum).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : String(datum);
  }

  // Dateiname: Vorpruefung_LI<Filialnr>_<Ort>_<YYYY_MM_DD>.docx (analog Bautagebuch).
  function buildName(model) {
    const clean = (s) => String(s || '').replace(/[\\/:*?"<>|]/g, '').trim();
    const filRaw = clean(model.filiale);
    const numMatch = filRaw.match(/\d+/);
    const fil = (numMatch ? numMatch[0] : filRaw || 'Projekt').replace(/\s+/g, '_');
    const ort = clean(model.ort).replace(/\s+/g, '_');
    const d = (model.datum || new Date().toISOString().slice(0, 10)).replace(/-/g, '_');
    const parts = ['Vorpruefung', 'LI' + fil];
    if (ort) parts.push(ort);
    parts.push(d);
    return parts.join('_').replace(/_+/g, '_') + '.docx';
  }

  async function exportFile(model) {
    const blob = await generateBlob(model);
    const name = buildName(model);
    await App.shareFile(blob, name, MIME, `Vorprüfung ${model.filiale || ''}`.trim());
    return name;
  }

  return { generateBlob, exportFile, buildName };
})();
