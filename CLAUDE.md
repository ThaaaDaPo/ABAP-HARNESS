# ABAP-HARNESS

Plattform zum Anlegen, Verwalten und Betreiben von KI-Agenten über das GitHub Copilot SDK.
Zielbild: ein Agenten-Team, das Jira-Tickets verwaltet, Dokumentation schreibt, Reviews macht,
den Gesamtüberblick behält und selbständig ABAP im SAP-Entwicklungssystem entwickelt.

## Aktueller Stand

**Phase 1 läuft (seit 2026-11-13).** Phase 0 ist abgeschlossen (Prüfpaket auf dem
Firmenrechner erfolgreich). Phase 1, Schritt 1 ist am Firmenrechner abgenommen. Als Nächstes
Schritt 2 (MCP-Server, Tool-Gateway). Stand, Erkenntnisse und bekannte Lücken in
[docs/08-phase-1.md](docs/08-phase-1.md).
Aufbau des Codes: [README.md](README.md).

**Wichtige Randbedingung:** Gebaut wird auf Davids Privatrechner – hier gibt es kein SAP, kein
Jira, kein Confluence und keine Firmen-Copilot-Lizenz. Betrieben wird auf dem Firmenrechner
(Windows, dort kein Claude, npm über Nexus). Übertragung hin als ZIP ohne `node_modules`,
Rückmeldungen als Handyfotos oder QR-Text. SAP-Anbindungen können hier nicht getestet werden.
Das Copilot SDK würde hier technisch über Davids privaten GitHub-Login laufen – **das ist
untersagt (E-40). Hier keine echten Copilot-Sitzungen starten**, auch nicht das Prüfpaket mit
`pruefen:copilot` oder `pruefen` ausführen. Getestet wird nur gegen die simulierte Laufzeit.
Siehe [docs/07-roadmap.md](docs/07-roadmap.md) und [docs/08-phase-1.md](docs/08-phase-1.md).

## Einstieg für neue Chats

Zuerst diese Dateien lesen, in dieser Reihenfolge:

1. [docs/01-vision.md](docs/01-vision.md) – Ziel, Rahmenbedingungen, was gegeben ist
2. [docs/06-entscheidungen.md](docs/06-entscheidungen.md) – was entschieden ist (und was nur Vorschlag ist)
3. [docs/05-offene-fragen.md](docs/05-offene-fragen.md) – was noch geklärt werden muss
4. Bei Bedarf: [02-architektur](docs/02-architektur.md), [03-adt-integration](docs/03-adt-integration.md),
   [04-freigabe-postfach](docs/04-freigabe-postfach.md), [07-roadmap](docs/07-roadmap.md)

## Referenzcode

[pruefpaket/src/](pruefpaket/src/) ist auf dem Firmenrechner erfolgreich gelaufen und zeigt, wie
die Schnittstellen wirklich zu benutzen sind. Vor dem Bau der Anbindungen dort nachlesen statt
neu zu raten:

- `schritte-copilot.js` – Copilot SDK: Sitzung, eigene Tools, MCP-Server, `onPermissionRequest`,
  `onPreToolUse`, `resumeSession`
- `schritte-sap.js` – `abap-adt-api` mit Cookie-Sitzung: anlegen, Syntaxprüfung, sperren,
  speichern, aktivieren, Unit-Test, löschen
- `cookie.js` – SAP-Cookie über Edge holen
- `mini-mcp.js` – kleinster MCP-Server ohne Abhängigkeiten (Vorlage für Stellvertreter-Server)

Die installierten Pakete unter `pruefpaket/node_modules` enthalten README und Typen des SDK
(`@github/copilot-sdk/README.md`, `dist/types.d.ts`) – das ist die maßgebliche Doku.

## Vorgaben für den Code (David, 2026-11-13)

- **Sauber nach Ordnern gegliedert**, logisch nach Themen. Beispiel: ein Ordner `mcp/` mit je
  einem Unterordner pro MCP-Server.
- **Datei- und Ordnernamen möglichst deutsch** (z. B. `einstellungen.ts`, `seiten/ChatSeite.tsx`).
  Ausnahmen nur, wo Werkzeuge feste Namen verlangen (`package.json`, `vite.config.ts`,
  React-Hooks beginnen mit `use…`).
- **Lesbar und nicht zu kompliziert**: kurze Dateien mit einer Aufgabe, klare Namen, kein
  Framework-Zauber, keine unnötigen Abstraktionen. Kommentare erklären das Warum.
- Bezeichner im Code ebenfalls deutsch, soweit es lesbar bleibt.

## Arbeitsregeln

- Sprache mit David: Deutsch.
- Stack (festgelegt): Node.js, TypeScript, React.
- Planungsdokumente aktuell halten: Beantwortet David eine Frage, wandert sie aus
  `05-offene-fragen.md` als Entscheidung nach `06-entscheidungen.md`, und die betroffenen
  Fachdokumente werden angepasst.
- Vorschläge von Claude sind als „Vorschlag" markiert, bis David sie bestätigt.
