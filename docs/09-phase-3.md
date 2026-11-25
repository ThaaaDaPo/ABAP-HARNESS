# 09 – Phase 3: ADT-MCP und ABAP-Entwickler

Status: **gestartet 2026-11-25. ADT-MCP gebaut (Übungssystem auf dem Privatrechner geprüft),
Abnahme am Firmenrechner steht aus – Checkliste unten.** Phase 2 ist übersprungen (E-62).
Grundlage: [03-adt-integration](03-adt-integration.md), Entscheidungen E-11 bis E-14, E-20,
E-26 bis E-28, E-31, E-38, E-39, E-63.

## Stand (2026-11-25)

### Der ADT-MCP ([mcp/adt/](../mcp/adt/))

Ein eigener MCP-Server, der über die ADT-Schnittstelle des SAP-Systems entwickelt – ohne Eclipse
(V-01). Die App trägt ihn als **eingebauten Server** mit dem Schlüssel `adt` ein; seine Tools
heißen für den Agenten `adt-…`.

| Tool | Wirkung |
|---|---|
| `auschecken` | Quelltext als Dateien in den Workspace (`<workspace>/abap/`, Namen wie abapGit: `zcl_x.clas.abap`, `zcl_x.clas.testclasses.abap`, `z_prog.prog.abap`, `z_fb.func.abap`). Schützt ungespeicherte Änderungen |
| `pruefen` | Syntaxprüfung des Stands im Workspace gegen das System, ohne zu speichern; Fehler mit Zeile und Quelltextzeile |
| `speichern` | prüft selbst die Syntax (bei Fehlern kein Speichern, V-03), erkennt Änderungen im System seit dem Auschecken, sperrt kurz, speichert inaktiv, entsperrt; legt fehlende Testklassen an; Ergebnis mit **Vorher/Nachher** |
| `aktivieren` | ein oder mehrere Objekte zusammen |
| `anlegen` | Klasse, Interface, Programm, Funktionsgruppe, Funktionsbaustein (in einer Gruppe); danach gleich ausgecheckt |
| `unit_tests` | ABAP Unit der aktiven Version |
| `atc_pruefen` | ATC mit eingestellter oder System-Prüfvariante |

- **Paket-Sperre** (V-11, E-28): anlegen, speichern, aktivieren nur in den eingestellten Paketen
  (Start `$TMP`) – im Tool geprüft, nicht im Prompt. Lesen und Auschecken gehen überall.
- **Vorher-Stand** jedes Speicherns liegt unter `abap/.adt/verlauf/` (für „Rückgängig“, E-31).
- **Gegenstelle austauschbar** (V-12): das SAP-System über `abap-adt-api` 10.0.0
  ([sap-gegenstelle.ts](../mcp/adt/sap-gegenstelle.ts), nach dem Prüfpaket) oder ein
  **Übungssystem** ([simulierte-gegenstelle.ts](../mcp/adt/simulierte-gegenstelle.ts)) mit
  Beispielobjekten: `ZCL_KUNDEN_SERVICE`, `ZIF_KUNDEN_LESER`, `ZKUNDEN`/`Z_KUNDE_LESEN` in `$TMP`,
  `Z_KUNDEN_LISTE` in `ZVERTRIEB` (zeigt die Paket-Sperre). Einfache Syntaxprüfung: ein Bezeichner
  mit „unbekannt“ ist ein Fehler, ebenso ein fehlender Punkt am Ende.

### In der App (E-63)

- Seite **MCP-Server → ADT (ABAP entwickeln)**: eigenes Formular statt Startbefehl – Gegenstelle
  (Übungssystem / SAP-System), SAP-Adresse, Mandant, Sprache, Pakete, ATC-Prüfvariante, unter
  „erweitert“ Anmelde-Cookies und Pfad zu Edge. Gespeichert in der Datenbank. Den Startbefehl
  setzt die App bei jedem Start selbst; der Eintrag lässt sich nicht löschen.
- **Anmeldung nur per SSO**, ohne Benutzer und Passwort: Die App öffnet Edge mit der SAP-Adresse
  und wartet bis zu 3 Minuten auf das Anmelde-Cookie (wie der SAP-MCP-Proxy, E-38). Das passiert
  **einmal für alle Chats** – die ADT-MCP-Prozesse (Copilot startet je Sitzung einen) holen das
  Cookie bei der App. Es liegt nur im Speicher der App. Den SAP-Benutzer meldet SAP nach der
  Anmeldung selbst.
- Knöpfe **Anmelden (Edge)**, **Verbindung testen** (zeigt Benutzer, System, Mandant),
  **Abmelden**. Läuft das Cookie ab, meldet die App neu an; der Tool-Aufruf des Agenten wartet so
  lange (V-16).
