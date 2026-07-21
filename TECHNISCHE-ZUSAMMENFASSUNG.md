# Technische Zusammenfassung – Auftragsdoku FlexPos NFK Vollverkabelung

Stand: 2026-07-03 · App-Version v22 · DB-Schema v3
Zweck dieses Dokuments: lückenlose Erfassung von Funktionsweise und Aufbau als Grundlage
für Erweiterungen und die Zusammenführung mit weiteren Tools.

---

## 1. Was das Tool ist

Eigenständige, **offline-fähige PWA** (Progressive Web App) für Servicetechniker zur
Dokumentation von NFK-Vollverkabelungs-Baustellen direkt am Android-Smartphone. Zwei Kernaufgaben:

1. **Bilddokumentation** – strukturierte Fotoaufnahme nach Vorlage → Ergebnis: eine ZIP-Datei.
2. **Bautagebuch** – tägliche Erfassung → Ergebnis: eine Excel-Datei in fixer Vorlagen-Optik.

**Harte Rahmenbedingungen (Design-Constraints):**
- Kein Backend, kein Server, keine Datenbank in der Cloud, kein Login/OAuth, keine laufenden Kosten.
- Nach PWA-Installation vollständig offline lauffähig.
- Weitergabe ausschließlich über den Android-Teilen-Dialog bzw. lokalen Download.
- Bilder sind **append-only**: nie löschen, nie überschreiben, nie umbenennen.
- Bautagebuch-Optik muss 1:1 der Papiervorlage entsprechen.
- Deploy als statische Seite über GitHub Pages: `https://michawdw.github.io/nfk-doku/`

---

## 2. Technologie-Stack & Architekturprinzipien

- **Reines HTML/CSS/Vanilla-JS**, kein Framework, keine Build-Tools, kein Transpiler, kein npm.
  Direkt im Browser lauffähig; deploybar durch simples Hochladen der Dateien.
- **Persistenz:** IndexedDB (alle Nutzdaten liegen ausschließlich lokal auf dem Gerät).
- **PWA:** Service Worker (Offline-Cache) + Web App Manifest (Installierbarkeit).
- **Bibliotheken (lokal vendored, offline-fähig):**
  - `lib/jszip.min.js` (~98 KB) – ZIP erzeugen/lesen/patchen.
  - `lib/exceljs.min.js` (~948 KB) – Excel lesen/schreiben; **wird lazy geladen** (erst bei Bedarf,
    nicht beim Start), da die Dateigröße den Kaltstart alter Geräte sonst blockiert.
- **Bildverarbeitung:** Canvas-API (native), keine Serverseite.
- **Modulmuster:** Jede JS-Datei ist ein IIFE, das ein Singleton-Objekt an eine globale `const`
  hängt (`DB`, `Structure`, `Photos`, `Overview`, `ExportZip`, `Bautagebuch`, `Handover`,
  `Merge`, `App`). Kommunikation über diese globalen Objekte – **kein** Modulsystem (kein
  import/export, kein Bundler).

**Zentrale Kopplung (wichtig für Erweiterungen):** `App` hält den aktiven Auftrag im Speicher
(`currentJob`). Fast alle Module holen ihn über `App.getCurrentJob()` und speichern über
`App.saveCurrentJob()`. `App` ist damit die Quelle der Wahrheit für den „aktuellen Auftrag".

---

## 3. Projektstruktur (Dateien)

```
index.html                     App-Shell: 3 Views (Start, Bilddoku, Bautagebuch) + Modal + Toast
css/styles.css                 gesamtes Styling (CSS-Variablen als Theme-Tokens)
manifest.webmanifest           PWA-Manifest (Name, Icons, standalone, portrait, theme #1f4e78)
sw.js                          Service Worker: Precache + Fetch-Strategien + Versions-API

js/db.js          (DB)         IndexedDB-Wrapper, Schema v3, Migration v2→v3, Job-/Foto-/Diary-CRUD
js/template.js    (Structure)  Vorlagen-Import (ExcelJS), Knoten-Modell, Skip-Logik, Merge eigener Namen
js/photos.js      (Photos)     EXIF-Orientation, Komprimierung (Canvas), fortlaufende Nummerierung
js/overview.js    (Overview)   Anreicherung (Ist/Status/skip) + Übersichts-HTML
js/export-zip.js  (ExportZip)  Bilddoku-ZIP + uebersicht.csv + manifest.json + Dateiname
js/bautagebuch.js (Bautagebuch)Bautagebuch-.xlsx via XML-Patch der Originalvorlage
js/handover.js    (Handover)   Übergabe-.xlsx Export/Import (Status/Zähler, ohne Bilder)
js/merge.js       (Merge)      Bild-ZIP eines anderen Geräts einlesen/zusammenführen
js/app.js         (App)        Bootstrap, Navigation, Projektkopf, Tree, Bautagebuch-Formular, Helfer

lib/jszip.min.js, lib/exceljs.min.js     externe Libs (ExcelJS lazy geladen)
assets/templates.xlsx                    Vorlagen-Katalog: jeder Tab = eine Bilddoku-Vorlage
assets/vorlage_bautagebuch.xlsx          Original-Bautagebuch (wird befüllt, nie neu geschrieben)
assets/icon-192.png, icon-512.png, logo.png
tools/*.py                               Hilfsskripte (Vorlagen/Beispiel erzeugen, Verifikation) – nur Dev
.nojekyll                                schaltet Jekyll auf GitHub Pages ab (reine Statik)
.claude/launch.json                      lokaler Dev-Server (py http.server, Port 8766)
```

