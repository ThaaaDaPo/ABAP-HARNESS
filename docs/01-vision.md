# 01 – Vision und Rahmenbedingungen

## Ziel

Eine eigene Plattform (Web-Anwendung), in der KI-Agenten angelegt, konfiguriert, gestartet und
überwacht werden. Die Agenten laufen „dunkel" (ohne IDE, ohne dass jemand davorsitzt) auf Basis
des GitHub Copilot SDK.

Zielbild ist ein Agenten-Team mit diesen Fähigkeiten:

| Fähigkeit | Beschreibung |
|---|---|
| Ticket-Verwaltung | Jira-Tickets lesen, einordnen, verschieben |
| Dokumentation | Doku schreiben und in Confluence ablegen |
| Review | Code und Dokumente prüfen |
| Überblick | Zusammenhänge über Tickets, Code und Doku hinweg kennen |
| ABAP-Entwicklung | ABAP-Objekte im Entwicklungssystem selbständig bauen, prüfen, aktivieren |

## Was gegeben ist

- **GitHub-Copilot-Lizenz**; `npx @github/copilot` (Copilot CLI) läuft bereits.
- **Jira/Confluence-MCP-Server** (ein Server, Node): Jira lesen und Tickets verschieben,
  Confluence lesen und Seiten anlegen.
- **SAP-MCP-Server**: Node-Proxy, die Logik liegt im SAP hinter einem SICF-Knoten. Kann lesen,
  ABAP-Objekte erstellen, ATC ausführen, Transporte zuordnen u. a.
- Bisherige Arbeitsweise: Copilot in Eclipse (ADT) integriert, Freigaben blockieren den Agenten.

## Stack (festgelegt)

Node.js, TypeScript, React.

## Rahmen des Piloten

- Ein Nutzer (David), Betrieb lokal auf dem Firmenrechner, alles unter Davids Benutzer.
- S/4HANA on-prem, Anmeldung per SSO, nur lokale Objekte, keine Transporte.
- Copilot Business mit 10.000 Credits.
- Gebaut wird auf dem Privatrechner ohne Zugang zu SAP/Jira/Confluence; Übertragung als ZIP.

Details und Quellen: [06-entscheidungen](06-entscheidungen.md).

## Die vier Kernprobleme

1. **Headless-Entwicklung**: Wie entwickelt ein Agent ABAP ohne Eclipse? → [03-adt-integration](03-adt-integration.md)
2. **Fehler-Feedback**: Wie sieht der Agent Syntaxfehler, bevor er speichert? → [03-adt-integration](03-adt-integration.md)
3. **Trennung lesen/schreiben**: bestehender SAP-MCP zum Lesen, ADT-Werkzeuge zum Entwickeln → [03-adt-integration](03-adt-integration.md)
4. **Nicht-blockierende Freigaben**: Postfach, in das der Agent Vorschläge legt und dann
   weiterarbeitet → [04-freigabe-postfach](04-freigabe-postfach.md)