- **Einrichtung**: Zeilen für ADT, Edge und SAP-Anmeldung.
- Simulation (Drehbuch): Stichwörter *entwickle*, *Syntaxfehler*, *Kundenliste*, *Testklasse*
  spielen ADT-Abläufe gegen das Übungssystem ab; das Drehbuch kann dafür Dateien im Workspace
  schreiben (wie das Datei-Werkzeug von Copilot).

Auf dem Privatrechner geprüft (nur Übungssystem und Simulation, in einer getrennten Kopie mit
eigenem Datenordner): alle vier Drehbuch-Abläufe über den echten MCP-Prozess und das Gateway,
ADT-Formular mit Eingabeprüfung, Anmelden ohne Edge (verständlicher Fehler), interne Routen ohne
Schlüssel gesperrt, Auswahl der Cookies mit Chrome (headless). `npm test`: 61 Tests.

### Festlegungen (Vorschlag)

- **Tool-Namen deutsch** (`auschecken` statt `checkout`) – passt zu deutschen Aufträgen; die
  Stellvertreter-Erfahrung (Schritt 2) zeigt, dass das Modell dann die richtigen Tools wählt.
- **Werkzeuge arbeiten mit Namen**, nicht mit Dateipfaden: `pruefen`/`speichern` nehmen alle
  geänderten Dateien des Objekts.
- **Konfiguration in der App**, nicht in `einstellungen.json` (E-63). Der ADT-MCP holt sie und das
  Cookie über `http://127.0.0.1:<port>/api/adt/intern/…` mit einem Schlüssel, den die App bei jedem
  Start neu in `daten/adt/zugang.json` schreibt.
- **Cookies**: Edge-Cookies nur für die ADT-Adresse; gibt es ein SSO-Ticket (`MYSAPSSO2`), bekommt
  der ADT-MCP nur das Ticket, keine Sitzungs-Cookies – sonst würden sich mehrere ADT-MCP-Prozesse
  eine SAP-Sitzung (und deren Sperren) teilen.
- **Kein Agent bekommt den ADT-MCP automatisch.** Empfohlene Regeln für einen ABAP-Entwickler
  (E-12, E-20): alle Tools *Erlauben*, `speichern` und `anlegen` *Erlauben + melden*.
- **Rückgängig** in der App ist noch nicht gebaut (offene Frage M1); der Vorher-Stand wird schon
  abgelegt, Vorher/Nachher steht im Ergebnis von `speichern`.

### Annahmen, die erst am Firmenrechner geprüft werden können

Vom Prüfpaket bestätigt: Cookie-Sitzung, Suchen, Programm anlegen, Syntaxprüfung mit
ungespeichertem Quelltext, Sperren/Speichern/Entsperren, Aktivieren, ABAP Unit, Löschen.
Neu und ungeprüft:

- SSO ohne konfigurierten Benutzer (die Bibliothek bekommt den Platzhalter „SSO“; den echten
  Benutzer liefert `getSystemInformation`).
- Nur das SSO-Ticket an den ADT-MCP (ohne `SAP_SESSIONID_*`) reicht für ADT. Falls nicht: Punkt 4
  schlägt fehl → Foto.
- **Klassen**: Lesen der Includes (`/includes/testclasses` …), Syntaxprüfung eines Includes mit der
  Klasse als Prüfobjekt, Anlegen der Testklassen (`createTestInclude`).
- Interfaces und Funktionsbausteine: Suche liefert Paket bzw. Gruppe; Anlegen von Funktionsgruppe
  und -baustein.
- Mehrere Objekte zusammen aktivieren.
- ATC: Prüfvariante aus `atcCustomizing` (`systemCheckVariant`), Lauf und Befunde.
- Abgelaufenes Cookie: Die Bibliothek erkennt es, die App öffnet Edge erneut, der Aufruf läuft
  danach weiter.
- Copilot startet den ADT-MCP mit vollem Node-Pfad (`process.execPath`) und dem Projektpfad.

### Bekannte Lücken

- „Rückgängig“ in der App (E-31) fehlt noch.
- Transporte und Pakete außer `$TMP` erst nach Abstimmung (E-13, E-28).
- Parallele Chats teilen sich den Workspace; arbeiten zwei Chats am selben Objekt, schützt die
  Konflikterkennung beim Speichern, nicht aber die Dateien im Workspace.
- Das Zertifikat in Edge muss bei jeder Anmeldung angeklickt werden (Edge-Richtlinie
  `AutoSelectCertificateForUrls` wäre ein Weg, noch nicht untersucht).

### Pakete für Nexus