**Skript-Ladereihenfolge in index.html** (Reihenfolge relevant, da globale Abhängigkeiten):
`jszip → db → template → photos → overview → export-zip → bautagebuch → handover → merge → app`.
`app.js` initialisiert per `DOMContentLoaded`. ExcelJS wird zur Laufzeit bei Bedarf nachgeladen.

---

## 4. Datenmodell (IndexedDB, Schema v3)

Datenbankname `nfk-doku`, Version 3. Alles ist **pro Auftrag (jobId)** getrennt.

### Object Stores

| Store    | keyPath              | Indizes                                   | Inhalt |
|----------|----------------------|-------------------------------------------|--------|
| `jobs`   | `id`                 | –                                         | ein Datensatz je Auftrag |
| `photos` | `id` (autoIncrement) | `byNode`=nodeKey, `byJob`=jobId, `byJobNode`=[jobId,nodeKey] | Bilder (append-only) |
| `diary2` | `[jobId, datum]`     | –                                         | Bautagebuch-Tage |
| `meta`   | (out-of-line keys)   | –                                         | Key/Value: `currentJobId`, `deviceId`, `migratedV3` |

### Job-Objekt (Store `jobs`)
```js
{
  id: 'job_<timestamp>_<rand>',
  name: string,                       // Anzeigename (koppelt an Filiale, solange „Auftrag N")
  header: {
    filiale: string,                  // z. B. "7265 Memmingen" (führende Zahl = Filialnummer)
    ort: string,
    datum: 'YYYY-MM-DD',
    beauftragung: string,             // Default "NFK Vollverkabelung"
    techniker: string[]               // NUR noch über Übergabe/Migration befüllt (UI entfernt)
  },
  structure: Node[],                  // aktive Vorlage (siehe Node unten)
  customNames: Node[],                // im Feld angelegte eigene Namen (überleben Vorlagenwechsel)
  selectedTemplate: string|null,      // Tab-Name aus templates.xlsx oder '(Eigener Import)'
  priorCounts: { [nodeKey]: number }, // vom Vorteam übernommene Ist-Anzahl je Position
  skipped: { obers: string[], unters: string[], nodes: string[] }, // „nicht benötigt"
  lastBackupAt?: number,              // ms-Zeitstempel der letzten Sicherung (für Backup-Banner)
  createdAt: number, updatedAt: number
}
```

### Node-Objekt (Struktur-/Bildposition)
```js
{
  key: 'ober␟unter␟bildname',   // stabiler Schlüssel; SEP = '␟' (U+241F); unter leer -> ''
  ober: string,                 // Oberordner (Pflicht; Default "Allgemein")
  unter: string|null,           // Unterordner (optional, max. 2 Ebenen)
  bildname: string,             // Anzeigename der Position
  pflicht: number,              // Pflichtanzahl Bilder (>=0; Default 1)
  source: 'template'|'custom'   // Herkunft
}
```
- Schlüssel via `Structure.makeKey(ober, unter, bildname)`.
- Unterordner-Skip-Key via `Structure.unterKey(ober, unter)` = `ober␟unter`.

### Foto-Datensatz (Store `photos`)
```js
{
  id: <autoIncrement>,
  jobId: string,
  nodeKey: string,              // = Node.key
  seq: number,                  // 1-basiert, fortlaufend = prior + lokale + 1
  blob: Blob,                   // komprimiertes JPEG
  createdAt: number,            // ms
  srcId: string                 // '<deviceId>:<base36>' – global eindeutige Bild-ID (Merge-Dedup)
}
```

