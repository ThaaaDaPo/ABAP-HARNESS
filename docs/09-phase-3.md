# 09 – Phase 3: ADT-MCP und ABAP-Entwickler

Status: **gestartet 2026-11-25. ADT-MCP gebaut, am Firmenrechner bestätigt: SSO, Anlegen,
Speichern, Aktivieren (Punkte 1–7). Seit 2026-11-27 dazu Vergleich nebeneinander und
„Rückgängig“ im Chat (E-64, E-65). Offen: Abnahmepunkte 8–13 und 15–17 – Checkliste unten.**
Phase 2 ist übersprungen (E-62).
Grundlage: [03-adt-integration](03-adt-integration.md), Entscheidungen E-11 bis E-14, E-20,
E-26 bis E-28, E-31, E-38, E-39, E-63 bis E-65.

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
- **Änderungssätze**: Jedes Speichern und Anlegen legt unter `abap/.adt/aenderungen/<nr>.json`
  Vorher und Nachher ab ([aenderungen.ts](../mcp/adt/aenderungen.ts)). Im Ergebnis steht nur
  die Nummer („Änderung 20261127-143205-a1b2 …“) – der Agent bekommt den Quelltext nicht doppelt.
  (Ersetzt den früheren Ordner `abap/.adt/verlauf/`.)
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

### Vergleich und Rückgängig im Chat (E-64, E-65, seit 2026-11-27)

- Unter jedem erfolgreichen `adt-speichern` steht der **Vergleich nebeneinander**: links vorher
  (gelöschte Zeilen rot), rechts nachher (hinzugefügte Zeilen grün), mit Zeilennummern; je
  geändertem Teil (bei Klassen z. B. Hauptteil und Testklassen) ein Vergleich. Gleiche Abschnitte
  sind bis auf 3 Zeilen um jede Änderung zugeklappt und lassen sich aufklappen
  ([Nebeneinander.tsx](../oberflaeche/komponenten/Nebeneinander.tsx),
  [AenderungsKarte.tsx](../oberflaeche/komponenten/AenderungsKarte.tsx)). Das gilt auch, wenn
  `speichern` über einen Vorschlag freigegeben wurde.
- Knopf **Rückgängig** (nach Sicherheitsabfrage, ohne KI): schreibt den alten Stand zurück und
  aktiviert ihn; die Datei im Workspace wird mit zurückgesetzt. Unter `adt-anlegen` heißt der Knopf
  **Objekt löschen** und löscht das Objekt im System – samt späterer Änderungen, die Abfrage sagt das.
- **Abgelehnt** wird, wenn das Objekt seit der Änderung noch einmal geändert wurde (vom Agenten
  oder in Eclipse): „Erst die neuere Änderung rückgängig machen.“ Dann ist im System nichts
  verändert. Ebenso außerhalb der freigegebenen Pakete und wenn die Änderung schon zurückgenommen ist.
- Gesperrt, solange der Agent in dem Chat arbeitet, wartet oder eingereiht ist – sonst schrieben
  App und Agent womöglich gleichzeitig.
- Im Verlauf steht danach eine Zeile („… zurückgeschrieben und aktiviert.“). Der Agent erfährt es
  mit Davids nächster Nachricht (`[Hinweis der App: …]` davor), damit er nicht mit dem alten Stand
  weiterarbeitet.
- Technik: Ausgeführt wird im ADT-MCP (Tool `zuruecknehmen`,
  [zuruecknehmen.ts](../mcp/adt/zuruecknehmen.ts)), damit SAP-Zugriff, Paket-Sperre und Workspace an
  einer Stelle bleiben. Das Tool gibt es nur, wenn die App den Server mit `--app` startet; Copilot
  startet ihn ohne, **der Agent sieht es nie**. Gelöscht wird wie im Prüfpaket (sperren,
  `deleteObject`).
- Drehbuch: Stichwort *Report* legt `ZHARNESS_DEMO` an, ändert, speichert und aktiviert – zum
  Ausprobieren von Vergleich, Rückgängig und Löschen im Übungssystem.