Neu im Hauptprojekt, aber schon vom Prüfpaket über Nexus geladen: `abap-adt-api` **10.0.0**
(samt Unterpaketen) und `playwright-core` **1.65.0**. Hinweis aus Phase 0: Zwei Unterpakete von
`abap-adt-api` verlangen Node ≥ 22.19; mit 22.16 lief es trotzdem.

## Abnahme ADT-MCP auf dem Firmenrechner

Sinnvoll nach der Abnahme von Schritt 4 (08-phase-1.md) oder zusammen damit.

**Vorbereitung**

- `git pull`, `npm ci` (oder `npm install`), App starten.
- Seite **MCP-Server**: Eintrag „ADT (ABAP entwickeln)“ mit Marke *eingebaut* und 7 Tools.
- Seite **Agenten**: neuer Agent „ABAP-Entwickler“, Auftrag z. B. „Du entwickelst ABAP über die
  ADT-Tools im Paket $TMP. Antworte auf Deutsch.“, Server **ADT** und den **SAP-MCP** (zum Lesen)
  anhaken, Speichern. Regeln für ADT: Standardregel *Erlauben*, `speichern` und `anlegen`
  *Erlauben + melden*.

**A. Übungssystem (ohne SAP, mit echtem Copilot)**

1. MCP-Server → ADT: Gegenstelle „Übungssystem“ (Standard). Chat mit dem ABAP-Entwickler:
   „Checke ZCL_KUNDEN_SERVICE aus und ergänze eine Methode GET_NAME, die NAME1 aus KNA1 liest.
   Prüfen, speichern, aktivieren.“ → Tool-Karten `adt-auschecken`, Datei-Werkzeug, `adt-pruefen`,
   `adt-speichern` (mit Vorher/Nachher), `adt-aktivieren`. Prüft vor allem, ob das Modell den
   Ablauf versteht → **Foto** der Tool-Karten.
2. „Ändere Z_KUNDEN_LISTE so, dass 20 Zeilen gelesen werden“ → `adt-speichern` lehnt ab (Paket
   ZVERTRIEB); der Agent sagt das und sucht keinen Umweg.

**B. Echtes System**

3. MCP-Server → ADT: „SAP-System“, SAP-Adresse (zuerst die des SAP-MCP-Proxys wie im Prüfpaket),
   Mandant 010, Speichern. **Anmelden (Edge)** → Edge geht auf, Zertifikat wählen → „angemeldet“.
4. **Verbindung testen** → „Angemeldet als … – System B1E, Mandant 010“ → **Foto**. Wenn nicht:
   Adresse `https://<host>:<port>/sap/bc/adt/` probieren (offene Frage M2).
5. Einrichtung: Zeilen ADT, Edge, SAP-Anmeldung grün.
6. Chat: „Lege in $TMP einen Report ZHARNESS_ADT_TEST an, der ‚Hallo‘ ausgibt, prüfe, speichere
   und aktiviere ihn.“ → `adt-anlegen` … `adt-aktivieren` erfolgreich; in SE80/Eclipse sichtbar.
7. „Baue in ZHARNESS_ADT_TEST absichtlich einen Syntaxfehler ein und speichere“ → `adt-speichern`
   „Nicht gespeichert – Syntaxfehler … Zeile …“; in Eclipse unverändert.
8. „Lege eine Klasse ZCL_HARNESS_ADT_TEST mit einer Methode ADDIERE und einer Testklasse an,
   aktiviere sie und führe die Unit-Tests aus“ → Testklassen-Datei, `adt-unit_tests` erfolgreich.
   (Prüft Klassen-Includes und `createTestInclude`.)
9. „Führe ATC für ZCL_HARNESS_ADT_TEST aus“ → Befunde oder „ohne Befunde“ → **Foto**.
10. „Lege eine Funktionsgruppe ZHARNESS_FG und darin den Funktionsbaustein Z_HARNESS_FB an,
    aktiviere beides.“
11. Konflikt: ZHARNESS_ADT_TEST auschecken lassen, dann in Eclipse ändern und aktivieren, dann
    im Chat „Ergänze einen Kommentar und speichere“ → `adt-speichern` meldet die Änderung im
    System und überschreibt nichts.
12. Zwei Chats gleichzeitig mit dem ABAP-Entwickler (z. B. Punkt 6 und 9 mit anderen Namen) →
    Edge geht höchstens einmal auf.
13. App neu starten, dann im Chat etwas speichern lassen → Edge geht auf (neue Anmeldung), danach
    läuft der Aufruf weiter.
14. Aufräumen: Die Testobjekte in Eclipse löschen (der ADT-MCP kann nicht löschen).

**Bitte zurückmelden** (je Nummer ok / nicht ok): 1–14. Fotos: 1, 4, 9, bei Fehlern Terminal und
Browser (die Tool-Karte zeigt die Fehlermeldung von SAP).
