# Auftragsdoku FlexPos NFK Vollverkabelung

Eigenständige, offline-fähige **PWA** für Servicetechniker: strukturierte
**Bilddokumentation** einer Baustelle direkt am Smartphone (Ergebnis: eine ZIP zum
Weitergeben) plus tägliches **Bautagebuch** als Excel-Datei (Optik 1:1 der Vorlage).
Kein Laptop, kein Backend, keine laufenden Kosten.

## Funktionsumfang

- **Projekt-Stammdaten** (einmalig): Filiale/Bauvorhaben, Ort, Datum, Beauftragung,
  Techniker – werden für Bilddoku **und** Bautagebuch verwendet.
- **Bilddokumentation**
  - Pflicht-Struktur aus Excel-Template importieren (`Oberordner | Unterordner | Bildname | Pflichtanzahl`, max. 2 Ebenen).
  - Eigene Bereiche/Namen im Feld anlegen – bleiben dauerhaft gespeichert und überstehen einen Template-Re-Import.
  - Pro Name Foto aufnehmen **oder** aus Galerie laden; automatische Komprimierung (lange Kante ≤ 2560 px, JPEG ~85 %, EXIF-Ausrichtung korrigiert).
  - Fortlaufende Benennung `<Bildname>_NN.jpg`; erledigte Positionen (Ist ≥ Pflicht) werden ausgegraut, weitere Bilder bleiben erlaubt (append-only, kein Löschen/Überschreiben).
  - Übersichts-Button: offene vs. erledigte Positionen.
  - **ZIP-Export** mit Template-Ordnerstruktur + `uebersicht.csv`; Weitergabe über den Android-Share-Dialog (Fallback: Download).
- **Bautagebuch**
  - Tagesweise Erfassung von Arbeitszeiten (bis 5 Techniker), Tätigkeiten, Behinderungen, besonderen Vorkommnissen.
  - Export als `.xlsx` – erzeugt durch **Befüllen der Originalvorlage** (`assets/vorlage_bautagebuch.xlsx`): Logo, Rahmen, Schriften, Layout und Blattschutz bleiben garantiert 1:1 erhalten.
  - Datum als echtes Datum, Zeiten als echte Uhrzeit-/Dauerwerte.
  - Dateiname nach Vorlagemuster: `Bautagebuch_LI<Filialnummer>_<Ort>_<YYYY_MM_DD>.xlsx`.
- **Offline & Persistenz**: Service Worker cached die komplette App; alle Daten (Stammdaten, Struktur, eigene Namen, Bilder, Bautagebuch-Eingaben) liegen in IndexedDB und überstehen Neustart/Offline.

## Technik

Reines HTML/CSS/JS, keine Build-Tools. Lokal eingebundene Bibliotheken (offline-fähig):

- **JSZip** – ZIP der Bilddoku **und** Patchen der Bautagebuch-Vorlage.
- **ExcelJS** – Lesen importierter Struktur-Templates (beliebige Excel-Dateien).
- **Canvas-API** (nativ) – Bildkomprimierung, kein Server.

> Hinweis zur Bautagebuch-Erzeugung: Statt die Vorlage mit ExcelJS neu zu schreiben,
> wird die Originaldatei als ZIP geöffnet und **nur** `xl/worksheets/sheet1.xml`
> (die Wertzellen) angepasst – alle übrigen Teile inkl. eingebettetem Logo bleiben
> byte-identisch. Das ist für die verbindliche „1:1-Optik" robuster als ein Neu-Schreiben.

## Dateien

```
index.html, css/styles.css        App-Shell + Styles
js/db.js                          IndexedDB
js/app.js                         Navigation, Projektkopf, Tree, Bautagebuch-Formular
js/template.js                    Struktur-Import (ExcelJS) + Merge eigener Namen
js/photos.js                      EXIF-Orientation, Komprimierung, Nummerierung
js/overview.js                    Status/Übersicht
js/export-zip.js                  ZIP-Export + Index-CSV + Share
js/bautagebuch.js                 Vorlagen-Befüllung + .xlsx-Export
lib/jszip.min.js, lib/exceljs.min.js
sw.js, manifest.webmanifest       PWA / Offline
assets/vorlage_bautagebuch.xlsx   Befüll-Vorlage (Original)
assets/beispiel_bilddoku_template.xlsx   Beispiel-Struktur (importierbar)
assets/icon-192.png, icon-512.png, logo.png
tools/                            Hilfsskripte (Vorlage/Icons erzeugen, Verifikation)
```

## Deployment (GitHub Pages)

Ein Service Worker und „Zum Startbildschirm hinzufügen" funktionieren nur über
**HTTPS** (nicht über `file://`). GitHub Pages ist kostenlos und statisch:

1. Neues GitHub-Repository anlegen und den **kompletten Ordnerinhalt** ins Repo-Root pushen
   (nicht in einen Unterordner – `index.html` muss im Root liegen).
2. Repo → **Settings → Pages** → *Source: Deploy from a branch* → Branch `main`, Ordner `/ (root)` → **Save**.
3. Nach ~1 Minute ist die App unter `https://<user>.github.io/<repo>/` erreichbar.
4. Auf dem Android-Smartphone die URL in Chrome öffnen → Menü **„Zur Startseite hinzufügen"**.
   Danach läuft die App vollständig offline.

Alternativen mit identischem Prinzip: Netlify, Cloudflare Pages (Ordner als statische Site hochladen).

## Lokal testen

```bash
py -m http.server 8766        # dann http://127.0.0.1:8766/ im Browser öffnen
```
(`localhost`/`127.0.0.1` gilt als sicherer Kontext, daher funktioniert der Service Worker
auch lokal.)

## Updates / Wartung

Bei Änderungen an App-Dateien die Cache-Version in [`sw.js`](sw.js) erhöhen
(`const CACHE = 'nfk-doku-v2'` …), damit Clients die neue Version laden.
Die Bilddoku-Struktur ändert man jederzeit über einen erneuten Template-Import –
selbst angelegte Namen bleiben erhalten.

## Hilfsskripte (`tools/`, optional, benötigen Python)

- `make_example_template.py` – erzeugt `assets/beispiel_bilddoku_template.xlsx`.
- `verify_bautagebuch.py` – repliziert die Befüll-Logik und prüft Zelltypen + Logo-Erhalt.
