# 08 – Phase 1: Plattformkern (Umfang)

Status: **gestartet 2026-11-13. Schritt 1 abgenommen. Schritt 2 (MCP-Server, Tool-Gateway) gebaut, Abnahme auf dem Firmenrechner steht aus.**

## Stand Schritt 1 (2026-11-13)

Gebaut: Grundgerüst, Simulation (Drehbuch), Chat mit Live-Ansicht, Copilot-Anbindung mit
Berechtigungsregeln (Dateien nur im Workspace, keine Shell, kein Internet).

Auf dem Privatrechner geprüft (nur Simulation): Chat, Live-Text, Tool-Anzeige, Abbrechen, Sperre
bei laufendem Agenten, Fortsetzen nach Neustart, Oberfläche im Browser, alles auch mit Node 22.16.
Berechtigungsregeln mit `npm test` (6 Tests).

**Nicht geprüft**: die Copilot-Anbindung ([server/laufzeit/copilot/](../server/laufzeit/copilot/)).
Sie ist nach dem Prüfpaket geschrieben, lief aber noch nie. Annahmen, die dort zu prüfen sind:

- `session.idle` kommt nach jeder Antwort zuverlässig (sonst bleibt der Chat auf „arbeitet")
- `streaming: true` liefert `assistant.message_delta`
- `resumeSession` nach Neustart der App
- Ablehnungen der Berechtigungsprüfung landen verständlich beim Agenten

### Abnahme Schritt 1 auf dem Firmenrechner

1. Ohne `einstellungen.json` starten → Simulation: Chat anlegen, „Ticket" schreiben, Antwort läuft live ein.
2. `einstellungen.json` mit `"modus": "copilot"` und eigenem Workspace-Ordner → neu starten.
3. „Was ist 2+2?" → Antwort läuft Wort für Wort ein, danach ist wieder Eingabe möglich.
4. „Lege im Arbeitsverzeichnis die Datei test.txt mit dem Inhalt hallo an" → Tool-Aufruf sichtbar,
   Datei liegt im Workspace-Ordner.
5. „Lies die Datei C:\Windows\win.ini" → wird abgelehnt.
6. „Führe den Befehl dir aus" → wird abgelehnt.
7. App beenden (Strg+C), neu starten, im selben Chat „Welche Datei hast du vorhin angelegt?" →
   Agent weiß es noch.

Bei Fehlern: Foto vom Terminal und vom Browser.

### Ergebnis der Abnahme (2026-11-13, erste Runde)

Alle Punkte in Ordnung bis auf Punkt 6: **`dir` wurde ausgeführt** (laut David zumindest im
Arbeitsverzeichnis). Copilot führt einfache Shell-Befehle offenbar aus, ohne
`onPermissionRequest` zu fragen. Behoben durch eine zweite, unabhängige Sperre in
[berechtigungen.ts](../server/laufzeit/copilot/berechtigungen.ts): Shell-Werkzeuge werden über
`excludedTools` nicht angeboten und über den Hook `onPreToolUse` vor jeder Ausführung
abgelehnt. Erkenntnis für das Tool-Gateway (Schritt 2): **Regeln immer im Hook `onPreToolUse`
durchsetzen, nicht nur in `onPermissionRequest`.**

Zweite Runde: `dir` scheitert jetzt – der Agent hat es auf fünf Wegen versucht, alle abgelehnt.
**Schritt 1 ist damit abgenommen.** Damit der Agent nicht Credits mit Umwegen verbraucht, steht
seitdem im Auftrag jeder Sitzung, dass Shell und Internet gesperrt sind (`umgebungsRegeln` in
[copilot.ts](../server/laufzeit/copilot/copilot.ts)); noch nicht am Firmenrechner geprüft.
Lehre für später: Gesperrtes immer auch dem Agenten sagen, nicht nur technisch sperren.

### Bekannte Lücken (bewusst später)

- Antworten werden als reiner Text angezeigt, Markdown (Fettschrift, Code-Blöcke) noch nicht
  gerendert → Schritt 4, braucht ein zusätzliches Paket.
- Abbrechen hinterlässt keinen Hinweis im Verlauf.
- Ein Agent fest aus `einstellungen.json`; Agentenverwaltung kommt in Schritt 4.

## Stand Schritt 2 (2026-11-13)

Gebaut:

- **Seite „MCP-Server"**: Server eintragen (Schlüssel, Name, Startbefehl, Argumente je Zeile,
  Umgebungsvariablen, Arbeitsordner), Tools auslesen, ändern, löschen. Die App liest die Tools
  mit einem eigenen kleinen MCP-Client aus ([server/mcp/](../server/mcp/)), ohne Zusatzpaket.
  Nur Server, die über stdio laufen (Start als Unterprozess); HTTP-Server bei Bedarf später.
