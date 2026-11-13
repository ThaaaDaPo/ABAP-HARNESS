# 08 – Phase 1: Plattformkern (Umfang)

Status: **gestartet 2026-11-13. Schritt 1 gebaut, wartet auf Prüfung am Firmenrechner.**

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

### Bekannte Lücken (bewusst später)

- Antworten werden als reiner Text angezeigt, Markdown (Fettschrift, Code-Blöcke) noch nicht
  gerendert → Schritt 4, braucht ein zusätzliches Paket.
- Abbrechen hinterlässt keinen Hinweis im Verlauf.
- Ein Agent fest aus `einstellungen.json`; Agentenverwaltung kommt in Schritt 4.

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
