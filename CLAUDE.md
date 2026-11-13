# ABAP-HARNESS

Plattform zum Anlegen, Verwalten und Betreiben von KI-Agenten über das GitHub Copilot SDK.
Zielbild: ein Agenten-Team, das Jira-Tickets verwaltet, Dokumentation schreibt, Reviews macht,
den Gesamtüberblick behält und selbständig ABAP im SAP-Entwicklungssystem entwickelt.

## Aktueller Stand

**Phase 0 läuft.** Die Planung ist freigegeben (2026-11-13). Das Prüfpaket in
[pruefpaket/](pruefpaket/) ist gebaut und wartet auf Davids Lauf auf dem Firmenrechner. Die
Plattform selbst (Phase 1 ff.) wird erst gebaut, wenn das Ergebnis vorliegt oder David es
ausdrücklich anders will.

**Wichtige Randbedingung:** Gebaut wird auf Davids Privatrechner – hier gibt es kein SAP, kein
Jira, kein Confluence und keine Firmen-Copilot-Lizenz. Betrieben wird auf dem Firmenrechner
(Windows, dort kein Claude, npm über Nexus). Übertragung hin als ZIP ohne `node_modules`,
Rückmeldungen als Handyfotos oder QR-Text. SAP-Anbindungen können hier nicht getestet werden.
Das Copilot SDK läuft hier technisch über Davids privaten GitHub-Login – **nur nutzen, wenn
David das erlaubt hat** (offene Frage K1), es verbraucht sein privates Kontingent.
Siehe [docs/07-roadmap.md](docs/07-roadmap.md).

## Einstieg für neue Chats

Zuerst diese Dateien lesen, in dieser Reihenfolge:

1. [docs/01-vision.md](docs/01-vision.md) – Ziel, Rahmenbedingungen, was gegeben ist
2. [docs/06-entscheidungen.md](docs/06-entscheidungen.md) – was entschieden ist (und was nur Vorschlag ist)
3. [docs/05-offene-fragen.md](docs/05-offene-fragen.md) – was noch geklärt werden muss
4. Bei Bedarf: [02-architektur](docs/02-architektur.md), [03-adt-integration](docs/03-adt-integration.md),
   [04-freigabe-postfach](docs/04-freigabe-postfach.md), [07-roadmap](docs/07-roadmap.md)

## Arbeitsregeln

- Sprache mit David: Deutsch.
- Stack (festgelegt): Node.js, TypeScript, React.
- Planungsdokumente aktuell halten: Beantwortet David eine Frage, wandert sie aus
  `05-offene-fragen.md` als Entscheidung nach `06-entscheidungen.md`, und die betroffenen
  Fachdokumente werden angepasst.
- Vorschläge von Claude sind als „Vorschlag" markiert, bis David sie bestätigt.
