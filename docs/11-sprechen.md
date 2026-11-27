# 11 – Sprechen: Voice Agent

Status: **gebaut 2026-11-27, auf dem Privatrechner mit echten Modellen für Erkennung und Stimme
getestet (Simulation statt Copilot). Abnahme am Firmenrechner steht aus – Checkliste unten.**
Grundlage: Entscheidungen E-73 bis E-78.

## Wozu

Ein Agent, mit dem man spricht wie mit ChatGPT: reden, zuhören, antworten. Er gehört fest zur App
(Agent „Sprachassistent“, Kennung `sprache`) und hat vorerst eine **eigene Seite „Sprechen“**. In
den Chat kommt er erst, wenn er gut funktioniert. Er kann vorerst **nur reden**: keine Tools, keine
MCP-Server.

## Aufbau

```
Browser (Edge)                                Server (Node)
Mikrofon 16 kHz ── je 100 ms ──────────────▶  Sprechpausen-Erkennung (Silero VAD)
  Echo-/Rauschunterdrückung des Browsers        │ Äußerung fertig (0,6 s Stille)
                                                ▼
                                              Erkennung (Parakeet v3) ──▶ Text
                                                ▼
                                              Agent „Sprachassistent“ (Copilot, gestreamt)
                                                ▼ Sätze, sobald sie fertig sind
Wiedergabe Satz für Satz  ◀── WAV je Satz ──  Stimme (Piper Thorsten)
```

| Teil | Wo | Was |
|---|---|---|
| Modelle laden | [server/sprache/modelle.ts](../server/sprache/modelle.ts) | Download von GitHub (sherpa-onnx-Veröffentlichungen), Entpacken mit dem `tar` des Systems (Windows: `System32\tar.exe`) |
| Erkennung, Stimme, VAD | [server/sprache/bausteine.ts](../server/sprache/bausteine.ts) | sherpa-onnx, alles auf der CPU, je 2 Threads |
| Ablauf einer Runde | [server/sprache/gespraech.ts](../server/sprache/gespraech.ts) | Unterbrechen, Sätze der Reihe nach sprechen, Messwerte |
| Sätze, Markdown | [server/sprache/saetze.ts](../server/sprache/saetze.ts) | „z. B.“, „am 3. Mai“ beenden keinen Satz; Markdown und Code werden nicht vorgelesen |
| Agent | [server/sprache/sprach-agent.ts](../server/sprache/sprach-agent.ts) | Auftrag fürs Gespräch, Vorschlag für ein schnelles Modell |
| Dienst, Routen | [server/sprache/sprach-dienst.ts](../server/sprache/sprach-dienst.ts), [server/http/routen-sprache.ts](../server/http/routen-sprache.ts) | Gespräche im Speicher, Verbrauch in der Datenbank |
| Seite | [oberflaeche/seiten/SprechenSeite.tsx](../oberflaeche/seiten/SprechenSeite.tsx), [oberflaeche/sprache/](../oberflaeche/sprache/) | Mikrofon (AudioWorklet), Wiedergabe, Gesprächslogik |

### Modelle (E-75, E-76)

| Modell | Größe Download | Zweck |
|---|---|---|
| Parakeet TDT 0.6B v3 (int8) | 465 MB | Erkennung, 25 europäische Sprachen inkl. Deutsch |
| Piper `de_DE-thorsten-medium` | 64 MB | Stimme |
| Silero VAD | 1 MB | Wann spricht jemand, wann ist er fertig |

Sie liegen in `daten/modelle/` und werden **beim Start im Hintergrund geladen**, wenn sie fehlen.
Klappt das nicht, zeigt die Seite „Sprechen“ den Fehler, die Adressen und den Befehl zum Entpacken
von Hand. Die Einrichtungsseite hat eine Zeile „Sprechen“.

### Agent und Modell (E-74, E-77)

- Modell, Thinking Effort und Auftrag werden wie bei jedem Agenten eingestellt – auf der Seite
  „Sprechen“ (Modell) oder „Agenten“ (alles). Ein Wechsel gilt ab der nächsten Äußerung, der
  Gesprächsverlauf bleibt.
- Beim **ersten Gespräch** trägt die App ein schnelles Modell ein (Name enthält mini, flash, nano …,
  das günstigste, niedrigster Thinking Effort). Danach entscheidet David.
