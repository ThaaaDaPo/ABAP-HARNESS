# 03 – ADT-Integration, Workspace und Fehler-Feedback (Vorschlag)

Status: **Vorschlag von Claude, noch nicht bestätigt.**

## Kernaussage

Eclipse ist nur ein Client. Alles, was ADT in Eclipse tut, läuft über die **ADT-REST-Schnittstelle**
des SAP-Systems (`/sap/bc/adt/...`). Ein dunkel laufender Agent braucht also kein Eclipse, sondern
einen eigenen kleinen Client für diese Schnittstelle – verpackt als MCP-Server („ADT-MCP").

Für Node/TypeScript gibt es dafür die Bibliothek `abap-adt-api` (Basis der ABAP-Erweiterung für
VS Code). Sie deckt Lesen, Sperren, Schreiben, Syntaxprüfung, Aktivieren, ATC, Unit-Tests und
Transporte ab. Eignung für unser System muss im Spike geprüft werden.

## Fehler vor dem Speichern

Das, was Eclipse als rote Markierungen zeigt, kommt aus dem ADT-Dienst **Check-Run**
(`/sap/bc/adt/checkruns`). Der Client schickt den **ungespeicherten Quelltext** mit, das System
prüft ihn und liefert Meldungen mit Zeile, Spalte, Schweregrad und Text zurück – ohne dass
gespeichert wird.

Damit ist das gewünschte Verhalten machbar: Der Agent prüft seinen Entwurf gegen das echte System
und speichert erst bei null Fehlern.

## Workspace-Modell

Jede Aufgabe bekommt ein eigenes Arbeitsverzeichnis (wie der Eclipse-Workspace):

```
workspaces/<aufgabe>/
  src/zcl_beispiel.clas.abap      ← ausgecheckter Quelltext
  src/zcl_beispiel.clas.testclasses.abap
  .adt/state.json                 ← Objekt-URI, Version/ETag beim Auschecken, Transport
```

Vorteil: Der Agent bearbeitet **normale Dateien** mit den eingebauten Datei-Werkzeugen von Copilot
(gezielte Edits statt ganze Klasse neu senden). Das ist das, worin die Modelle am besten sind, und
spart Tokens.

## Werkzeuge des ADT-MCP (wenige, grobe Tools)

| Tool | Wirkung |
|---|---|
| `checkout(objekt)` | Quelltext ins Workspace holen, Stand merken |
| `check(datei)` | Syntaxprüfung des lokalen, ungespeicherten Stands → Fehlerliste |
| `push(datei)` | **prüfen → sperren → speichern (inaktiv) → entsperren**; bricht bei Syntaxfehlern ab |
| `activate(objekte)` | aktivieren, Aktivierungsmeldungen zurückgeben |
| `create(typ, name, paket)` | neues Objekt anlegen und auschecken |
| `run_unit_tests(objekt)` | ABAP Unit ausführen |
| `run_atc(objekt)` | ATC-Prüfung |

Transport-Tools gibt es vorerst nicht: gearbeitet wird nur mit lokalen Objekten (E-13).
Objekttypen zum Start: Klassen, Interfaces, Reports, Funktionsbausteine (E-11).

Grundsätze:

- **Paket-Sperre (V-11)**: Der ADT-MCP schreibt nur in konfigurierte Pakete (Start: lokales
  Paket). Jedes `create`, `push` und `activate` prüft vorher das Paket des Objekts im System und
  verweigert alles andere. Nötig, weil der Agent unter Davids Benutzer läuft und sonst alles
  dürfte, was David darf. Start: nur `$TMP` (E-28). Die Liste ist Konfiguration, damit später
  weitere Pakete freigeschaltet werden können – dann kommen auch Transport-Tools dazu.
- **Rückgängig (E-31)**: Zu jedem `push` wird der Vorher-Stand aufbewahrt. „Rückgängig" im
  Postfach schreibt ihn zurück und aktiviert; bei neu angelegten Objekten wird das Objekt
  gelöscht. Wurde das Objekt seither erneut geändert, wird gewarnt statt überschrieben.
- **Vorher/Nachher (E-20)**: `push` liefert den Stand vor und nach der Änderung an die Plattform;
  daraus entsteht der Postfach-Eintrag.
- **Die Regel „erst speichern, wenn syntaktisch korrekt" steckt im Tool, nicht im Prompt.**
  `push` prüft immer selbst und verweigert bei Fehlern. Der Agent kann die Regel nicht vergessen.
- **Fehlermeldungen sind für den Agenten formuliert**: Datei, Zeile, Meldung, plus die
  betroffenen Quelltextzeilen. So kann er direkt korrigieren.
- **Konflikterkennung**: Hat sich das Objekt seit dem Auschecken im System geändert, bricht
  `push` ab statt zu überschreiben.
- **Sperren kurz halten**: nur während des Speicherns, nie über die ganze Aufgabe. Keine
  verwaisten Sperren, wenn ein Lauf abbricht.
- Optional per Hook: nach jeder Dateiänderung automatisch `check` ausführen und das Ergebnis dem
  Agenten zurückgeben – entspricht den Live-Markierungen in Eclipse.

## Trennung SAP-MCP ↔ ADT-MCP

| | SAP-MCP (bestehend) | ADT-MCP (neu) |
|---|---|---|
| Zweck | **Erkunden**: suchen, lesen, Verwendungsnachweis, Tabellen, Doku | **Ändern**: Workspace, prüfen, speichern, aktivieren, testen |
| Zustand | zustandslos | zustandsbehaftet (Workspace, Sperren) |
| Wer bekommt es | alle Agenten | nur der ABAP-Entwickler |

Die Trennung wird über die Tool-Auswahl je Agent durchgesetzt: Die schreibenden Tools des
bestehenden SAP-MCP (Objekte erstellen usw.) werden für die Agenten **ausgeblendet**, damit es
genau einen Schreibweg gibt.

Zu beachten: Der bestehende SAP-MCP liest vermutlich die **aktive** Version. Nach einem `push`
ohne Aktivierung ist das Workspace bzw. die inaktive Version die Wahrheit. Für eigene, gerade
bearbeitete Objekte muss der Agent also die Workspace-Datei lesen, nicht den SAP-MCP. Das gehört
in den Systemprompt des Entwicklers und in die Tool-Beschreibungen.

## Anmeldung (E-26)

Der bestehende Node-Proxy meldet sich mit einem **Cookie aus dem Browser** an. Der ADT-MCP nimmt
denselben Weg. Das ist eine gute Nachricht: Ein gültiges Anmelde-Cookie gilt in der Regel für
alle Dienste des Systems, also auch für `/sap/bc/adt`. Zu prüfen in Phase 0 (T2).

Der Proxy holt sich das Cookie automatisch, ohne Zutun (E-33). **Wie** er das tut, ist noch
unbekannt und muss vor dem Bau des ADT-MCP geklärt werden (offene Frage J2). Der Anmelde-Teil
des ADT-MCP ist deshalb ein austauschbarer Baustein: entweder Nachbau des Proxy-Mechanismus oder
direkte Einbindung des Proxy-Bausteins.

Zusätzlich braucht ADT für schreibende Aufrufe ein CSRF-Token und für Sperren eine
zustandsbehaftete Sitzung – beides Standard, aber Teil der Prüfung.

**Abgelaufene Anmeldung (V-16):** Cookies laufen ab. Erkennt der ADT-MCP das, schlägt der Lauf
nicht fehl, sondern pausiert; in der App erscheint „SAP-Anmeldung erneuern". Danach geht es
weiter. Für zeitgesteuerte Läufe heißt das: Sie brauchen eine gültige Anmeldung zum Startzeitpunkt
(offene Frage I2).

**Rolle des SICF-Dienstes (E-27):** ADT ist der Hauptweg fürs Entwickeln. Der SICF-Dienst ist
erweiterbar und dient als Lückenfüller, falls ein einzelner ADT-Dienst nicht wie erwartet
funktioniert. Der ADT-MCP wird so gebaut, dass die Gegenstelle austauschbar ist – das brauchen
wir ohnehin für die simulierte Gegenstelle auf dem Privatrechner (V-12).

## Offene technische Punkte (Phase 0, nur auf dem Firmenrechner prüfbar)

1. Anmeldung an `/sap/bc/adt` mit dem Browser-Cookie aus Node.
2. Syntaxprüfung mit ungespeichertem Quelltext (Klasse, Interface, Report, Funktionsbaustein).
3. Verhalten bei Klassen mit mehreren Includes (Definitionen, Testklassen, lokale Typen).
4. Funktionsbausteine: Anlegen der Funktionsgruppe im lokalen Paket.
