# 05 – Offene Fragen

Beantwortete Fragen wandern als Entscheidung nach [06-entscheidungen](06-entscheidungen.md).
Runden 1–3 und die Freigabe sind erledigt (E-06 bis E-39).

## An David

- **L2 – Modelle**: Welche Modelle hat Schritt C2 auf dem Firmenrechner gelistet
  (`bericht\bericht.txt`)? Eilt nicht.

## Zurückgestellt

- Transporte und Arbeiten außerhalb `$TMP`: nach Abstimmung im Unternehmen (E-13, E-28).
- Teams-Benachrichtigung (E-21).
- Parallele Läufe (E-19).

## Technik – Stand Phase 0

| Nr. | Frage | Privatrechner | Firmenrechner |
|---|---|---|---|
| T0 | Umgebung (Node ≥ 22.15, Windows) | – | bestätigt |
| T1 | Copilot SDK: Tools, MCP, Abfangen, Dateigrenze, Fortsetzen | bestätigt | bestätigt (nach `/login` in der Copilot-Kommandozeile) |
| T2 | ADT mit Browser-Cookie | nicht prüfbar | bestätigt |
| T3 | Syntaxprüfung mit ungespeichertem Quelltext | nicht prüfbar | bestätigt |
| T4 | Anlegen/Speichern/Aktivieren/Unit-Test/Löschen in `$TMP` | nicht prüfbar | bestätigt |
| T5 | Abhängigkeiten über Nexus | – | bestätigt |

## Befunde vom Firmenrechner

- 2026-11-13: Node v22.16.0, npm 10.9.2. `npm install` über Nexus erfolgreich (61 Pakete), T5
  damit bestätigt. Warnung: `@effect/platform-node` 4.1.4 und `undici` 8.12.4 (Unterpakete von
  `abap-adt-api`) verlangen Node ≥ 22.19. Ob der SAP-Teil mit 22.16 trotzdem läuft, zeigt
  `pruefen:sap`; sonst Node auf ≥ 22.19 anheben oder ADT-Zugriff ohne diese Bibliothek bauen.

- 2026-11-13, Läufe des Prüfpakets (Angaben von David):
  - **Umgebung U1–U7: alle OK.**
  - **SAP S1–S10: alle OK**, mit Node 22.16 trotz der Warnung. Damit bestätigt: ADT-Anmeldung
    mit Browser-Cookie (T2), Syntaxprüfung mit ungespeichertem Quelltext (T3), Anlegen,
    Speichern, Aktivieren, ABAP Unit und Löschen in `$TMP` (T4). Als URL diente die des
    SAP-MCP-Proxys; ADT liegt auf demselben Host, eine zweite URL ist nicht nötig.
  - Beim Cookie-Holen musste David in Edge ein **Zertifikat anklicken**. Für unbeaufsichtigte
    Läufe relevant: Cookie so lange wie möglich wiederverwenden; ist es abgelaufen, pausiert
    der Lauf mit Hinweis in der App (V-16). Ob eine Edge-Richtlinie die Auswahl automatisieren
    kann, ist offen.
  - **Copilot C1: FEHLER „nicht angemeldet"**, C2–C8 ausgelassen. Das SDK findet auf dem
    Firmenrechner keine Anmeldung, obwohl `npx @github/copilot` dort funktioniert. Ursache
    offen (genauer Meldungstext fehlt noch).
  - Später am selben Tag: **Copilot-Prüfung erfolgreich** (Angabe von David, ohne Einzelzeilen).
    Vorausgegangen war die Empfehlung, sich in `npx @github/copilot` per `/login` anzumelden.
    Für die Plattform heißt das: Die Einrichtung muss diesen Anmeldeschritt prüfen und
    verständlich darauf hinweisen. Noch unbekannt: welche Modelle C2 gelistet hat.
  - **Phase 0 ist damit abgeschlossen: T0 bis T5 auf dem Firmenrechner bestätigt.**

## Hinweise für die Umsetzung

- Prompts und Tool-Beschreibungen können hier nicht gegen die Firmen-Modelle erprobt werden; das
  Feintuning passiert auf dem Firmenrechner und muss in der App ohne Code-Änderung möglich sein.
- Modelle reagieren auf Wörter wie „geheim" in Tool-Beschreibungen mit Verweigerung – in Phase 0
  beobachtet. Tool-Beschreibungen sachlich halten.
