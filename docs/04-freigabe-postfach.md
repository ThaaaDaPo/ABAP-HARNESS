# 04 – Freigaben und Postfach (Vorschlag)

Status: **Vorschlag von Claude, noch nicht bestätigt.**

## Problem

In Eclipse fragt der Agent nach Freigabe und steht dann still. Gewünscht: Der Agent legt seinen
Vorschlag ab, arbeitet an anderem weiter, und David gibt später frei.

## Lösung: Vorschlag statt Ausführung

Ruft ein Agent ein Tool mit Policy `freigabe` auf (z. B. „Confluence-Seite anlegen"), passiert im
Tool-Gateway Folgendes:

1. Der Aufruf wird **nicht ausgeführt**, sondern mit allen Parametern als **Postfach-Eintrag**
   gespeichert.
2. Der Agent bekommt als Tool-Ergebnis: „Als Vorschlag #12 abgelegt, wartet auf Freigabe. Mach mit
   Arbeit weiter, die davon nicht abhängt."
3. Hängt der Rest der Aufgabe am Ergebnis, beendet der Agent den Lauf; die Aufgabe geht auf
   `wartet auf Freigabe`, und der Scheduler startet die nächste Aufgabe.

Bei Freigabe führt **die Plattform** den gespeicherten Aufruf aus – nicht der Agent noch einmal.
Dadurch wird exakt das ausgeführt, was David gesehen (oder bearbeitet) hat.

## Aktionen im Postfach

| Aktion | Folge |
|---|---|
| Freigeben | Aufruf wird ausgeführt, Ergebnis geht an die Aufgabe |
| Antworten („ändere das so …") | Agent wird mit vollem Kontext fortgesetzt, überarbeitet, legt neuen Stand ab (E-22) |
| Verwerfen | Vorschlag wird nicht ausgeführt, Thema geschlossen |
| Zur Kenntnis genommen | für Meldungen ohne Freigabe (z. B. Vorher/Nachher einer ABAP-Änderung) |
| Rückgängig | nur bei Änderungsmeldungen: stellt den Vorher-Stand wieder her (E-31, Details in [03](03-adt-integration.md)) |

Antworten ist bei **jedem** Eintrag möglich, auch bei reinen Meldungen und bereits erledigten
Themen.

## Kontext nach „Thema beendet" (E-22, V-10)

Anforderung: Der Agent legt ab, das Thema ist für ihn beendet, er macht mit dem nächsten weiter.
Antwortet David später, hat der Agent wieder den Kontext.

Jeder Postfach-Eintrag hängt an einem **Thema** (Aufgabe). Zum Thema gehören dauerhaft:

1. **Der Gesprächsverlauf** des Laufs (alle Nachrichten und Tool-Aufrufe).
2. **Das Arbeitsverzeichnis** mit den Dateien – bleibt liegen, bis das Thema geschlossen wird.
3. **Eine Übergabenotiz**, die der Agent beim Ablegen schreibt: was war das Ziel, was wurde
   getan, welche Entscheidungen und warum, was ist offen. Für David unsichtbar, aber einsehbar.

Bei einer Antwort gibt es zwei Wege, und beide werden vorgesehen:

- **Fortsetzen**: die ursprüngliche Session wird wieder aufgenommen und bekommt Davids Antwort.
  Voller Kontext, setzt aber voraus, dass das SDK das zuverlässig kann (E1).
- **Neu aufsetzen mit Übergabenotiz**: ein frischer Lauf bekommt Übergabenotiz, Vorschlag,
  Davids Antwort und das Arbeitsverzeichnis. Funktioniert immer, auch nach Wochen, und ist
  günstiger, weil nicht der ganze alte Verlauf erneut Credits kostet.

Die Übergabenotiz entspricht Davids Idee der „versteckten Dateien am Postfach-Eintrag".

Der Agent ist dabei nicht „derselbe wartende Prozess": Zwischen Ablegen und Antwort läuft nichts
und es wird nichts verbraucht.

## Darstellung je Typ

Der Eintrag soll zeigen, **was passieren würde**, nicht rohe Tool-Parameter:

- Confluence-Seite: gerenderte Vorschau, Zielbereich und übergeordnete Seite
- Jira: „Ticket ABC-123 von *In Arbeit* nach *Review*"
- ABAP (falls unter Freigabe): Diff alt/neu, Prüfergebnisse
- Rückfrage des Agenten: Frage mit Antwortfeld (zweiter Eintragstyp neben Freigaben)

## Eintragstypen

1. **Freigabe** – ein konkreter, ausführbarer Tool-Aufruf (z. B. Confluence-Seite)
2. **Änderungsmeldung** – bereits ausgeführt, mit Vorher/Nachher (z. B. lokale ABAP-Änderung)
3. **Rückfrage** – der Agent braucht eine Entscheidung oder Information
4. **Ergebnis** – „Aufgabe fertig, hier die Zusammenfassung"

Benachrichtigung: nur in der App, Teams evtl. später (E-21). Ein Freigebender: David (E-06).

## Zu klären

- Soll ein Vorschlag neu geprüft werden, wenn sich das Ziel inzwischen geändert hat
  (z. B. Seite wurde von jemand anderem bearbeitet)?