### Bautagebuch-Tag (Store `diary2`, key `[jobId, datum]`)
```js
{
  jobId, datum: 'YYYY-MM-DD',
  anzTechniker: string|number,
  rows: [{ name, start:'HH:MM', ende:'HH:MM', pause:'HH:MM', bemerkung }],  // max. 5
  taetigkeiten, behinderungen, vorkommnisse, ortDatum
}
```

### Angereicherter Knoten (`Overview.enrich`, nur zur Laufzeit, nicht persistiert)
```js
{ ...Node, ist, prior, local, done: ist>=pflicht, skipped: Structure.isSkipped(n, job) }
```

### IDs
- `deviceId` – einmalig pro Gerät erzeugt (`meta`), Präfix `dev_`. Basis für eindeutige `srcId`.
- `srcId` – pro Foto, geräteübergreifend eindeutig; verhindert Doppel beim Zusammenführen.
- `jobId`, `nodeKey` – siehe oben.

### Migration v2 → v3 (einmalig, `db.js: migrateIfNeeded`)
Alte Einzel-Auftrags-Stores (`project`, `structure`, `customNames`, `diary`, jobId-lose `photos`)
werden in **einen** Default-Auftrag überführt; nichts geht verloren. Flag `migratedV3` in `meta`.
Alt-Stores werden nicht gelöscht (nur ausgelesen). **Neuere Felder** (`skipped`, `lastBackupAt`)
sind optional und werden überall defensiv mit `|| []` / `|| 0` gelesen → kein Schema-Bump nötig.

---

## 5. Funktionsumfang (feature-by-feature, mit Code-Bezug)

### 5.1 Auftragsverwaltung (Multi-Job) — `app.js`
- Startseite listet alle Aufträge (`renderJobList`), aktiver ist markiert.
- `newJobFlow`, `switchJob`, `renameJob`, `deleteJobFlow` (2-stufige Sicherheitsabfrage).
- Aktiver Auftrag in `meta.currentJobId`; im Speicher `App.currentJob`.
- Löschen entfernt kaskadierend Fotos (Index `byJob`) und Bautagebuch-Tage.

### 5.2 Projekt-Stammdaten — `app.js: saveProjectForm`
- Felder Filiale, Ort, Datum, Beauftragung. **Techniker-Feld wurde aus der Startseite entfernt**
  (Team wird pro Tag im Bautagebuch erfasst); `header.techniker` bleibt im Datenmodell erhalten
  (Übergabe-Kompatibilität), wird beim Speichern nur durchgereicht.
- Auftragsname koppelt automatisch an Filiale, solange nicht manuell umbenannt (`/^Auftrag \d+$/`).

### 5.3 Bilddoku – Vorlagen — `template.js`
- **Katalog** `assets/templates.xlsx`: jeder Tab = eine Vorlage; Tab-Name = Anzeigename.
  Spalten je Tab: `Oberordner | Unterordner | Bildname | Pflichtanzahl` (max. 2 Ebenen).
- **Fill-down-Parsing** (`parseWorkbook`): leere Ober-/Unterordner werden aus der Zeile darüber
  fortgeführt (wie verbundene Excel-Zellen); neuer Oberordner setzt Unterordner zurück.
  Kopfzeile wird erkannt/übersprungen; ungültige Pflichtzahl → 1.
- `listTemplates`, `importFromCatalog(tab)`, `importFile(file)` (externe .xlsx, erstes Blatt,
  Label `(Eigener Import)`), `getSelectedTemplate`.
- **Eigene Namen** (`addCustomName`) im Feld anlegbar; überleben Vorlagenwechsel; per
  `getMerged()` mit der Vorlage vereint (dedupe über `key`).

### 5.4 Bilddoku – Baum & „nicht benötigt" — `app.js: renderTree/nameRow`, `template.js: isSkipped`
- Ein-/ausklappbarer Baum (Ober → Unter → Position); Zustände in `expandedObers/Unters`.
- Statistik „erledigt/gesamt" je Ordner nur über **benötigte** (nicht geskippte) Knoten;
  grüner Haken bei vollständiger Erledigung.
- **Skip-Markierung** hierarchisch: `job.skipped.obers|unters|nodes`. `isSkipped(n, job)`
  prüft alle drei Ebenen (Ordner-Skip **kaskadiert** automatisch auf Kinder). Toggle `∅`/`↩`
  pro Zeile/Kopf (`toggleSkip`). Wirkt in App, Übersicht, ZIP-CSV, Übergabe-xlsx.

