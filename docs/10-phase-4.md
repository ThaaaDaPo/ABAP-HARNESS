# 10 – Phase 4: Workflows und Zeitsteuerung

Status: **gebaut 2026-11-27, auf dem Privatrechner gegen Simulation und Stellvertreter getestet.
Abnahme am Firmenrechner steht aus – Checkliste unten.**
Grundlage: Entscheidungen E-16, E-52, E-66 bis E-72.

## Wozu

Ein Skill ist eine Anleitung für das Modell – ob es sich daran hält, ist Wahrscheinlichkeit. Ein
Workflow ist ein **fester Ablauf**: Tool-Schritte laufen ohne KI genau so, wie sie dastehen, und
KI-Schritte gibt es nur dort, wo es wirklich eine KI braucht. Ein Workflow mit einem einzigen
KI-Schritt ist der „generische“ Fall, der alles der KI überlässt – es gibt kein zweites Konzept.

## Aufbau

### Die Datei (E-66)

Je Workflow eine Datei `<kennung>.workflow.json` im Workflow-Ordner (`workflowOrdner` in
`einstellungen.json`, Standard `daten/workflows`). Die Datei ist die Wahrheit, wie bei den
Instructions: Wer sie außerhalb der App ändert, sieht das in der App, und sie lässt sich per ZIP
mitnehmen. Beim allerersten Start entsteht das Beispiel **Tickets einschätzen**
([server/workflows/beispiel.ts](../server/workflows/beispiel.ts)).

| Teil | Bedeutung |
|---|---|
| Name, Beschreibung | Die Beschreibung liest der Agent, wenn er den Workflow starten darf |
| Start | **Manuell**, **durch Agent**, **zeitgesteuert** – mehrere gleichzeitig möglich |
| Eingaben | Name, Typ (Text, Zahl, ja/nein, Liste), Pflicht, Standardwert. In Schritten `{{eingaben.name}}` |
| Schritte | siehe unten |
| Ergebnis | Text mit Platzhaltern – was der Aufrufer am Ende bekommt |
| Credit-Limit | je Lauf, Start 500 AI-Credits (E-69) |

### Schritte

| Art | Wirkung |
|---|---|
| **Tool** | ruft ein MCP-Tool direkt auf, ohne KI. Regel je Schritt (E-67): *Erlauben*, *Erlauben + melden*, *Freigabe nötig*. Bei Fehler: abbrechen oder weitermachen (Ergebnis `{ fehler }`) |
| **KI** | ein Agent bearbeitet einen Auftrag in einer **eigenen, frischen Sitzung** mit seinen Regeln je Tool. Mit **Ergebnisfeldern** meldet er sein Ergebnis über das Tool `ergebnis_melden`; die App prüft jeden Typ, bei Fehlern meldet er neu, vergisst er es, wird einmal nachgefragt |
| **Wenn** | Bedingung (gleich, ungleich, enthält, größer, kleiner, leer, nicht leer, ja, nein) mit *Dann* und *Sonst* |
| **Für jedes** | Schleife über eine Liste (oder JSON-Liste oder Text mit einer Zeile je Eintrag), mit Höchstzahl (max. 100). `{{name}}` und `{{name_nr}}` |
| **Variable setzen** | Text oder Wert in eine Variable |
| **Workflow** | ruft einen anderen Workflow auf und wartet auf sein Ergebnis (höchstens 5 Ebenen tief) |
| **Beenden** | Lauf vorzeitig erfolgreich beenden, mit Ergebnis |

**Platzhalter** ([ausdruecke.ts](../server/workflows/ausdruecke.ts)): `{{name}}`, `{{name.feld}}`,
`{{liste[0].feld}}`. Steht in einem Feld nur ein einziger Platzhalter, bleibt der Typ erhalten
(Liste, Zahl, Objekt); sonst wird Text eingesetzt. Es gibt bewusst **keine Ausdrücke mit Code**
(kein `eval`) – nichts aus Tickets oder Modellantworten wird ausgeführt. JSON-Ergebnisse von Tools
lassen sich direkt mit `{{ergebnis.feld}}` lesen.

### Wo Freigaben erscheinen (E-68)

