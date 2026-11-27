# 07 – Roadmap (Vorschlag)

Status: **Vorschlag von Claude, noch nicht bestätigt.**

## Ausgangslage (E-15, E-24, E-25)

| | Privatrechner | Firmenrechner |
|---|---|---|
| Claude (baut) | ja | nein |
| Copilot | **nein** | ja |
| SAP, Jira, Confluence | nein | ja |
| npm | öffentlich | über Nexus |

Übertragung hin: ZIP. Rückweg: Handyfotos vom Bildschirm.

Das heißt: **Auf dem Privatrechner kann weder ein echter Agent laufen noch eine echte Anbindung
getestet werden.** Alles, was hier entsteht, wird gegen Stellvertreter getestet; die Wahrheit
zeigt sich erst auf dem Firmenrechner. Jede Runde hin und zurück ist teuer. Darauf ist das
Vorgehen ausgelegt:

1. **Stellvertreter für alles Externe**
   - *Simulierte Agenten-Laufzeit*: statt eines Modells läuft ein Drehbuch („rufe Tool X, dann Y,
     dann antworte Z"). Damit sind Gateway, Postfach, Wiederaufnahme, Oberfläche vollständig testbar.
   - *Simulierte Gegenstellen* für SAP-MCP, ADT, Jira/Confluence – inkl. Syntaxfehlern, Sperren,
     abgelaufener Anmeldung.
   - Umschalten echt/simuliert per Einstellung.
2. **Schmale Anbindungsschichten**: Der Code, der wirklich mit Copilot SDK bzw. ADT spricht, ist
   klein und isoliert. Nur dieser Teil ist „blind" geschrieben. Das SDK-Paket lässt sich hier
   installieren, also wird wenigstens gegen seine echten Typen kompiliert.
3. **Unsicheres zuerst**: Phase 0 prüft genau die blinden Stellen, bevor der Rest gebaut wird.
4. **Fotografierbare Diagnose**: Jeder Prüfschritt hat eine Nummer und ein Ergebnis in einer
   Zeile (`T3 FEHLER ADT-412: …`). Zusammenfassung passt auf einen Bildschirm; Details nur auf
   Wunsch je Schritt. Zusätzlich der ausführliche Bericht als QR-Code (E-36), damit Details
   fehlerfrei als Text zurückkommen.
6. **Windows/macOS (E-32)**: gebaut auf macOS, betrieben auf Windows. Keine Shell-Skripte, keine
   fest verdrahteten Pfadtrenner, Zeilenenden beachten.
7. **Feintuning ohne Code (E-34)**: Prompts und Tool-Beschreibungen können hier nicht gegen
   GPT/Gemini erprobt werden. Sie müssen auf dem Firmenrechner in der App änderbar sein.
5. **Nexus (E-23)**: keine feste Registry im Projekt, wenige verbreitete Abhängigkeiten mit festen
   Versionen, keine nativen Pakete. Die Liste der Abhängigkeiten steht vor dem Bau fest, damit
   David die Verfügbarkeit in Nexus prüfen kann.

## Phase 0 – Prüfpaket für den Firmenrechner

**Stand 2026-11-13: abgeschlossen.** Gebaut in [pruefpaket/](../pruefpaket/); Umgebung,
Copilot und SAP auf dem Firmenrechner erfolgreich. Die Architektur ist bestätigt, ein
Ausweichweg ist nicht nötig.

Kleines eigenständiges Paket. Prüft der Reihe nach T0–T5 aus
[05-offene-fragen](05-offene-fragen.md) und zeigt eine Ergebnistabelle.

Ergebnis: Die Annahmen über Copilot SDK und ADT sind bestätigt oder korrigiert, **bevor** die
Plattform darauf aufbaut. Vermutlich zwei bis drei Runden hin und zurück.

## Phase 1 – Plattformkern

Agenten anlegen, Chat, Lauf live verfolgen, Tool-Gateway mit Policies, Postfach mit Antworten und
Wiederaufnahme, Instructions/Skills verwalten, Credit-Anzeige. Hier vollständig gegen
Stellvertreter getestet.

## Phase 2 – Doku-Agent

**Übersprungen (E-62).** Mit Phase 1 ist das reine Einrichtung in der App; David macht das selbst
auf dem Firmenrechner. Gedacht war: liest ABAP-Objekt und ggf. Ticket, schreibt Doku, legt die
Confluence-Seite als Vorschlag vor.

## Phase 3 – ADT-MCP und ABAP-Entwickler

**Gestartet 2026-11-25**, Stand in [09-phase-3](09-phase-3.md). Workspace, auschecken/prüfen/
speichern/aktivieren, Unit-Tests, ATC, Paket-Sperre, Vergleich vorher/nachher nebeneinander und
„Rückgängig“ im Chat (E-64, E-65). Klassen, Interfaces, Reports, Funktionsbausteine.

## Phase 4 – Zeitsteuerung und Workflows

Gespeicherte Abläufe mit Zeitplan. Läuft nur, wenn der Rechner an und die SAP-Anmeldung gültig ist.
Dazu das **Postfach** (E-52): Freigaben, Rückfragen und Meldungen aus Workflows, die ohne David
laufen. Gebaut und getestet ist es seit Phase 1, Schritt 3; es zeigt nur Aufgaben mit Herkunft
`workflow` und ist bis dahin in der Navigation ausgegraut.

## Phase 5 – Orchestrator und parallele Läufe

## Übergabe an den Firmenrechner

Phasen 1–3 können am Stück gebaut und zusammen übertragen werden (Wunsch aus C1), **aber erst
nach Phase 0**. Auf dem Firmenrechner dann zuerst der Diagnosebefehl, danach der Betrieb mit
Stellvertretern (zeigt, dass die App an sich läuft), dann Umschalten auf echt – Baustein für
Baustein, damit ein Fehler eindeutig zuzuordnen ist.