- Die Copilot-Sitzung bekommt **keine Tools** (`availableTools: []`) und als Systemprompt **nur den
  Auftrag** (`systemMessage` „replace“). Der Systemprompt von Copilot ist aufs Programmieren
  ausgelegt und lang – ohne ihn antwortet das Modell schneller und natürlicher.
- Gespräche werden nicht aufgehoben: Seite verlassen oder „Beenden“ löscht die Sitzung. Der
  Verbrauch steht trotzdem auf der Seite „Verbrauch“ (Agent „Sprachassistent“).

### Unterbrechen (E-78)

- **Neue Äußerung** bricht die laufende Antwort ab – die neue gilt.
- **Knopf „Unterbrechen“**: Stimme stoppt sofort, das Modell wird abgebrochen.
- **Durch Sprechen unterbrechen** ist ein Schalter, Standard **aus**: Ohne Headset hört das
  Mikrofon die Stimme aus dem Lautsprecher und würde sich selbst unterbrechen. Solange die Stimme
  spricht (und 0,3 s danach), hört das Mikrofon dann nicht zu.

### Messwerte

Unter jeder Antwort steht, wie lange es ab dem Ende des Sprechens dauerte: *erkannt in*, *erster
Text nach*, *erster Ton nach*. Auf dem Mac (M-Prozessor) gemessen, Simulation statt Copilot:

| Schritt | Dauer |
|---|---|
| Modelle in den Speicher laden (einmal, beim ersten Gespräch) | 1,4 s |
| Erkennung eines Satzes von 4,7 s | 0,19 s |
| Stimme für einen Satz von 4,7 s | 0,17 s |
| Erster Ton nach Sprechende (Simulation wartet selbst 0,3 s) | 0,4–0,55 s |

Dazu kommen 0,6 s Pause, bis die Äußerung als fertig gilt, und die Antwortzeit des Modells.

## Grenzen und bekannte Lücken

- „ABAP“ wird als „Abab“ erkannt. Fachbegriffe bringen dem Modell später ggf. Hotwords oder ein
  Hinweis im Auftrag bei.
- Firefox mag das Mikrofon mit 16 kHz nicht; Edge und Chrome rechnen selbst um.
- Downloads hinter einem Firmen-Proxy: Node 22.16 nutzt `HTTPS_PROXY` nicht von selbst. Dann von
  Hand laden (Seite „Sprechen“ zeigt wie).
- sherpa-onnx ist bewusst auf **1.13.8** festgelegt: Ab 2.0 fehlt die eingebaute Aussprache (espeak)
  für Piper-Stimmen.

## Abnahme am Firmenrechner

1. `npm install` über Nexus: neu sind `sherpa-onnx-node` 1.13.8 und `sherpa-onnx-win-x64` 1.13.8.
2. `npm start`. In der Konsole: „Sprechen: lade fehlende Modelle …“ und nach ein paar Minuten
   „Sprechen: Modelle sind da.“ – oder eine Fehlermeldung (Foto).
3. Seite **Einrichtung**: Zeile „Sprechen“ grün?
4. Falls der Download scheitert: Seite **Sprechen** zeigt Adressen und Befehl. Dateien auf anderem
   Weg holen, nach `daten\modelle` entpacken, Seite neu laden.
5. Seite **Sprechen** → **Start**. Edge fragt nach dem Mikrofon → erlauben. (Kommt keine Frage und
   ein Fehler: Foto – dann sperrt evtl. eine Richtlinie das Mikrofon.)
6. Steht ein Modell in der Auswahl (schnelles Modell vorgeschlagen)? Welches? Foto.
7. „Hallo, wer bist du?“ sagen. Kommt eine gesprochene Antwort? Wie klingt sie?
8. Messwerte unter der Antwort notieren (*erkannt in*, *erster Text nach*, *erster Ton nach*).
9. Andere Modelle durchprobieren, auch Thinking Effort aus/niedrig. Welches fühlt sich am besten an?
10. Fragen: „Welche Werkzeuge hast du?“ – er darf keine haben und soll das sagen.
11. Lange Antwort anfordern und mit **Unterbrechen** stoppen. Mit Headset: Schalter „Durch Sprechen
    unterbrechen“ an und dazwischenreden.
12. Seite wechseln und zurück: Gespräch ist beendet, neues startet sauber.
13. Seite **Verbrauch**: Zeile „Sprachassistent“ vorhanden?