- **Tool-Gateway** ([server/gateway/gateway.ts](../server/gateway/gateway.ts)): je Tool eine
  der vier Regeln, dazu eine Standardregel je Server für alle Tools ohne eigene Regel (auch für
  Tools, die später neu dazukommen). Regeln werden bei jedem Aufruf neu gelesen, Änderungen
  wirken sofort.
  - *erlauben*: wird ausgeführt
  - *melden*: wird ausgeführt, danach Postfach-Eintrag mit Argumenten und Ergebnis
  - *freigabe*: wird nicht ausgeführt; Postfach-Eintrag, der Agent bekommt „Vorschlag #n
    wartet auf Freigabe, nicht wiederholen, weiterarbeiten"
  - *verbieten*: wird dem Agenten gar nicht angeboten (`excludedTools`) und trotzdem abgelehnt
- **Durchsetzung bei Copilot** ([gateway-hooks.ts](../server/laufzeit/copilot/gateway-hooks.ts)):
  im Hook `onPreToolUse` (Lehre aus Schritt 1) und unabhängig davon noch einmal in
  `onPermissionRequest`. Meldungen entstehen im Hook `onPostToolUse`. MCP-Server, die nicht in
  der App eingetragen sind, werden abgelehnt.
- **Postfach-Ablage**: Freigaben und Meldungen landen in der Tabelle `postfach` und erscheinen
  im Chat als Hinweis „Vorschlag #n …". Anzeige und Aktionen im Postfach kommen in Schritt 3.
- **Stellvertreter-Server** [mcp/stellvertreter-sap/](../mcp/stellvertreter-sap/) und
  [mcp/stellvertreter-jira-confluence/](../mcp/stellvertreter-jira-confluence/) mit festen
  Beispieldaten. Sie werden beim ersten Start einmalig mit Regeln eingetragen (SAP: lesen
  erlaubt, `objekt_aendern` verboten; Jira: lesen erlaubt, verschieben melden, Seite anlegen
  Freigabe). Gelöschte Stellvertreter kommen nicht wieder.
- **Simulation**: Tool-Schritte im Drehbuch gehen jetzt durch das Gateway und rufen die
  eingetragenen Server wirklich auf. Stichwörter: *Ticket*, *Klasse*, *Fehler*,
  *verschieben* (melden), *Doku* (Freigabe), *ändern* (verboten).

Auf dem Privatrechner geprüft (nur Simulation, auch mit Node 22.16): alle vier Regeln im Chat,
Postfach-Einträge, Regeländerung wirkt sofort, Eingabeprüfung (Schlüssel, doppelte Server),
verständlicher Fehler bei falschem Startbefehl, keine Restprozesse nach dem Beenden.
`npm test`: 18 Tests (Gateway, MCP-Client gegen echten Stellvertreter-Prozess, Berechtigungen).

### Festlegungen in Schritt 2 (Vorschlag)

- MCP-Server werden in der App eingetragen und in der Datenbank gespeichert, nicht in
  `einstellungen.json` – Windows-Pfade lassen sich so ohne JSON-Schreibweise eintragen.
- Server-Schlüssel ohne Bindestrich (nur `a-z`, `0-9`, `_`): Copilot nennt die Tools
  `<schlüssel>-<tool>`, das Gateway trennt am ersten Bindestrich.
