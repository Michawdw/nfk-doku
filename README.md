# Auftragsdoku FlexPos NFK Vollverkabelung

Eigenständige, offline-fähige **PWA** für Servicetechniker: strukturierte
**Bilddokumentation** einer Baustelle direkt am Smartphone (Ergebnis: eine ZIP zum
Weitergeben) plus tägliches **Bautagebuch** als Excel-Datei (Optik 1:1 der Vorlage).
Kein Laptop, kein Backend, keine laufenden Kosten.

## Funktionsumfang

- **Mehrere Aufträge**: Auf der Startseite werden Aufträge als Liste geführt
  („+ Neuer Auftrag", antippen zum Wechseln, ✎ zum Umbenennen). Jeder Auftrag hat eigene
  Stammdaten, Bilddoku-Struktur, Bilder und Bautagebuch-Tage. Baustellen über Wochen/mit
  Unterbrechungen bleiben so getrennt und jederzeit abrufbar.
- **Projekt-Stammdaten** (je Auftrag): Filiale/Bauvorhaben, Ort, Datum, Beauftragung,
  Techniker – werden für Bilddoku **und** Bautagebuch des Auftrags verwendet.
- **Bildersicherheit**: Bilder liegen in IndexedDB; die App fordert beim Start
  **persistenten Speicher** an (Schutz vor automatischer Löschung). Echtes Backup =
  regelmäßiger **Bild-ZIP-Export** (enthält die Fotos). Beim Deinstallieren der App oder
  Löschen der Browserdaten gehen lokale Daten verloren – daher vor solchen Aktionen ZIP
  exportieren.
- **Übergabe an anderes Team / Innendienst-Auswertung**: „Übergabe export (.xlsx)" erzeugt
  eine kleine Excel-Datei mit dem Zwischenstand (Position, Pflicht, Ist, Status) **ohne
  Bilder**. Der Innendienst kann sie direkt auswerten; ein anderes Team importiert sie per
  „Übergabe import" → sieht offene/erledigte Pflichtbilder und die **Foto-Nummerierung läuft
  nahtlos weiter** (`_03`, `_04`, …), sodass keine Doppelbilder entstehen und die Bild-ZIPs
  beider Teams im Büro kollisionsfrei zusammenpassen. (Sequenzielle Übergabe: Team A →
  Team B, kein gleichzeitiges Parallel-Arbeiten am selben Auftrag.)
- **Bilddokumentation**
  - **Vorlagen-Katalog**: Mehrere Vorlagen stecken als Tabs in einer Datei
    (`assets/templates.xlsx`); jeder Tab = eine Vorlage, der Tab-Name ist der
    Anzeigename. Beim ersten Öffnen wird die erste Vorlage automatisch geladen;
    über das Dropdown „Vorlage" kann gewechselt werden (Spalten je Tab:
    `Oberordner | Unterordner | Bildname | Pflichtanzahl`, max. 2 Ebenen).
  - **Neue Vorlage hinzufügen**: in `templates.xlsx` einen weiteren Tab anlegen,
    die 4 Spalten ausfüllen, Datei neu zu GitHub hochladen – sie erscheint dann
    automatisch in der Auswahl (online; danach auch offline verfügbar). Mit dem
    ↻-Knopf lässt sich die Liste manuell aktualisieren.
  - Zusätzlich kann jederzeit eine **eigene externe `.xlsx`** importiert werden
    (Knopf „Eigene Excel…", erstes Blatt).
  - Eigene Bereiche/Namen im Feld anlegen – bleiben dauerhaft gespeichert und
    bleiben beim Wechsel der Vorlage erhalten.
  - Pro Name Foto aufnehmen **oder** aus Galerie laden; automatische Komprimierung (lange Kante ≤ 2560 px, JPEG ~85 %, EXIF-Ausrichtung korrigiert).
  - Fortlaufende Benennung `<Bildname>_NN.jpg`; erledigte Positionen (Ist ≥ Pflicht) werden ausgegraut, weitere Bilder bleiben erlaubt (append-only, kein Löschen/Überschreiben).
  - **Ein-/ausklappbarer Baum**: standardmäßig sind nur die Oberordner sichtbar (je mit
    Status-Badge „erledigt/gesamt"). Antippen öffnet einen Oberordner (zeigt Unterordner/
    Positionen); Unterordner sind ebenso auf-/zuklappbar – für bessere Übersicht am Handy.
    Ist ein Ordner (inkl. seiner Unterordner) **komplett erledigt**, wird er verblasst und
    mit einem **grünen Haken ✓** markiert.
  - Übersichts-Button: offene vs. erledigte Positionen.
  - **ZIP-Export** mit Template-Ordnerstruktur + `uebersicht.csv` + `manifest.json`
    (maschinenlesbare Bild→Position-Zuordnung); Weitergabe über den Android-Share-Dialog
    (Fallback: Download).
- **Mehrere Techniker auf einer Baustelle (Beiträge zusammenführen)**
  - Ablauf: Jeder Techniker fotografiert **offline** auf seinem Gerät (gleiche Vorlage),
    exportiert am Tagesende seine **Bilder-ZIP** und schickt sie dem Vorarbeiter
    (z. B. WhatsApp **als Datei/Dokument**, nicht „als Foto" – sonst komprimiert WhatsApp).
  - Der Vorarbeiter tippt **„🔗 Beiträge zusammenführen"** und wählt die erhaltene ZIP →
    die Bilder werden seinem Auftrag **pro Position angehängt und fortlaufend
    weiternummeriert** (`_03`, `_04`, …), fehlende Positionen werden ergänzt, die Übersicht
    aktualisiert sich. **Duplikatschutz**: dieselbe ZIP mehrfach einlesen fügt nichts doppelt
    hinzu (eindeutige Bild-ID). Vorhandene Bilder werden nie umbenannt/überschrieben.
  - Am Ende exportiert der Vorarbeiter die **vollständige Bilder-ZIP** fürs Büro.
  - Hinweis: WhatsApp-Dateilimit ~100 MB; bei sehr vielen Bildern in mehreren Sendungen
    oder über Google Drive/E-Mail teilen. Bereichsaufteilung der Techniker ist sinnvoll,
    aber dank Weiternummerierung nicht zwingend.
- **Bautagebuch**
  - Tagesweise Erfassung von Arbeitszeiten (bis 5 Techniker), Tätigkeiten, Behinderungen, besonderen Vorkommnissen.
  - Export als `.xlsx` – erzeugt durch **Befüllen der Originalvorlage** (`assets/vorlage_bautagebuch.xlsx`): Logo, Rahmen, Schriften, Layout und Blattschutz bleiben garantiert 1:1 erhalten.
  - Datum als echtes Datum, Zeiten als echte Uhrzeit-/Dauerwerte.
  - Dateiname nach Vorlagemuster: `Bautagebuch_LI<Filialnummer>_<Ort>_<YYYY_MM_DD>.xlsx`.
  - **Archiv pro Auftrag**: oben in der Bautagebuch-Ansicht sind alle gespeicherten Tage
    gelistet (neueste zuerst). Ein Tag lässt sich antippen, um ihn wieder ins Formular zu
    laden und **nachträglich zu bearbeiten** (z. B. Ergänzungen in älteren Bautagebüchern),
    oder über 🗑 **mit Sicherheitsabfrage löschen**.
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
js/handover.js                    Übergabe-/Übersicht-Excel: Export + Import
js/merge.js                       Beiträge mehrerer Geräte zusammenführen (ZIP-Merge)
lib/jszip.min.js, lib/exceljs.min.js
sw.js, manifest.webmanifest       PWA / Offline
assets/vorlage_bautagebuch.xlsx   Befüll-Vorlage (Original)
assets/templates.xlsx             Vorlagen-Katalog (jeder Tab = eine Vorlage)
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

- `make_templates.py` – erzeugt den Vorlagen-Katalog `assets/templates.xlsx`.
- `verify_bautagebuch.py` – repliziert die Befüll-Logik und prüft Zelltypen + Logo-Erhalt.
