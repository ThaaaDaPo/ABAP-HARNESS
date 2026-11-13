# ABAP-HARNESS

KI-Plattform mit Harness für die ABAP-Entwicklung: Agenten über das GitHub Copilot SDK anlegen,
verwalten und betreiben.

Stand: **Phase 1, Schritt 1** – Chat mit einem Agenten, Live-Ansicht, Simulation und
Copilot-Anbindung. Planung und Entscheidungen stehen in [docs/](docs/).

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

## Befehle

| Befehl | Wirkung |
|---|---|
| `npm start` | App starten |
| `npm run entwickeln` | wie `start`, startet bei Änderungen am Server neu |
| `npm test` | prüft die Berechtigungsregeln |
| `npm run typpruefung` | TypeScript-Prüfung von Server und Oberfläche |

## Ordner

```
server/                 Backend (Node, TypeScript – wird ohne Bau-Schritt direkt ausgeführt)
  start.ts              Einstieg
  einstellungen.ts      liest einstellungen.json
  datenbank/            SQLite: Aufgaben und ihre Ereignisse
  laufzeit/             Agenten-Laufzeit, austauschbar
    laufzeit.ts         die gemeinsame Schnittstelle
    copilot/            echtes Copilot SDK, Berechtigungsregeln
    simulation/         Drehbuch statt Modell
  chat/                 Ablauf Nachricht → Agent → Anzeige, Live-Verteilung
  http/                 HTTP-Server und Routen
oberflaeche/            React-Oberfläche
  seiten/               ganze Seiten
  komponenten/          Bausteine der Seiten
  live/                 Live-Ereignisse vom Server
gemeinsam/              Typen, die Server und Oberfläche teilen
mcp/                    MCP-Server, je einer pro Unterordner (ab Schritt 2)
pruefpaket/             Phase 0: Prüfung von Copilot und ADT auf dem Firmenrechner
docs/                   Planung, Entscheidungen, offene Fragen
daten/                  Datenbank und Standard-Workspace (wird angelegt, nicht im Repo)
```

## Pakete für Nexus

Neben den Paketen aus `package.json` lädt npm plattformabhängige Pakete. Unter Windows:
`@github/copilot-sdk-win32-x64`, `@rolldown/binding-win32-x64-msvc`,
`lightningcss-win32-x64-msvc`.