| Gestartet | Freigaben und Rückfragen |
|---|---|
| manuell, nach Zeitplan, aus einem Workflow, der selbst nicht aus einem Chat kommt | **Postfach** |
| von einem Agenten **im Chat** (auch, wenn darin weitere Workflows starten) | **in diesem Chat** |

In beiden Fällen wartet der Lauf im Aufruf (E-72), bis David entscheidet; auch in der
Lauf-Ansicht lässt sich entscheiden. Feste Tool-Schritte haben keine KI dahinter: dort gibt es nur
*Freigeben* oder *Verwerfen*, keinen Änderungswunsch. *Verwerfen* bricht den Lauf ab.

### Start durch einen Agenten (E-71)

Auf der Agenten-Seite unter **Workflows** wird angehakt, welche Workflows ein Agent starten darf
(nur solche mit „Start durch Agent“). Er bekommt dann zwei Tools:

- `workflow_starten` – Workflow, Eingaben, `warten` (Standard *ja*). Mit Warten bekommt er Status
  und Ergebnis zurück. Ohne Warten kehrt es sofort zurück; im Chat bekommt er eine Nachricht, wenn
  der Lauf fertig ist.
- `workflow_stand` – wo ein Lauf gerade steht bzw. was herauskam.

Im Chat zeigt eine Karte den Stand des Laufs mit Sprung zur Lauf-Ansicht.

### Lauf-Ansicht, Neustart, Fortsetzen

Jeder Lauf hat ein Protokoll: je Schritt (in Schleifen je Durchlauf) Status, Eingabe, Ergebnis,
Meldung; bei KI-Schritten der aufklappbare Verlauf des Agenten. Der Lauf arbeitet mit dem Stand
der Datei beim Start – Änderungen wirken erst beim nächsten Lauf.

Wird die App beendet, während ein Lauf läuft oder wartet, ist er danach **unterbrochen**, seine
offenen Freigaben sind hinfällig. **Fortsetzen** beginnt vorne, übernimmt aber fertige Tool-, KI-
und Workflow-Schritte aus dem Protokoll, statt sie zu wiederholen – es geht beim unterbrochenen
Schritt weiter. Dasselbe gilt für **Erneut versuchen** nach einem Fehler.

### Zeitsteuerung (E-70)

Zur Uhrzeit an angehakten Wochentagen oder alle N Minuten (gezählt ab Start der App). Nur solange
die App läuft. **Verpasste Zeitpunkte werden verworfen** – war der Rechner aus oder im
Ruhezustand, startet der Workflow erst zum nächsten Zeitpunkt. Läuft der letzte zeitgesteuerte
Lauf noch, entfällt der nächste Start.

## Code

```
server/workflows/
  workflow-ordner.ts     Dateien lesen, speichern, löschen; Beispiel beim ersten Start
  pruefen.ts             Aufbau prüfen, Standardwerte, Warnungen, Eingaben umwandeln
  ausdruecke.ts          Platzhalter und Bedingungen (ohne eval)
  ablauf.ts              führt einen Lauf aus, Protokoll je Schritt, Fortsetzen
  schritte/              je Schrittart eine Datei (tool, ki, steuerung, workflow) + gemeinsam.ts
  ergebnis-melden.ts     Tool ergebnis_melden für KI-Schritte mit Feldern
  agenten-werkzeuge.ts   workflow_starten, workflow_stand
  workflow-dienst.ts     Läufe starten, abbrechen, fortsetzen; Credit-Limit; Verbindung zu Chat und Postfach
  zeitsteuerung.ts       Zeitpläne
server/datenbank/workflow-laeufe.ts   Läufe und Protokoll
server/http/routen-workflows.ts       /api/workflows, /api/workflow-laeufe
oberflaeche/seiten/WorkflowsSeite.tsx, oberflaeche/komponenten/workflow/
```

KI-Schritte sind Aufgaben wie Chats (Herkunft `workflow`, mit Laufnummer) und laufen über den
Chat-Dienst (`arbeiteAn`); die Chat-Liste zeigt sie nicht. Die Simulation meldet bei KI-Schritten
mit Ergebnisfeldern selbst ein Beispielergebnis (ja/nein immer *ja*), damit Workflows ohne Copilot
durchlaufen. Im Drehbuch startet eine Nachricht mit „Workflow“ das Beispiel aus dem Chat.

