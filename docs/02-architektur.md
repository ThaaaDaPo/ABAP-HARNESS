# 02 – Architektur (Vorschlag)

Status: **Vorschlag von Claude, noch nicht bestätigt.**

## Überblick

```
┌──────────────────────────── React-UI ────────────────────────────┐
│  Agenten  │  Aufgaben/Läufe (Live-Log)  │  Postfach  │  Einstellungen │
└───────────────────────────────┬──────────────────────────────────┘
                                │ REST + WebSocket/SSE
┌───────────────────────────────┴──────────────────────────────────┐
│                     Backend (Node/TypeScript)                     │
│                                                                   │
│  Agenten-Registry   Aufgaben-Queue/Scheduler   Postfach-Service   │
│         │                    │                        ▲           │
│         ▼                    ▼                        │           │
│   ┌──────────── Agent-Runtime (Copilot SDK) ─────────┐│           │
│   │ eine Session pro Lauf, Events → Ereignis-Log     ││           │
│   └───────────────────────┬──────────────────────────┘│           │
│                           ▼                           │           │
│   ┌──────────────── Tool-Gateway ─────────────────────┴─┐         │
│   │ Policy je Tool: erlauben │ Freigabe nötig │ verbieten │        │
│   └───┬───────────────┬───────────────┬─────────────────┘         │
└───────┼───────────────┼───────────────┼───────────────────────────┘
        ▼               ▼               ▼
  Jira/Confluence    SAP-MCP         ADT-MCP (neu)
       MCP          (lesen)       (entwickeln, Workspace)
                        │               │
                        └──── SAP-Entwicklungssystem ────┘
```

## Bausteine

### Agent-Runtime
- Paket `@github/copilot-sdk` (TypeScript; steuert die Copilot CLI per JSON-RPC).
- Ein **Lauf** = eine SDK-Session mit Systemprompt, Modell, Tool-Auswahl und Arbeitsverzeichnis.
- Alle Session-Events (Nachrichten, Tool-Aufrufe, Ergebnisse) werden persistiert und live an die UI gestreamt.
- Sessions müssen wiederaufnehmbar sein (nach Freigabe, nach Neustart des Backends).

### Agenten-Registry
Agenten sind **Daten, kein Code**: Name, Rolle, Systemprompt, Modell, erlaubte Tools,
Tool-Policies, Wissensquellen. In der UI anlegbar und versioniert.

### Aufgaben-Queue / Scheduler
- Aufgabe = „Agent X soll Y tun" (manuell angelegt, später aus Jira abgeleitet).
- Zustände: `wartend → läuft → wartet auf Freigabe → läuft → fertig | fehlgeschlagen`.
- Wartet eine Aufgabe auf Freigabe, nimmt der Scheduler die nächste – das löst das
  Blockier-Problem aus Eclipse.

### Tool-Gateway (zentrales Element)
Agenten sprechen nie direkt mit den MCP-Servern, sondern immer über das Gateway. Dort wird
deterministisch – nicht per Prompt – entschieden:

| Policy | Wirkung | Beispiel |
|---|---|---|
| `erlauben` | Aufruf geht direkt durch | alles Lesende |
| `erlauben + melden` | Aufruf geht durch, im Postfach erscheint ein Eintrag mit Vorher/Nachher | lokale ABAP-Änderung (E-20) |
| `freigabe` | Aufruf wird **nicht** ausgeführt, sondern als Vorschlag ins Postfach gelegt | Confluence-Seite anlegen (E-20) |
| `verbieten` | Aufruf wird abgelehnt | Transport freigeben |

Policies sind pro Agent und pro Tool einstellbar. So kann man Automatisierung schrittweise
hochdrehen: ein Tool, dem man vertraut, wird von `freigabe` auf `erlauben` gestellt.

Zusätzlich: Audit-Log aller Tool-Aufrufe, Limits (Anzahl Aufrufe, Laufzeit).

### Dateizugriff (E-09)
Agenten dürfen nur im festgelegten Agenten-Bereich lesen und schreiben. Das wird technisch
erzwungen (Arbeitsverzeichnis + Prüfung jedes Datei- und Shell-Zugriffs), nicht per Prompt.
Shell-Befehle sind standardmäßig aus oder auf eine Positivliste beschränkt. Genaue Umsetzung
hängt von den Möglichkeiten des SDK ab (E1).

### Credit-Budget (E-08)
10.000 Credits sind endlich. Je Lauf wird der Verbrauch erfasst und angezeigt (unter jeder
Antwort, je Chat, Seite „Verbrauch“). Ein Limit je Lauf und ein Monatsbudget sind zurückgestellt
(E-60). Das Modell ist je Agent wählbar (günstiges Modell für einfache Aufgaben), ein Chat kann es
übersteuern (E-51).

### Wege, Arbeit zu starten (E-16)

| Weg | Beschreibung |
|---|---|
| Chat | David schreibt direkt mit einem Agenten, Antwort live |
| Zeitgesteuert | gespeicherter Auftrag mit Zeitplan |
| Workflow | fester Ablauf aus Tool-, KI- und Steuerschritten, manuell, durch einen Agenten oder zeitgesteuert gestartet (E-66, [10-phase-4](10-phase-4.md)) |