Auf dem Privatrechner geprüft (nur Übungssystem und Simulation, in einer getrennten Kopie mit
eigenem Datenordner): alle vier Drehbuch-Abläufe über den echten MCP-Prozess und das Gateway,
ADT-Formular mit Eingabeprüfung, Anmelden ohne Edge (verständlicher Fehler), interne Routen ohne
Schlüssel gesperrt, Auswahl der Cookies mit Chrome (headless). `npm test`: 61 Tests.
Am 2026-11-27 ebenso geprüft: Ablauf *Report* mit Freigabe, Vergleich unter Tool-Karte und
Vorschlagskarte, Rückgängig und Löschen (Knopf im Browser, Abfrage, Vermerk im Verlauf, Hinweis
an den Agenten), doppelter Klick, ungültige Nummer. `npm test`: 67 Tests.

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
- **Der ADT-MCP holt die Konfiguration bei jedem Aufruf** und baut sich bei einer Änderung neu
  auf. Copilot startet ihn je Sitzung neu, die App hält ihre eigenen Prozesse aber offen
  (Simulation, Freigaben, Rückgängig) – so gilt z. B. der Wechsel Übungssystem → SAP sofort.

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
- **Rückgängig**: Zurückschreiben und Aktivieren eines älteren Stands; bei neu angelegten
  Testklassen wird das Include mit leerem Quelltext gespeichert (ob SAP das annimmt, ist offen).
- **Löschen** (`deleteObject` nach Sperre) für Klasse, Programm, Funktionsbaustein und
  Funktionsgruppe – im Prüfpaket nur für ein Programm erprobt.

### Bekannte Lücken

- „Rückgängig“ gibt es im Chat, im Postfach (Workflows) erst mit Phase 4.
- Rückgängig betrifft nur Änderungen über `adt-speichern`/`adt-anlegen`. Was der Agent nur im
  Workspace geändert und nicht gespeichert hat, zeigt kein Vergleich (E-65).
- Transporte und Pakete außer `$TMP` erst nach Abstimmung (E-13, E-28).
- Parallele Chats teilen sich den Workspace; arbeiten zwei Chats am selben Objekt, schützt die
  Konflikterkennung beim Speichern, nicht aber die Dateien im Workspace.
- Das Zertifikat in Edge muss bei jeder Anmeldung angeklickt werden (Edge-Richtlinie
  `AutoSelectCertificateForUrls` wäre ein Weg, noch nicht untersucht).

### Pakete für Nexus

Neu im Hauptprojekt, aber schon vom Prüfpaket über Nexus geladen: `abap-adt-api` **10.0.0**
(samt Unterpaketen) und `playwright-core` **1.65.0**. Hinweis aus Phase 0: Zwei Unterpakete von
`abap-adt-api` verlangen Node ≥ 22.19; mit 22.16 lief es trotzdem.

### Befunde vom Firmenrechner

- 2026-11-25: SSO-Anmeldung und Verbindung stehen. Beim ersten `adt-anlegen` mit Regel *Freigabe*
  lehnte die zweite Sperre trotz Freigabe ab („Das Tool adt-adt-anlegen ist ohne Freigabe nicht
  erlaubt“): Copilot meldet in `onPermissionRequest` den Tool-Namen hier **mit** Server-Präfix.
  Behoben in [berechtigungen.ts](../server/laufzeit/copilot/berechtigungen.ts) (Präfix wird
  entfernt, beide Schreibweisen gehen).
- 2026-11-25: Anlegen und Speichern eines Reports klappen, die Datei liegt im Workspace.
  **Aktivieren** scheiterte mit „Prüfung der Bedingung fehlgeschlagen“ (von Hand ging es). Ursache
  vermutlich die Listenform von `activate` mit leerer `parentUri`. Umgestellt auf die im Prüfpaket
  bewährte Form (Name und URL, je Objekt); weitere inaktive Teile, die SAP nennt, werden mit SAPs
  eigenen Angaben nachaktiviert. **Danach geht es** (Rückmeldung David, 2026-11-25): Anlegen,
  Speichern und Aktivieren am echten System bestätigt.

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
14. Aufräumen: Die Testobjekte in Eclipse löschen (oder mit Punkt 17).

**C. Vergleich und Rückgängig (E-64, E-65)** – nach `git pull` und Neustart der App

15. Im Chat aus Punkt 8: unter `adt-speichern` steht der Vergleich nebeneinander, links rot was
    weg ist, rechts grün was neu ist → **Foto**.
16. **Rückgängig** an der letzten Speicherung von ZCL_HARNESS_ADT_TEST → Abfrage bestätigen →
    „… zurückgeschrieben und aktiviert.“; in Eclipse der alte Stand, aktiv. Dann Rückgängig an
    einer **älteren** Speicherung desselben Objekts, nachdem es in Eclipse geändert wurde →
    „Erst die neuere Änderung rückgängig machen“, nichts überschrieben.
17. **Objekt löschen** unter dem `adt-anlegen` von ZHARNESS_ADT_TEST → Abfrage → gelöscht, in
    Eclipse weg. Danach im Chat „Was ist der Stand?“ – der Agent weiß, dass das Objekt gelöscht ist.

**Bitte zurückmelden** (je Nummer ok / nicht ok): 1–17. Fotos: 1, 4, 9, 15, bei Fehlern Terminal
und Browser (die Tool-Karte bzw. die Änderungskarte zeigt die Fehlermeldung von SAP).