Tests: `server/workflows/*.test.ts` (Bausteine, Läufe, Beispiel mit echter Simulation).

## Bekannte Lücken

- **Änderungswunsch an festen Schritten** gibt es nicht (keine KI dahinter). Wer andere Argumente
  will, verwirft und passt den Workflow an.
- **Credit-Limit** zählt nur die KI-Schritte des Laufs selbst; ein aufgerufener Workflow hat sein
  eigenes Limit.
- Die **alten Freigabewege ohne Warten** (E-44/E-45: Vorschlag ablegen, `auf_freigabe_warten`)
  benutzt seit E-72 nichts mehr außer Aufgaben aus der Zeit davor. Sie bleiben vorerst im Code;
  ausbauen, wenn die Abnahme durch ist.
- Platzhalter auf Variablen, die es nicht gibt, ergeben leeren Text – der Editor warnt noch nicht.
- Copilot: Ob ein Tool-Aufruf (`workflow_starten` mit Warten) beliebig lange warten darf, ist am
  Firmenrechner zu prüfen. Bei Freigaben im Chat (E-54) ging es.

## Abnahme am Firmenrechner

Zuerst im Simulationsmodus (zeigt, dass die App an sich läuft), dann mit `"modus": "copilot"`.

1. **Navigation**: Seite *Workflows* ist da, *Postfach* nicht mehr ausgegraut. *Einrichtung*
   zeigt den Workflow-Ordner als vorhanden und beschreibbar.
2. **Beispiel**: *Workflows → Tickets einschätzen* zeigt die Schrittliste. *Starten* fragt nach
   `status` (vorbelegt „Offen“). Mit dem Jira-Stellvertreter: Lauf wartet auf Freigabe
   „ABAP-124 → In Arbeit“, Zähler am Postfach steht auf 1.
3. **Freigabe im Postfach**: Freigeben → Lauf *erfolgreich*, Ergebnis mit Einschätzung. In der
   Lauf-Ansicht jeden Schritt aufklappen; beim KI-Schritt *Verlauf des Agenten*.
4. **Verwerfen**: zweiter Lauf, im Postfach verwerfen → Lauf *abgebrochen*.
5. **Editor**: neuen Workflow anlegen, Tool-Schritt mit einem echten MCP-Server (Tools vorher
   unter *MCP-Server* neu lesen, dann erscheinen die Argumente), KI-Schritt mit zwei
   Ergebnisfeldern, Bedingung darauf, *Speichern*. Datei im Ordner ansehen. *Als JSON* zeigt dasselbe.
6. **KI-Schritt mit Copilot**: Meldet das Modell sein Ergebnis über `ergebnis_melden`? Greift die
   Bedingung danach? (Foto vom aufgeklappten Verlauf.)
7. **Freigabe im KI-Schritt**: Agent mit Regel *Freigabe* für ein Tool, Workflow mit einem
   KI-Schritt, der es benutzt → Vorschlag im Postfach, Änderungswunsch schreiben → Agent legt neu
   vor; Freigeben → Lauf geht weiter.
8. **Start durch Agent im Chat**: Auf der Agenten-Seite den Workflow anhaken, im Chat darum
   bitten. Karte mit Lauf im Chat, die Freigabe erscheint **im Chat**, nicht im Postfach; nach dem
   Freigeben bekommt der Agent das Ergebnis.
9. **Ohne Warten**: den Agenten bitten, den Workflow „im Hintergrund“ zu starten → er bekommt
   eine Nachricht, wenn der Lauf fertig ist.
10. **Credit-Limit**: Limit auf z. B. 0,01 setzen, Workflow mit KI-Schritt starten → Lauf bricht
    mit „Credit-Limit erreicht“ ab.
11. **Zeitplan**: Workflow ohne Freigabe auf „alle 2 Minuten“ stellen → nach gut 2 Minuten startet
    ein Lauf (Start: Zeitplan). Danach Zeitplan wieder abhaken.
12. **Neustart**: Lauf starten, der auf eine Freigabe wartet, App beenden und neu starten → Lauf
    *unterbrochen*, Freigabe hinfällig. *Fortsetzen* → fertige Schritte bleiben, es geht bei der
    Freigabe weiter.