- Neuer Server: Standardregel *Freigabe* – erst fragen, dann schrittweise freigeben.
- Regeln gelten je Agent; bis zur Agentenverwaltung (Schritt 4) gibt es nur den Agenten
  `standard`.
- *melden* erzeugt nur nach erfolgreichen Aufrufen eine Meldung.

### Annahmen, die erst am Firmenrechner geprüft werden können

- Bei Ablehnung im Hook `onPreToolUse` meldet Copilot das Tool als fehlgeschlagen und gibt dem
  Agenten den Grund weiter (im Chat: Tool-Karte „fehlgeschlagen" mit dem Text „Nicht ausgeführt: …").
- `onPermissionRequest` liefert bei MCP-Tools als `serverName` den Schlüssel aus der App.
  Falls nicht, würden **alle** MCP-Aufrufe abgelehnt – dann Foto der Tool-Karte.
- `excludedTools` mit `mcp:<schlüssel>-<tool>` blendet verbotene Tools aus.
- `onPostToolUse` kommt auch für MCP-Tools (sonst fehlt der Hinweis „Meldung #n").
- Umgebungsvariablen: ob Copilot sie zur eigenen Umgebung (PATH) ergänzt oder sie ersetzt.
- Ob die in der Copilot-Kommandozeile eingerichteten MCP-Server auch in SDK-Sitzungen
  auftauchen. Wenn ja, werden ihre Tools abgelehnt (nicht in der App eingetragen).

### Abnahme Schritt 2 auf dem Firmenrechner

Vorher: `npm install`, `einstellungen.json` aus Schritt 1 mit `"modus": "copilot"` behalten.

1. `npm start`, Seite **MCP-Server**: „SAP (Stellvertreter)" und „Jira/Confluence
   (Stellvertreter)" sind da, je mit Tool-Liste und Regeln.
2. Chat: „Lies das Ticket ABAP-123" → Tool `jira-ticket_lesen` erledigt, Antwort nennt die
   Kundengruppe.
3. „Setze ABAP-123 auf Review" → Tool erledigt, darunter orange „Meldung #… im Postfach".
4. „Lege in Confluence im Bereich ABAP eine Seite zu ZCL_KUNDEN_SERVICE an" → Tool
   fehlgeschlagen mit „Nicht ausgeführt: … Vorschlag #…", orange „Vorschlag #… wartet auf
   Freigabe"; der Agent nennt die Nummer und versucht es nicht erneut.
5. „Ändere den Quelltext von ZCL_KUNDEN_SERVICE über den SAP-Server" → der Agent sagt, dass er
   das nicht kann (das Tool wird ihm nicht angeboten).
6. Auf der Seite MCP-Server bei Jira `ticket_lesen` auf **Verbieten** stellen, im selben Chat
   noch einmal Punkt 2 → wird abgelehnt. Danach wieder auf „Standard" stellen.
7. **Echte Server**: „Server eintragen" für den Jira/Confluence-MCP und den SAP-MCP, mit dem
   Startbefehl, den Copilot-Kommandozeile bzw. Eclipse heute benutzen (Schlüssel z. B. `jira2`
   und `sap2`, solange die Stellvertreter noch da sind). Beim SAP-MCP kann Edge für das Cookie
   aufgehen. → Tool-Liste erscheint.
8. Lesende Tools auf **Erlauben**, schreibende beim SAP-MCP auf **Verbieten** (V-06). Im Chat
   ein echtes Ticket lesen lassen.

Bitte fotografieren: Tool-Listen der echten Server (Punkt 7 – die Tool-Namen brauchen wir für
die Stellvertreter und spätere Voreinstellungen) und bei Fehlern Terminal und Browser.

### Bekannte Lücken nach Schritt 2

- Postfach nur als Ablage: keine Anzeige, kein Freigeben/Verwerfen → Schritt 3.
- Regel *verbieten* auf *erlauben* zurückgestellt: Das Tool wird erst angeboten, wenn die
  Sitzung neu aufgebaut wird. Das passiert automatisch bei der nächsten Nachricht, sofern der
  Agent gerade nicht arbeitet.
- MCP-Server über HTTP werden noch nicht unterstützt.

## Ziel

Am Ende von Phase 1 gibt es eine lokale Web-Anwendung, in der David einen Agenten anlegt, ihm
seine vorhandenen MCP-Server gibt, mit ihm chattet und freigabepflichtige Aktionen im Postfach
sieht und beantwortet. ABAP schreiben kann der Agent dann noch nicht.

## Enthalten

| Baustein | Was David damit tun kann |
|---|---|
| Start | Ein Befehl startet die App, sie öffnet sich im Browser. Oberfläche auf Deutsch |
| Einrichtung | Prüfseite: Node, Copilot-Anmeldung, MCP-Server erreichbar – mit verständlichen Hinweisen (z. B. „in der Copilot-Kommandozeile `/login` ausführen") |
| MCP-Server | Vorhandene Server (Jira/Confluence, SAP-MCP) eintragen; die App liest deren Tools aus |
| Agenten | Anlegen und bearbeiten: Name, Auftrag (Systemprompt), Modell, welche Tools, welche Policy je Tool, welche Instructions/Skills |
| Chat | Mit einem Agenten schreiben; live sehen, was er tut (Antworten, Tool-Aufrufe, Ergebnisse) |
| Tool-Gateway | Vier Policies je Tool: erlauben / erlauben + melden / Freigabe / verbieten. Technisch erzwungen |
| Dateigrenze | Agent liest und schreibt nur im Workspace-Ordner; Shell standardmäßig aus |
| Postfach | Freigaben, Änderungsmeldungen (Vorher/Nachher bei Dateien), Rückfragen, Ergebnisse. Aktionen: freigeben, antworten, verwerfen, zur Kenntnis nehmen |
| Wiederaufnahme | Antwort auf einen Postfach-Eintrag setzt den Agenten mit Kontext fort (Sitzung fortsetzen, sonst Übergabenotiz) |
| Instructions/Skills | Ordner anzeigen, Dateien anlegen und bearbeiten, Agenten zuordnen |
| Verbrauch | Anzeige je Lauf und gesamt, Limit je Lauf |
| Simulationsmodus | Alles läuft auch ohne Copilot und ohne echte MCP-Server (Drehbuch-Laufzeit, Stellvertreter-Server) |

## Nicht enthalten

- ABAP entwickeln über ADT (Workspace, check/push/activate, Unit-Tests, Rückgängig) → Phase 3
- Zeitsteuerung und gespeicherte Workflows → Phase 4
- Orchestrator, mehrere Läufe gleichzeitig → Phase 5
- Anmeldung/Rollen, Teams-Benachrichtigung

Phase 2 (Doku-Agent) ist nach Phase 1 überwiegend Konfiguration: ein Agent mit SAP-MCP (lesen)
und Confluence (anlegen mit Freigabe) plus passendem Auftrag.

## Wie getestet wird (E-40)

Auf dem Privatrechner nur im Simulationsmodus. Der Teil, der wirklich mit dem Copilot SDK
spricht, wird nach den Messergebnissen aus Phase 0 geschrieben und läuft erstmals auf dem
Firmenrechner. Dort ist mindestens eine Korrekturrunde zu erwarten.

## Reihenfolge

1. Grundgerüst, simulierte Laufzeit, Chat mit Live-Ansicht, Copilot-Anbindung
   → **früher Transfer auf den Firmenrechner**, um die blind geschriebene Copilot-Anbindung zu prüfen
2. MCP-Server und Tool-Gateway mit Policies
3. Postfach und Wiederaufnahme
4. Agentenverwaltung, Instructions/Skills, Verbrauch, Einrichtungsseite
   → zweiter Transfer, Phase 1 fertig

## Technik

Monorepo (`apps/server`, `apps/web`, `packages/shared`), TypeScript, React, eingebautes SQLite
von Node, Mindestversion Node 22.16 (Stand Firmenrechner). Wenige, fest versionierte
Abhängigkeiten wegen Nexus; die Liste wird vor dem ersten Transfer genannt.