Chat und KI-Schritte eines Workflows sind intern dasselbe: eine Aufgabe mit einer Sitzung des
Agenten. Ein Workflow-Lauf führt seine Schritte selbst aus; für jeden KI-Schritt entsteht eine
eigene Aufgabe mit frischer Sitzung.

### Instructions und Skills (E-18)
Die bestehenden Dateien werden nicht in die Datenbank kopiert, sondern bleiben Dateien in einem
Ordner; je Agent wird eingestellt, welche er bekommt. Die App zeigt den Ordner an und erlaubt,
Instructions und Skills anzulegen, zu bearbeiten und Agenten zuzuordnen (E-30). Die Dateien
bleiben die Wahrheit – wer sie außerhalb der App ändert, sieht die Änderung in der App.

### Austauschbare Laufzeit (V-15)
Die Plattform spricht nicht direkt mit dem Copilot SDK, sondern mit einer schmalen eigenen
Schnittstelle („Lauf starten, Nachricht senden, Ereignisse empfangen, fortsetzen, abbrechen").
Dahinter gibt es zwei Umsetzungen: Copilot SDK (echt) und eine simulierte Laufzeit, die ein
Drehbuch abspielt. Nötig, weil auf dem Privatrechner kein Copilot verfügbar ist (E-24).

### Postfach
Siehe [04-freigabe-postfach](04-freigabe-postfach.md).

### Persistenz
Vorschlag: SQLite über das in Node eingebaute Modul (eine Datei, kein Betrieb, kein natives
Zusatzpaket – wichtig für die ZIP-Übertragung, E-15). Tabellen grob: Agenten, Aufgaben, Läufe, Ereignisse, Postfach-Einträge,
Tool-Policies.

## Agentenrollen (Zielbild)

| Rolle | Aufgabe | Tools |
|---|---|---|
| Koordinator | Tickets lesen, zerlegen, an Fachagenten verteilen, Überblick halten | Jira lesen/verschieben, Aufgaben anlegen |
| ABAP-Entwickler | Objekte bauen, prüfen, aktivieren | SAP-MCP lesen, ADT-MCP |
| Reviewer | Code und Doku prüfen, nichts ändern | nur lesend + ATC |
| Dokumentar | Doku erstellen | Confluence lesen/anlegen (mit Freigabe), SAP lesen |

Wichtig: Der Reviewer sollte ein **eigener Agent mit eigenem Kontext** sein, der den Entwickler-Lauf
nicht gesehen hat – sonst bestätigt er nur dessen Annahmen.

### Orchestrator (E-17, Ausbaustufe)
Kein allwissender Dauer-Agent, sondern ein Agent mit genau zwei Fähigkeiten: Arbeit in Aufgaben
zerlegen und Aufgaben an Fachagenten vergeben (Tool `aufgabe_anlegen`), danach deren Ergebnisse
lesen und zusammenführen. Wo die Reihenfolge feststeht (entwickeln → prüfen → dokumentieren),
ist ein fester Workflow zuverlässiger und billiger als ein Agent, der das jedes Mal neu
entscheidet. Der Orchestrator-Agent lohnt sich dort, wo die Zerlegung vom Ticketinhalt abhängt.

**Empfehlung:** nicht mit dem Team anfangen. Erst ein einzelner Agent, der einen Ablauf von Anfang
bis Ende sauber beherrscht; Multi-Agent erst, wenn Runtime, Gateway und Postfach stabil sind.

## Projektstruktur (Vorschlag)

Monorepo mit Workspaces:

```
apps/server      Backend (API, Runtime, Gateway, Scheduler)
apps/web         React-UI
packages/shared  gemeinsame Typen (Agent, Aufgabe, Postfach-Eintrag, Events)
packages/adt-mcp ADT-MCP-Server (eigenständig nutzbar, auch aus Eclipse/VS Code heraus)
```

## Risiken

- **Copilot SDK**: Session-Wiederaufnahme, Hooks und Permission-Handling sind die Funktionen, auf
  denen das Gateway aufbaut. Die genaue API muss in einem Spike gegen die installierte Version
  (aktuell 1.0.x) geprüft werden, bevor die Architektur fixiert wird.
- **Entwicklung ohne Zielumgebung** (E-15, E-24): Weder Copilot noch SAP sind beim Bauen
  verfügbar. Das ist jetzt das größte Risiko des Projekts. Gegenmaßnahmen in
  [07-roadmap](07-roadmap.md).
- **Anmeldung per Browser-Cookie** (E-26): läuft ab; zeitgesteuerte Läufe brauchen eine gültige
  Anmeldung (V-16).
- **Agent arbeitet unter Davids Benutzer** (E-10): Er kann technisch alles, was David darf.
  Deshalb Paket-Sperre im ADT-MCP (V-11) und ausgeblendete Schreib-Tools im SAP-MCP (V-06).
- **Sperren**: Agent und David am selben Objekt; verwaiste Sperren nach Abbruch.
