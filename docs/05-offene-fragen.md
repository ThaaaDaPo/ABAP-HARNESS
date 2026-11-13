# 05 – Offene Fragen

Beantwortete Fragen wandern als Entscheidung nach [06-entscheidungen](06-entscheidungen.md).
Runden 1–3 und die Freigabe sind erledigt (E-06 bis E-39).

## An David

- **K1 – Copilot auf dem Privatrechner**: Das SDK läuft hier über deinen privaten GitHub-Login.
  Darf das für Tests der Plattform genutzt werden (verbraucht Kontingent deines privaten
  Kontos)? Wenn ja, kann die Agenten-Laufzeit hier echt getestet werden, und das Risiko aus
  E-24 schrumpft deutlich. Wenn nein, bleibt es bei der simulierten Laufzeit.
- **K2 – Prüfpaket auf dem Firmenrechner ausführen**: siehe
  [pruefpaket/README.md](../pruefpaket/README.md). Ergebnis als Foto oder QR-Text zurückbringen.

## Zurückgestellt

- Transporte und Arbeiten außerhalb `$TMP`: nach Abstimmung im Unternehmen (E-13, E-28).
- Teams-Benachrichtigung (E-21).
- Parallele Läufe (E-19).

## Technik – Stand Phase 0

| Nr. | Frage | Privatrechner | Firmenrechner |
|---|---|---|---|
| T0 | Umgebung (Node ≥ 22.15, Windows) | – | offen (U1–U7) |
| T1 | Copilot SDK: Tools, MCP, Abfangen, Dateigrenze, Fortsetzen | bestätigt | offen (C1–C8) |
| T2 | ADT mit Browser-Cookie | nicht prüfbar | offen (S2–S4) |
| T3 | Syntaxprüfung mit ungespeichertem Quelltext | nicht prüfbar | offen (S6) |
| T4 | Anlegen/Speichern/Aktivieren/Unit-Test/Löschen in `$TMP` | nicht prüfbar | offen (S5, S7–S10) |
| T5 | Abhängigkeiten über Nexus | – | offen (`npm install`) |

Der SAP-Teil des Prüfpakets (S2–S10) ist ungetestet geschrieben: Er folgt den Typen und dem
Quelltext von `abap-adt-api`, lief aber noch nie gegen ein System. Fehler dort sind beim ersten
Lauf wahrscheinlich und kein Zeichen, dass der Ansatz nicht trägt.

## Hinweise für die Umsetzung

- Prompts und Tool-Beschreibungen können hier nicht gegen die Firmen-Modelle erprobt werden; das
  Feintuning passiert auf dem Firmenrechner und muss in der App ohne Code-Änderung möglich sein.
- Modelle reagieren auf Wörter wie „geheim" in Tool-Beschreibungen mit Verweigerung – in Phase 0
  beobachtet. Tool-Beschreibungen sachlich halten.
