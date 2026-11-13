# ABAP-HARNESS

KI-Plattform mit Harness für die ABAP-Entwicklung: Agenten über das GitHub Copilot SDK anlegen,
verwalten und betreiben.

Stand: **Phase 1, Schritt 2** – Chat mit einem Agenten, Live-Ansicht, Simulation,
Copilot-Anbindung, MCP-Server und Tool-Gateway mit Regeln je Tool. Planung und Entscheidungen
stehen in [docs/](docs/).

## Starten

Voraussetzung: Node.js ab 22.16.

```
npm install
npm start
```

Dann im Browser `http://localhost:4711` öffnen. Die App ist nur auf diesem Rechner erreichbar.

Ohne `einstellungen.json` läuft sie im **Simulationsmodus**: Statt eines echten Modells spielt sie
ein Drehbuch ab ([server/laufzeit/simulation/drehbuch.json](server/laufzeit/simulation/drehbuch.json)).

### Mit echtem Copilot

1. Copilot anmelden: `npx @github/copilot` starten, dort `/login`, danach `/exit`.
2. `copy einstellungen.beispiel.json einstellungen.json` und darin ändern:
   - `"modus": "copilot"`
   - `"workspaceOrdner"`: der Ordner, in dem der Agent arbeiten darf, z. B. `"D:/agenten-workspace"`
     (Schrägstriche `/` oder doppelte `\\` verwenden)
   - `"modell"`: leer lassen für automatische Auswahl
3. `npm start`

Der Agent darf Dateien nur im Workspace-Ordner lesen und schreiben. Shell-Befehle und
Internetzugriff sind gesperrt.

### MCP-Server und Regeln

Auf der Seite **MCP-Server** werden Server mit ihrem Startbefehl eingetragen; die App liest
deren Tools aus. Je Tool gilt eine Regel:

| Regel | Wirkung |
|---|---|
| Erlauben | wird ausgeführt |
| Erlauben + melden | wird ausgeführt, Meldung im Postfach |
| Freigabe nötig | wird nicht ausgeführt, sondern als Vorschlag ins Postfach gelegt |
| Verbieten | wird dem Agenten nicht angeboten und abgelehnt |

Beim ersten Start sind zwei Stellvertreter-Server eingetragen (SAP, Jira/Confluence) mit
Beispieldaten. Sie funktionieren in der Simulation und mit echtem Copilot und können gelöscht
werden.

## Befehle

| Befehl | Wirkung |
|---|---|
| `npm start` | App starten |
| `npm run entwickeln` | wie `start`, startet bei Änderungen am Server neu |
| `npm test` | prüft Tool-Gateway, MCP-Client und Berechtigungsregeln |
| `npm run typpruefung` | TypeScript-Prüfung von Server und Oberfläche |

## Ordner

```
server/                 Backend (Node, TypeScript – wird ohne Bau-Schritt direkt ausgeführt)
  start.ts              Einstieg
  einstellungen.ts      liest einstellungen.json
  datenbank/            SQLite: Aufgaben, Ereignisse, MCP-Server, Regeln, Postfach
  laufzeit/             Agenten-Laufzeit, austauschbar
    laufzeit.ts         die gemeinsame Schnittstelle
    copilot/            echtes Copilot SDK, Berechtigungsregeln, Gateway-Hooks
    simulation/         Drehbuch statt Modell
  gateway/              Tool-Gateway: entscheidet je Aufruf nach der Regel des Tools
  mcp/                  MCP-Server verwalten, eigener kleiner MCP-Client, Stellvertreter eintragen
  chat/                 Ablauf Nachricht → Agent → Anzeige, Live-Verteilung
  http/                 HTTP-Server und Routen
oberflaeche/            React-Oberfläche
  seiten/               ganze Seiten
  komponenten/          Bausteine der Seiten
  live/                 Live-Ereignisse vom Server
gemeinsam/              Typen, die Server und Oberfläche teilen
mcp/                    MCP-Server, je einer pro Unterordner (Stellvertreter, später ADT)
pruefpaket/             Phase 0: Prüfung von Copilot und ADT auf dem Firmenrechner
docs/                   Planung, Entscheidungen, offene Fragen
daten/                  Datenbank und Standard-Workspace (wird angelegt, nicht im Repo)
```

## Pakete für Nexus

Neben den Paketen aus `package.json` lädt npm plattformabhängige Pakete. Unter Windows:
`@github/copilot-sdk-win32-x64`, `@rolldown/binding-win32-x64-msvc`,
`lightningcss-win32-x64-msvc`.
