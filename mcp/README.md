# MCP-Server

Je MCP-Server ein Unterordner.

| Ordner | Zweck | Kommt in |
|---|---|---|
| `gemeinsam/` | Kleinster MCP-Server ohne Abhängigkeiten, Grundlage der Stellvertreter | Phase 1, Schritt 2 |
| `stellvertreter-sap/` | Simulierter SAP-MCP mit festen Beispieldaten | Phase 1, Schritt 2 |
| `stellvertreter-jira-confluence/` | Simulierter Jira/Confluence-MCP mit Beispieldaten im Speicher | Phase 1, Schritt 2 |
| `adt/` | ABAP entwickeln über ADT: auschecken, prüfen, speichern, aktivieren, anlegen, Unit-Tests, ATC. Eingebaut, eingestellt in der App (MCP-Server → ADT), Anmeldung nur per SSO. Mit Übungssystem statt SAP | Phase 3, siehe [docs/09-phase-3.md](../docs/09-phase-3.md) |

Die Stellvertreter trägt die App beim ersten Start selbst ein (Seite „MCP-Server"), den ADT-MCP
bei jedem Start. Sie sind TypeScript und laufen mit `node --experimental-strip-types`. Ihre Tool-Namen sind ausgedacht;
die echten Server haben eigene.

Die echten Server (Jira/Confluence, SAP-MCP) liegen nicht in diesem Repo; sie werden in der App
mit ihrem Startbefehl eingetragen.