### 5.5 Bilddoku – Fotos — `photos.js`
- Aufnahme (`capture=environment`) oder Galerie (multiple), versteckte File-Inputs.
- **EXIF-Orientation** (1..8) wird gelesen und per Canvas-Transform korrigiert.
- **Komprimierung:** lange Kante ≤ `MAX_EDGE=1920 px`, JPEG `QUALITY=0.80`, kein Upscaling.
- **Nummerierung:** `seq = prior + lokale + 1` (append-only). Prior = `priorCounts[nodeKey]`
  (vom Vorteam), lokale = `DB.countPhotos`. Dateiname `<bildname>_NN.jpg`.
- Thumbnails via Object-URLs (werden bei Re-Render revoked).

### 5.6 Übersicht — `overview.js`
- `enrich(nodes)` reichert um `ist/prior/local/done/skipped` an.
- `buildHtml` gruppiert und zeigt drei Eimer: offen / erledigt / nicht benötigt (+ „Vorteam: N"-Tag).

### 5.7 Backup-Erinnerung + ZIP-Export — `app.js: renderBackupReminder/doBackupNow`, `export-zip.js`
- Banner (Start + Bilddoku) vergleicht `photo.createdAt` mit `job.lastBackupAt`:
  orange „N neue Bilder" / grün „alle gesichert". Knopf „💾 Jetzt sichern" = voller ZIP-Export.
- **ZIP-Aufbau** (`ExportZip.build`):
  - Bilder in Template-Ordnerstruktur `Ober/[Unter/]<Filialnr>_<Bildname>_NN.jpg`.
  - `uebersicht.csv` (UTF-8 BOM, `;`-getrennt): Oberordner;Unterordner;Bildname;Pflicht;Ist;Status.
  - `manifest.json` (maschinenlesbar, siehe §6) – Bild→Position-Zuordnung.
  - Kompression `STORE` (JPEGs sind bereits komprimiert).
  - Dateiname `Bilddoku_LI<Filialnr>_<Ort>_Stand_<Exportdatum>.zip` (Datum = Tag des Exports).
- Weitergabe über `App.shareFile` (Web Share API Level 2; Fallback: Download-Link).
- Export **löscht nie** Bilder aus der App (die ZIP ist eine Kopie/Momentaufnahme; jede ZIP ist
  vollständig). Speicher gibt man frei, indem man **abgeschlossene Aufträge löscht**.

### 5.8 Mehrere Geräte gleichzeitig – „Beiträge zusammenführen" — `merge.js`
- Jeder Techniker exportiert seine Bild-ZIP; Vorarbeiter liest sie ein (`importContributionZip`).
- Positionen aus `manifest.json` (Fallback: aus Ordnerpfaden für alte ZIPs).
- Fehlende Positionen werden als eigene Namen ergänzt; Bilder pro Position **weiternummeriert**
  angehängt. **Duplikatschutz** über `srcId` (mehrfacher Re-Import fügt nichts doppelt ein).

### 5.9 Sequenzielle Übergabe an anderes Team — `handover.js`
- **Export** (`exportXlsx`): kleine .xlsx **ohne Bilder** mit Blatt „Auftrag" (Kopf-Felder) und
  „Uebersicht" (Position/Pflicht/Ist/Status). Auch für Innendienst-Auswertung.
- **Import** (`importXlsx`): rekonstruiert Auftrag/Struktur, setzt `priorCounts[key]=Ist`
  (→ „Vorteam: N"-Badge, kein Vorschaubild, da Bilder physisch beim Vorteam), übernimmt
  Skip-Status. Foto-Nummerierung läuft dank `priorCounts` nahtlos weiter → keine Doppel.

### 5.10 Bautagebuch — `bautagebuch.js`, `app.js: initDiaryView`
- **Erzeugung durch XML-Patch der Originalvorlage**: `assets/vorlage_bautagebuch.xlsx` wird als
  ZIP geöffnet, **nur** `xl/worksheets/sheet1.xml` (Wertzellen) angepasst – Styles, Rahmen,
  Schriften, eingebettetes Logo, Druckbereich, Blattschutz bleiben **byte-identisch** (1:1-Optik).
  Robuster als Neu-Schreiben mit ExcelJS.
- **Zellen-Mapping** (`patchSheet`): `G3`=Filiale, `E5`=Datum (Excel-Seriennummer),
  `E6`=Beauftragung, `G7`=Anz. Techniker; Zeilen 8..12: `B`=Name, `I`=Start, `K`=Ende,
  `M`=Pause (Zeiten als Tagesbruchteil), `O`=Bemerkung; `E14`=Tätigkeiten, `E16`=Behinderungen,
  `E19`=Vorkommnisse, `B22`=„Ort Datum". Zellstile bleiben erhalten (`s="…"`).
- Dateiname `Bautagebuch_LI<Filialnr>_<Ort>_<YYYY_MM_DD>.xlsx`.
- **Archiv pro Auftrag** (`diary2`): gespeicherte Tage listen, laden, nachbearbeiten, löschen.

### 5.11 PWA / Offline / Update — `sw.js`, `manifest.webmanifest`, `app.js`
- **Precache** aller Shell-Assets (einzeln, damit ein fehlendes Asset die Installation nicht killt).
- **Fetch-Strategien:**
  - Navigation → immer `index.html` aus dem Cache (sicherer Start offline/standalone).
  - `assets/templates.xlsx` → **network-first** (neue Vorlagen sofort sichtbar; offline Fallback).
  - übrige Assets → **cache-first**, sonst Netz + nachcachen.
- **Versionierung:** `const CACHE = 'nfk-doku-vNN'`. Erhöhen löst auf Geräten den Austausch aus
  (install→skipWaiting, activate→alte Caches löschen + clients.claim).
- **Versionsanzeige:** Startseite fragt den laufenden SW per `postMessage('GET_VERSION')` nach
  `CACHE` und zeigt „Version vNN" (Fallback `APP_VERSION` in `app.js`).
- **Persistenter Speicher** wird beim Start angefordert (`navigator.storage.persist`).

### 5.12 Navigation / UI-Shell — `app.js`, `index.html`
- Drei Views (`view-start`, `view-bilddoku`, `view-bautagebuch`), umgeschaltet via `show()`.
- **Android-Zurück-Taste:** `show()` pusht für Unteransichten einen History-Eintrag; ein
  `popstate`-Listener kehrt zur Startseite zurück (statt die App zu verlassen). In-App-Pfeil
  ruft `history.back()`.
- Gemeinsame Helfer in `App`: `toast`, `openInfoModal`, `openFormModal`, `openConfirm`,
  `shareFile` (Web Share + Download-Fallback).

---

## 6. Öffentliche Datenformate (Schnittstellen für andere Tools)

Diese Formate sind die natürlichen Andockpunkte für Integrationen:

### manifest.json (in jeder Bilddoku-ZIP)
```json
{
  "app": "nfk-doku", "type": "bilddoku", "version": 1,
  "job": { "name": "...", "header": { "filiale": "...", "ort": "...", "datum": "...", "beauftragung": "...", "techniker": [] } },
  "photos": [
    { "srcId": "...", "nodeKey": "ober␟unter␟bildname", "ober": "...", "unter": "...|null",
      "bildname": "...", "pflicht": 1, "benoetigt": true, "seq": 1,
      "createdAt": 1720000000000, "path": "Ober/Unter/7265_Bildname_01.jpg" }
  ]
}
```
→ Vollständig maschinenlesbare Bild↔Position-Zuordnung. `srcId` ist der stabile Dedupe-Schlüssel.

### uebersicht.csv (in jeder Bilddoku-ZIP)
`Oberordner;Unterordner;Bildname;Pflichtanzahl;Ist-Anzahl;Status` (UTF-8 BOM, `;`, Status ∈
`offen|erledigt|nicht benötigt`).

### Übergabe-.xlsx (Handover)
- Blatt **Auftrag**: `Feld|Wert` mit `id, name, filiale, ort, datum, beauftragung, techniker, vorlage`.
- Blatt **Uebersicht**: `Oberordner|Unterordner|Bildname|Pflichtanzahl|Ist-Anzahl|Status`.
→ Idempotenter Re-Import (gleiche `id` aktualisiert den Auftrag).

### Bautagebuch-.xlsx
Befüllte Kopie der festen Vorlage (kein generisches Schema – Zellpositionen siehe §5.10).

---

## 7. Versionierung, Update, Deploy

- **Zwei Versions-Stellen bei jeder App-Änderung gemeinsam erhöhen:**
  1. `const CACHE = 'nfk-doku-vNN'` in `sw.js` (löst Geräte-Update aus).
  2. `const APP_VERSION = 'vNN'` in `js/app.js` (Anzeige; SW-Wert ist autoritativ).
- **Deploy:** komplette Dateien ins GitHub-Repo-Root (`index.html` im Root). `.nojekyll` aktiv.
  GitHub Pages liefert den letzten **erfolgreichen** Deploy aus. „Deployment failed, try again
  later" ist ein transienter GitHub-Fehler → erneut deployen. Live-Version verlässlich per
  `curl -s "<url>/sw.js?cb=$(date +%s)" | grep CACHE` prüfen.
- **Geräte-Update:** online App öffnen → warten → aus letzten Apps wischen → neu öffnen (ggf. 2×).
  App-Symbol deinstallieren löscht **nicht** den Chrome-Speicher; „Websitedaten löschen" löscht
  IndexedDB = **alle Fotos** (nur mit vorherigem ZIP-Backup).
- **Neues Bilder-Template** braucht **keinen** App-Update: `templates.xlsx` neu hochladen
  (network-first → erscheint automatisch).

---

## 8. Modul-Abhängigkeiten (für Refactoring/Integration)

```
App        → DB, Structure, Photos, Overview, ExportZip, Bautagebuch, Handover, Merge
Structure  → App (getCurrentJob/saveCurrentJob), ExcelJS(lazy)
Photos     → App, DB
Overview   → App, Structure, DB
ExportZip  → App, Structure, Overview, DB, JSZip
Handover   → App, Structure, DB, ExcelJS(lazy)
Merge      → App, Structure, DB, JSZip
Bautagebuch→ App, JSZip
DB         → (keine App-Abhängigkeit; reiner IndexedDB-Layer)
```
`App` exportiert öffentlich nur: `toast, openInfoModal, openFormModal, shareFile, show,
getCurrentJob, saveCurrentJob`. Alles andere ist modul-privat.

---

## 9. Grenzen & Fallstricke (bewusst so gebaut)

- **Browser-Sandbox:** Die App kann keine Dateien im Download-Ordner/Drive lesen, ändern oder
  löschen – nur „neue Datei anbieten". Alte ZIPs überschreiben ist daher technisch unmöglich;
  Aufräumen erfolgt manuell (eindeutige Datumsnamen helfen).
- **Kein Live-Sync** zwischen Geräten – Austausch nur über ZIP-Merge (parallel) oder Übergabe-xlsx
  (sequenziell).
- **Append-only:** Bilder werden nie gelöscht/umbenannt/überschrieben.
- **Speicher:** ~500 komprimierte Bilder ≈ 150–250 MB (<1 % modernes Handy). Freigabe durch
  Löschen abgeschlossener Aufträge.
- **DB-Schema-Änderungen** brauchen sorgfältige Migration (Mechanismus vorhanden, aktuell v3);
  optionale Felder ohne Bump bevorzugen. Fehlerhafte Migration = einziges reales Datenrisiko →
  auf Testgerät prüfen, ZIP-Backups vorhalten.
- **ExcelJS** ist groß und wird bewusst nur lazy geladen.

---

## 10. Hinweise für die geplante Erweiterung / Zusammenführung

- **Andockpunkte für Fremd-Tools:** `manifest.json` (strukturierte Bilddaten), Übergabe-xlsx
  (Statusdaten), CSV. Diese Formate sind stabil und maschinenlesbar → idealer Austausch-Layer.
- **Eindeutige IDs** (`jobId`, `nodeKey`, `srcId`, `deviceId`) sind bereits durchgängig vorhanden –
  gut geeignet als Fremdschlüssel bei Integration in ein größeres System.
- **Erweiterungsmuster:** neues Feature = neues IIFE-Modul, in `index.html` **vor** `app.js`
  einhängen, `App`-Helfer nutzen, Nutzdaten am `job`-Objekt (optionales Feld) oder in einem
  neuen Store ergänzen (dann DB-Version + Migration).
- **Achtung bei Integration:** `App.currentJob` ist globaler Zustand. Wer den aktiven Auftrag
  außerhalb von `App` ändert, muss `DB.setCurrentJobId` + `App`-Neuladen konsistent halten.
- **Wenn ein Backend/Sync dazukommt:** IndexedDB bleibt sinnvollerweise die Offline-Quelle;
  `srcId`/`updatedAt` ermöglichen konfliktarme Synchronisation (last-write / merge per srcId).
- **Grenzen respektieren:** Offline-First, keine laufenden Kosten, append-only, 1:1-Bautagebuch –
  diese Constraints sind produktprägend, nicht bloß technisch.
```
