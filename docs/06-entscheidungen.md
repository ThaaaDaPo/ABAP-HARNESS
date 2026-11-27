# 06 – Entscheidungslog

## Entschieden

| Nr. | Datum | Entscheidung | Grund / Quelle |
|---|---|---|---|
| E-01 | 2026-11-13 | Stack: Node.js, TypeScript, React | Vorgabe David |
| E-02 | 2026-11-13 | Agenten laufen über das GitHub Copilot SDK | Vorgabe David, Lizenz vorhanden |
| E-03 | 2026-11-13 | Erst planen, noch kein Code | Vorgabe David |
| E-04 | 2026-11-13 | Bestehender SAP-MCP bleibt für lesende Zugriffe; Entwickeln läuft über ADT-Werkzeuge | Vorgabe David |
| E-05 | 2026-11-13 | Freigaben blockieren nicht, sondern laufen über ein Postfach | Vorgabe David |
| E-06 | 2026-11-13 | Pilot: ein Nutzer (David), keine Anmeldung/Rollen in der App | Antwort A1 |
| E-07 | 2026-11-13 | Betrieb lokal auf Davids Firmenrechner; läuft nur, wenn der Rechner an ist | Antwort A2 |
| E-08 | 2026-11-13 | Copilot Business, 10.000 Credits (100 €); automatisierter Betrieb ist abgestimmt | Antwort A3 |
| E-09 | 2026-11-13 | Dateizugriff der Agenten ist auf den Bereich beschränkt, in dem der Agenten-Workspace liegt | Antwort A4 |
| E-10 | 2026-11-13 | System: S/4HANA on-prem; Agenten arbeiten unter Davids SAP-Benutzer; Anmeldung per SSO | Antworten B1–B3 |
| E-11 | 2026-11-13 | Erste Objekttypen: Klassen, Interfaces, Reports, Funktionsbausteine | Antwort B5 |
| E-12 | 2026-11-13 | Der Agent darf selbst aktivieren | Antwort B6 |
| E-13 | 2026-11-13 | Vorerst nur lokale Objekte (lokales Paket) auf dem Entwicklungssystem, keine Transporte, keine Sandbox | Antworten B7, B8 |
| E-14 | 2026-11-13 | Der Agent schreibt und startet ABAP-Unit-Tests | Antwort B9 |
| E-15 | 2026-11-13 | Gebaut wird auf dem Privatrechner (ohne SAP/Jira/Confluence), Übertragung als ZIP auf den Firmenrechner. Deshalb möglichst vollständig bauen, nicht nur einen Teil | Antwort C1 |
| E-16 | 2026-11-13 | Drei Wege, Arbeit zu starten: Chat (sofort), zeitgesteuert, gespeicherte Workflows (z. B. „Jira-Tickets ansehen und umsetzen") | Antwort C2 |
| E-17 | 2026-11-13 | „Überblick" = Orchestrator, der Aufgaben verteilt; Ausgestaltung liegt bei Claude | Antwort C3 |
| E-18 | 2026-11-13 | Bestehende Instructions und Skills werden weiterverwendet | Antwort C4 |
| E-19 | 2026-11-13 | Parallele Läufe sind erwünscht, aber nicht für die erste Version nötig | Antwort C5 |
| E-20 | 2026-11-13 | Confluence-Seiten anlegen ist freigabepflichtig. Lokale Programmänderungen sind ohne Rückfrage erlaubt, erzeugen aber einen Postfach-Eintrag mit Vorher/Nachher | Antwort D1 |
| E-21 | 2026-11-13 | Benachrichtigung nur in der App; Teams evtl. später | Antwort D2 |
| E-22 | 2026-11-13 | Auf jeden Postfach-Eintrag kann David mit einer Anweisung antworten („ändere das so …"). Der Agent schließt das Thema nach dem Ablegen ab und arbeitet weiter, hat bei einer Antwort aber wieder den vollen Kontext | Antwort D3 |
| E-23 | 2026-11-13 | Auf dem Firmenrechner läuft `npm install` über das Firmen-Nexus; das Projekt darf keine feste Registry voraussetzen | Antwort F1 |
| E-24 | 2026-11-13 | Copilot ist auf dem Privatrechner **nicht** nutzbar → auch die Agenten-Laufzeit kann hier nicht echt getestet werden | Antwort F2 |
| E-25 | 2026-11-13 | Rückweg vom Firmenrechner: Handyfotos vom Bildschirm → Diagnoseausgaben müssen kurz und fotografierbar sein | Antwort F3 |
| E-26 | 2026-11-13 | Der bestehende Node-Proxy meldet sich mit einem Cookie aus dem Browser an; der ADT-MCP nimmt denselben Weg | Antwort G1 |
| E-27 | 2026-11-13 | SICF-Dienst ist Eigenentwicklung und erweiterbar; trotzdem ist ADT der Hauptweg fürs Entwickeln (Aktivieren, Unit-Tests usw.), SICF nur Lückenfüller | Antwort G2 |
| E-28 | 2026-11-13 | Schreiben/Ändern nur in `$TMP`, lesen überall. Erweiterung auf andere Pakete später nach Abstimmung → erlaubte Pakete sind Konfiguration | Antwort G3 |
| E-29 | 2026-11-13 | Dateizugriff nur in einem von David angelegten Workspace-Ordner | Antwort H1 |
| E-30 | 2026-11-13 | Instructions/Skills liegen in einem Ordner; die App soll sie anzeigen, anlegen, bearbeiten und Agenten zuordnen können | Antwort H2 |
| E-31 | 2026-11-13 | Änderungsmeldungen im Postfach bekommen „Rückgängig" | Antwort H4 |
| E-32 | 2026-11-13 | Firmenrechner: Windows, Node vermutlich ≥ 22 (genaue Version prüft das Prüfpaket). Gebaut wird auf macOS → Code muss auf beiden laufen | Antwort I1 |
| E-33 | 2026-11-13 | Das Cookie holt sich der Proxy automatisch, ohne Zutun. Wie genau, ist noch unbekannt | Antwort I2 |
| E-34 | 2026-11-13 | Verfügbare Modelle: GPT und Gemini (kein Claude). Modell je Agent wählbar, Liste wird zur Laufzeit vom SDK gelesen, nicht fest eingebaut | Antwort I3 |
| E-35 | 2026-11-13 | Quelltext und Ticketinhalte dürfen ans Modell (ist heute schon so) | Antwort I4 |
| E-36 | 2026-11-13 | Diagnosebericht zusätzlich als QR-Code | Antwort I5 |
| E-37 | 2026-11-13 | Planung freigegeben; Vorschläge V-01 bis V-17 gelten als bestätigt. Start mit Phase 0 (Prüfpaket) | Antwort J1 |
| E-38 | 2026-11-13 | Cookie-Mechanismus des Proxys: `playwright-core` startet das installierte Edge sichtbar, ruft die SAP-URL auf, wartet bis 60 s auf `MYSAPSSO2` oder `SAP_SESSIONID_B1E_010` und gibt alle Cookies als Zeile zurück. System-ID B1E, Mandant 010. Wird so übernommen | Foto `get-cookie.js` |
| E-39 | 2026-11-13 | ADT-Zugriff über die Bibliothek `abap-adt-api` 10.0.0; sie hat eine eingebaute Cookie-Sitzung (`createCookieSessionOptions`) mit automatischer Erneuerung, passend zu E-38 | Recherche Claude |
| E-40 | 2026-11-13 | Davids privater GitHub-Login wird **nicht** für Copilot-Tests genutzt. Auf dem Privatrechner wird nur gegen die simulierte Laufzeit getestet; echtes Copilot läuft ausschließlich auf dem Firmenrechner | Antwort K1 |
| E-41 | 2026-11-13 | Code-Vorgaben: sauber nach Themen-Ordnern gegliedert (z. B. `mcp/` mit Unterordner je Server), Datei- und Ordnernamen möglichst deutsch, lesbar und nicht zu kompliziert | Vorgabe David |
| E-42 | 2026-11-13 | Technischer Aufbau Phase 1: ein `package.json` für alles (ein `npm install`); Server-TypeScript läuft ohne Bau-Schritt direkt in Node (Typen werden entfernt); Oberfläche wird von Vite im Server ausgeliefert (ein Startbefehl); Express für HTTP; Live-Anzeige über Server-Sent Events; Server nur an 127.0.0.1 | Claude, im Sinne von E-41 |
| E-43 | 2026-11-24 | Postfach zeigt zunächst alle Einträge (offene zuerst); die Darstellung je Typ (Confluence-Vorschau, Jira-Statuswechsel) kommt später | Antwort Schritt 3, Punkt 1 |
| E-44 | 2026-11-24 | **Freigabe zum Abschluss**: Die Aufgabe ist fertig und wartet auf die finale Freigabe (z. B. Confluence-Seite anlegen). *Freigeben* führt den Aufruf ohne KI aus, die Aufgabe ist erledigt (spart Tokens). *Verwerfen* schließt die Aufgabe als abgebrochen, ohne KI. *Änderungen anfordern* setzt den Agenten mit dem Kontext der Aufgabe fort | Antwort Schritt 3, Punkt 2a |
| E-45 | 2026-11-24 | **Freigabe zum Weitermachen**: Braucht der Agent das Ergebnis, pausiert er die Aufgabe und kann eine andere übernehmen. Nach der Freigabe wird die Aufgabe in eine Warteschlange gestellt und fortgesetzt, sobald der Agent frei ist – ohne Kontextverlust | Antwort Schritt 3, Punkt 2b |
| E-46 | 2026-11-24 | Wiederaufnahme nach Postfach-Aktionen setzt die Sitzung des Chats fort (Kontext bleibt erhalten) | Antwort Schritt 3, Punkt 3 |
| E-47 | 2026-11-24 | Rückfragen des Agenten landen im Postfach. Nur bei wirklich wichtigen Fragen, aber nicht so selten, dass das Ergebnis leidet | Antwort Schritt 3, Punkt 4 |
| E-48 | 2026-11-24 | Schritt 3 wird mit Simulation und Stellvertretern getestet, danach Transfer zur Abnahme | Antwort Schritt 3, Punkt 5 |
| E-49 | 2026-11-24 | Chats lassen sich löschen | Wunsch David vor dem Test von Schritt 3 |
| E-50 | 2026-11-24 | „Neuer Chat“ räumt Chats ohne Inhalt automatisch weg | Wunsch David vor dem Test von Schritt 3 |
| E-51 | 2026-11-24 | Modell je Chat wählbar, mit Thinking Effort und Context Window (ergänzt E-34: dort Modell je Agent) | Wunsch David vor dem Test von Schritt 3 |
| E-52 | 2026-11-24 | Freigaben und Rückfragen aus einem Chat werden **im Chat** erledigt. Das Postfach ist für Workflows, die ohne David laufen (z. B. am nächsten Morgen nachsehen, weiterlaufen lassen, stoppen, Änderung freigeben) und kommt mit Phase 4 | Rückmeldung nach dem Test von Schritt 3 |
| E-53 | 2026-11-24 | Beim Context Window steht die Größe in Tokens dabei, nicht nur „Standard“/„Lang“ | Rückmeldung nach dem Test von Schritt 3 |
| E-54 | 2026-11-24 | **Im Chat wartet der Agent auf die Freigabe**: Ruft er ein Tool mit Regel *Freigabe* auf, erscheint sofort die Vorschlagskarte – kein fehlgeschlagener Aufruf, kein `auf_freigabe_warten`, kein Zwischentext. Bis David entscheidet, passiert in dem Chat nichts. *Freigeben*: das Tool läuft, der Agent macht mit dem Ergebnis weiter. *Verwerfen*: Lauf endet, Aufgabe abgebrochen. Eine Nachricht im Eingabefeld ist der Änderungswunsch. Rückfragen genauso: die Antwort im Eingabefeld geht direkt an den wartenden Agenten. Ersetzt für Chats E-44/E-45 (für Workflows gelten sie weiter) | Rückmeldung David nach dem Test |
| E-55 | 2026-11-24 | Änderungswunsch zu einem Vorschlag lässt sich wieder **direkt in der Vorschlagskarte** eingeben (wie vor dem Umbau); das normale Chat-Eingabefeld geht weiterhin | Antwort Plan Schritt 4, Frage 0 |
| E-56 | 2026-11-24 | Der Agent eines Chats ist **im laufenden Chat wechselbar** | Antwort Plan Schritt 4, Frage 1 |
| E-57 | 2026-11-24 | Agenten sollen **parallel** arbeiten, soweit technisch machbar (ändert E-19 und die Festlegung „ein Agent, eine Sache zur Zeit“ aus Schritt 3) | Antwort Plan Schritt 4, Frage 2 |
| E-58 | 2026-11-24 | Vorhandene Instructions sind `*.instructions.md`, Skills sind Ordner mit `SKILL.md` | Antwort Plan Schritt 4, Frage 3 |
| E-59 | 2026-11-24 | Markdown im Chat: Claude wählt die beste Lösung, sie muss in der Anwendung sicher sein (kein ungeprüftes HTML aus Modell, Tickets oder Quelltext) | Antwort Plan Schritt 4, Frage 6 |
| E-60 | 2026-11-24 | Limit je Lauf, Monatsbudget und das Bearbeiten der Einstellungen in der App kommen vorerst **nicht**; „das Ding soll erst mal laufen“. Die Verbrauchsanzeige bleibt in Schritt 4 | Antworten Plan Schritt 4, Fragen 4, 5, 7 |
| E-61 | 2026-11-25 | **Jeder Chat läuft für sich**: Chats arbeiten gleichzeitig, auch zwei Chats desselben Agenten. Innerhalb eines Chats geht es der Reihe nach. Konkretisiert E-57; die Festlegung „ein Agent, eine Sache zur Zeit“ aus Schritt 3 entfällt | Antwort David vor dem Bau von Schritt 4 |
| E-62 | 2026-11-25 | **Phase 2 (Doku-Agent) wird übersprungen.** Agenten, Instructions, Skills und das Feintuning richtet David selbst auf dem Firmenrechner ein | Vorgabe David |
| E-63 | 2026-11-25 | **ADT-MCP** als eigener Server unter `mcp/adt/`, in der App konfigurierbar (SAP-Adresse, Mandant, Pakete …). Anmeldung **ausschließlich per SSO** – keine Benutzer-/Passwort-Felder | Vorgabe David |
| E-64 | 2026-11-27 | **„Rückgängig“ wird jetzt gebaut** (M1, konkretisiert E-31): Knopf an der Änderung im Chat, ohne KI. Gespeicherte Änderung: alter Stand wird zurückgeschrieben **und aktiviert**. Neu angelegtes Objekt: **Löschen im SAP** wird angeboten (mit Sicherheitsabfrage, nur in freigegebenen Paketen). Wurde das Objekt seitdem erneut geändert (Agent oder Eclipse), wird **abgelehnt mit Hinweis** – erst die neuere Änderung zurücknehmen | Antwort David auf M1 und die Fragen zum Plan |
| E-65 | 2026-11-27 | **Vergleich vorher/nachher im Chat, nebeneinander**: links der alte Stand (gelöschte Zeilen rot), rechts der neue (hinzugefügte Zeilen grün). Nur beim Speichern ins SAP (`adt-speichern`), nicht bei Datei-Änderungen im Workspace | Wunsch und Antwort David |
| E-66 | 2026-11-27 | **Workflows** sind feste Abläufe aus Schritten (Tool ohne KI, KI-Schritt, Wenn, Für jedes, Variable setzen, anderer Workflow, Beenden), bearbeitet als **Schrittliste in der App**, gespeichert als **JSON-Datei** im Workflow-Ordner. Start per Checkbox: manuell, durch Agent, zeitgesteuert – mehrere gleichzeitig. Kein Skill dafür: Ein Skill ist nicht verlässlich genug | Antwort David, Frage 1, und sein Entwurf |
| E-67 | 2026-11-27 | **Regel je Tool-Schritt** legt David im Workflow fest: erlauben, erlauben + melden, Freigabe nötig. Die Agenten-Regeln gelten für feste Schritte nicht; KI-Schritte behalten die Regeln ihres Agenten | Antwort David, Frage 2 |
| E-68 | 2026-11-27 | **Wo Freigaben eines Laufs erscheinen**: Hat ein Agent den Workflow im Chat gestartet, im Chat (auch für darin aufgerufene Workflows); sonst (manuell, Zeitplan) im Postfach | Antwort David, Frage 2 |
| E-69 | 2026-11-27 | **Credit-Limit je Lauf** (V-14), Startwert **500 AI-Credits**, je Workflow einstellbar. Wird es überschritten, bricht der Lauf ab | Antwort David, Frage 4 |
| E-70 | 2026-11-27 | **Verpasste Zeitpunkte werden verworfen**, nicht nachgeholt (Prototyp, Credits sparen) | Antwort David, Frage 5 |
| E-71 | 2026-11-27 | **Agent startet Workflow**: bekommt das Ergebnis (Standard: wartet bis zum Ende), kann den Stand abfragen (`workflow_stand`) und erfährt im Chat, wenn ein Lauf ohne Warten fertig ist. Nur Workflows mit „Start durch Agent“, die ihm auf der Agenten-Seite zugeordnet sind | Antwort David, Frage 3 |
| E-72 | 2026-11-27 | **Auch Workflows warten im Aufruf** auf Freigaben und Rückfragen (wie E-54 im Chat), egal ob David im Postfach oder im Chat entscheidet. Ersetzt für Workflows E-44/E-45 (Vorschlag ablegen und weiterarbeiten): Ein fester Ablauf kann ohne das Ergebnis nicht weiter. Nach einem Neustart sind wartende Läufe unterbrochen und lassen sich fortsetzen | Claude, folgt aus E-66 bis E-68 |

## Erkenntnisse aus Phase 0 (Privatrechner, 2026-11-13)

Gemessen mit `@github/copilot-sdk` 1.0.32 (Laufzeit 1.0.110) über Davids privaten GitHub-Login.
Auf dem Firmenrechner mit der Business-Lizenz noch zu bestätigen.

| Thema | Befund |
|---|---|
| Copilot auf dem Privatrechner | Läuft entgegen E-24 doch: das SDK nutzt den vorhandenen `gh`-Login (ThaaaDaPo). Ob das für Tests genutzt werden darf, entscheidet David (offene Frage K1) |
| Eigene Tools | funktionieren; Parameter als einfaches JSON-Schema, kein zod nötig |
| MCP-Server | Anbindung per `mcpServers` funktioniert; Tool heißt zur Laufzeit `<server>-<tool>`, z. B. `pruef-echo` |
| Abfangen | `onPreToolUse` meldet jeden Aufruf; `onPermissionRequest` liefert `kind` = `custom-tool`, `mcp`, `write` u. a. Bei `write` sind `fileName`, `diff` und `newFileContents` enthalten → Vorher/Nachher fürs Postfach ist direkt verfügbar |
| Dateizugriff begrenzen | Ablehnen von Schreibzugriffen außerhalb des Arbeitsordners über `onPermissionRequest` funktioniert |
| Sitzung fortsetzen | `resumeSession` nach vollständigem Neustart der Laufzeit behält den Kontext → Postfach-Antworten können die Sitzung fortsetzen (V-10 Weg 1) |
| Modellliste | Beim privaten Konto leer (nur automatische Auswahl). Bei Business vermutlich gefüllt, zu prüfen |
| Größe/Plattform | Das SDK bringt die Copilot-Laufzeit als Plattformpaket mit (`@github/copilot-sdk-win32-x64`, ca. 190 MB). `node_modules` darf deshalb nicht vom Mac mit ins ZIP; Nexus muss das Paket liefern |
| Node-Version | `abap-adt-api` verlangt Node ≥ 22.15, das SDK ≥ 22.12 → Mindestversion 22.15. Damit ist das eingebaute SQLite ohne Schalter nutzbar (V-08 bleibt) |

## Bestätigte Vorschläge (durch E-37)

| Nr. | Vorschlag | Details |
|---|---|---|
| V-01 | ADT-Anbindung als eigener MCP-Server direkt gegen die ADT-REST-Schnittstelle, kein Eclipse | [03](03-adt-integration.md) |
| V-02 | Workspace je Aufgabe mit ausgecheckten Quelltextdateien | [03](03-adt-integration.md) |
| V-03 | „Erst speichern, wenn syntaktisch korrekt" wird im `push`-Tool erzwungen, nicht im Prompt | [03](03-adt-integration.md) |
| V-04 | Tool-Gateway mit Policy je Tool: erlauben / erlauben + melden / Freigabe / verbieten | [02](02-architektur.md) |
| V-05 | Bei Freigabe führt die Plattform den gespeicherten Aufruf aus, nicht der Agent | [04](04-freigabe-postfach.md) |
| V-06 | Schreibende Tools des bestehenden SAP-MCP für Agenten ausblenden (ein Schreibweg) | [03](03-adt-integration.md) |
| V-07 | Agenten als Daten in der Datenbank, in der UI konfigurierbar | [02](02-architektur.md) |
| V-08 | SQLite über das in Node eingebaute Modul (keine nativen Zusatzpakete → ZIP-Übertragung unkritisch) | [02](02-architektur.md) |
| V-09 | Monorepo: `apps/server`, `apps/web`, `packages/shared`, `packages/adt-mcp` | [02](02-architektur.md) |
| V-10 | Kontext nach Postfach-Antwort: Session-Wiederaufnahme **plus** Übergabenotiz je Eintrag als Absicherung | [04](04-freigabe-postfach.md) |
| V-11 | Paket-Sperre im ADT-MCP: schreibt nur in erlaubte Pakete, technisch erzwungen | [03](03-adt-integration.md) |
| V-12 | Simulierte Gegenstellen (SAP, Jira/Confluence) für die Entwicklung auf dem Privatrechner; Diagnosebefehl für den Firmenrechner | [07](07-roadmap.md) |
| V-13 | Orchestrator als spätere Ausbaustufe: feste Abläufe wo möglich, Agent nur fürs Zerlegen und Verteilen | [02](02-architektur.md) |
| V-14 | Credit-Budget je Lauf und Gesamtanzeige in der App | [02](02-architektur.md) |
| V-15 | Agenten-Laufzeit hinter einer schmalen Schnittstelle, mit simulierter Laufzeit (Drehbuch statt Modell) für Tests auf dem Privatrechner | [07](07-roadmap.md) |
| V-16 | Abgelaufene SAP-Anmeldung: Lauf pausiert, Hinweis in der App, nach erneuter Anmeldung geht es weiter | [03](03-adt-integration.md) |
| V-17 | Wenige, verbreitete, fest versionierte Abhängigkeiten; Liste vorab zur Prüfung gegen Nexus | [07](07-roadmap.md) |
