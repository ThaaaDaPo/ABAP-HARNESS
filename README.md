# ABAP-HARNESS

KI-Plattform mit Harness für die ABAP-Entwicklung: Agenten über das GitHub Copilot SDK anlegen,
verwalten und betreiben.

Stand: **Phase 1, Schritt 4** – Agenten mit eigenem Auftrag, Modell, MCP-Servern, Regeln je Tool,
Instructions und Skills; Chats mit Live-Ansicht (Markdown), Agent und Modell je Chat wählbar,
Chats laufen gleichzeitig; Freigaben und Rückfragen im Chat; Verbrauchsanzeige; Einrichtungsseite;
Simulation und Copilot-Anbindung. Das Postfach für Workflows ist gebaut, aber bis Phase 4 ausgegraut.
Dazu **Phase 3**: der ADT-MCP zum Entwickeln von ABAP (siehe unten).
Planung und Entscheidungen stehen in [docs/](docs/).

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
   - `"instructionsOrdner"`: Ordner mit `*.instructions.md` und Skill-Ordnern (je mit `SKILL.md`)
   - `"modell"` und `"agent"`: nur für den allerersten Start – daraus entsteht der Agent „standard“.
     Danach werden Agenten in der App eingestellt.
3. `npm start`, dann die Seite **Einrichtung** öffnen: Sie zeigt, ob alles da ist.

Der Agent darf Dateien nur im Workspace-Ordner lesen und schreiben. Shell-Befehle und
Internetzugriff sind gesperrt.

### Agenten, MCP-Server und Regeln

Auf der Seite **MCP-Server** werden Server mit ihrem Startbefehl eingetragen; die App liest
deren Tools aus. Auf der Seite **Agenten** bekommt jeder Agent seine Server (anhaken) und je Tool
eine Regel:

| Regel | Wirkung |
|---|---|
| Erlauben | wird ausgeführt |
| Erlauben + melden | wird ausgeführt und gemeldet |
| Freigabe nötig | wartet im Chat als Vorschlag, bis du freigibst, verwirfst oder Änderungen wünschst |
| Verbieten | wird dem Agenten nicht angeboten und abgelehnt |

Server, die einem Agenten nicht zugeordnet sind, kann er nicht benutzen. Welcher Agent einen Chat
bearbeitet, steht über dem Chat und lässt sich jederzeit wechseln.

### ABAP entwickeln (ADT-MCP)

Eingebaut ist der Server **ADT (ABAP entwickeln)** ([mcp/adt/](mcp/adt/)). Unter **MCP-Server →
ADT** stellst du SAP-Adresse, Mandant und die Pakete ein, in denen der Agent ändern darf (Start:
`$TMP`). Angemeldet wird nur per SSO: Die App öffnet Edge, du meldest dich dort an (ggf.
Zertifikat). Ohne SAP gibt es ein Übungssystem. Damit ein Agent ABAP entwickeln kann, auf der
Seite **Agenten** den Server ADT anhaken und die Regeln setzen. Details:
[docs/09-phase-3.md](docs/09-phase-3.md).

Beim ersten Start sind zwei Stellvertreter-Server eingetragen (SAP, Jira/Confluence) mit
Beispieldaten. Sie funktionieren in der Simulation und mit echtem Copilot und können gelöscht
werden.

## Befehle

| Befehl | Wirkung |
|---|---|
| `npm start` | App starten |
| `npm run entwickeln` | wie `start`, startet bei Änderungen am Server neu |
| `npm test` | prüft Tool-Gateway, MCP-Client, Berechtigungsregeln, Postfach, Warteschlange, Agenten, Instructions, Verbrauch und den ADT-MCP |
| `npm run typpruefung` | TypeScript-Prüfung von Server und Oberfläche |

## Ordner

```
server/                 Backend (Node, TypeScript – wird ohne Bau-Schritt direkt ausgeführt)
  start.ts              Einstieg
  einstellungen.ts      liest einstellungen.json
  datenbank/            SQLite: Aufgaben, Ereignisse, Agenten, MCP-Server, Regeln, Postfach, Warteschlange, Verbrauch
  agenten/              Agenten verwalten: Standard-Agent beim ersten Start, prüfen, kopieren, löschen
  instructions/         Instructions-Ordner lesen und bearbeiten (*.instructions.md, Skills mit SKILL.md)
  einrichtung/          Prüfungen für die Einrichtungsseite
  adt/                  ADT in der App: Konfiguration, SSO-Anmeldung über Edge, eingebauter Server
  laufzeit/             Agenten-Laufzeit, austauschbar
    laufzeit.ts         die gemeinsame Schnittstelle
    copilot/            echtes Copilot SDK, Berechtigungsregeln, Gateway-Hooks
    simulation/         Drehbuch statt Modell
  gateway/              Tool-Gateway: entscheidet je Aufruf nach der Regel des Tools
  mcp/                  MCP-Server verwalten, eigener kleiner MCP-Client, Aufrufe ohne Agent, Stellvertreter
  postfach/             Aktionen im Postfach (freigeben, verwerfen, antworten), Plattform-Tools des Agenten
  chat/                 Ablauf Nachricht → Warteschlange → Agent → Anzeige, Live-Verteilung
  http/                 HTTP-Server und Routen
oberflaeche/            React-Oberfläche
  seiten/               ganze Seiten
  komponenten/          Bausteine der Seiten
  live/                 Live-Ereignisse vom Server
gemeinsam/              Typen, die Server und Oberfläche teilen
mcp/                    MCP-Server, je einer pro Unterordner (Stellvertreter, später ADT)
pruefpaket/             Phase 0: Prüfung von Copilot und ADT auf dem Firmenrechner
docs/                   Planung, Entscheidungen, offene Fragen
daten/                  Datenbank, Standard-Workspace und Standard-Instructions-Ordner (wird angelegt, nicht im Repo)
```

## Pakete für Nexus

Neben den Paketen aus `package.json` lädt npm plattformabhängige Pakete. Unter Windows:
`@github/copilot-sdk-win32-x64`, `@rolldown/binding-win32-x64-msvc`,
`lightningcss-win32-x64-msvc`.

Neu in Schritt 4 (Markdown im Chat): `marked` 18.2.1, `dompurify` 3.4.18 und dessen Abhängigkeit
`@types/trusted-types` 2.0.7. Neu in Phase 3 (ADT): `abap-adt-api` 10.0.0 und `playwright-core`
1.65.0 – beide kamen schon mit dem Prüfpaket über Nexus.
