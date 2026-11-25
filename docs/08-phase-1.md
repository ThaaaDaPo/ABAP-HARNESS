# 08 – Phase 1: Plattformkern (Umfang)

Status: **gestartet 2026-11-13. Schritte 1 bis 3 abgenommen, ebenso der Umbau danach (Freigaben im Chat, Agent wartet auf David, E-52/E-54; Nachprüfung 2026-11-24). Schritt 4 gebaut (2026-11-25), Abnahme am Firmenrechner steht aus – Checkliste unter „Abnahme Schritt 4“.**

## Stand Schritt 1 (2026-11-13)

Gebaut: Grundgerüst, Simulation (Drehbuch), Chat mit Live-Ansicht, Copilot-Anbindung mit
Berechtigungsregeln (Dateien nur im Workspace, keine Shell, kein Internet).

Auf dem Privatrechner geprüft (nur Simulation): Chat, Live-Text, Tool-Anzeige, Abbrechen, Sperre
bei laufendem Agenten, Fortsetzen nach Neustart, Oberfläche im Browser, alles auch mit Node 22.16.
Berechtigungsregeln mit `npm test` (6 Tests).

**Nicht geprüft**: die Copilot-Anbindung ([server/laufzeit/copilot/](../server/laufzeit/copilot/)).
Sie ist nach dem Prüfpaket geschrieben, lief aber noch nie. Annahmen, die dort zu prüfen sind:

- `session.idle` kommt nach jeder Antwort zuverlässig (sonst bleibt der Chat auf „arbeitet")
- `streaming: true` liefert `assistant.message_delta`
- `resumeSession` nach Neustart der App
- Ablehnungen der Berechtigungsprüfung landen verständlich beim Agenten

### Abnahme Schritt 1 auf dem Firmenrechner

1. Ohne `einstellungen.json` starten → Simulation: Chat anlegen, „Ticket" schreiben, Antwort läuft live ein.
2. `einstellungen.json` mit `"modus": "copilot"` und eigenem Workspace-Ordner → neu starten.
3. „Was ist 2+2?" → Antwort läuft Wort für Wort ein, danach ist wieder Eingabe möglich.
4. „Lege im Arbeitsverzeichnis die Datei test.txt mit dem Inhalt hallo an" → Tool-Aufruf sichtbar,
   Datei liegt im Workspace-Ordner.
5. „Lies die Datei C:\Windows\win.ini" → wird abgelehnt.
6. „Führe den Befehl dir aus" → wird abgelehnt.
7. App beenden (Strg+C), neu starten, im selben Chat „Welche Datei hast du vorhin angelegt?" →
   Agent weiß es noch.

Bei Fehlern: Foto vom Terminal und vom Browser.

### Ergebnis der Abnahme (2026-11-13, erste Runde)

Alle Punkte in Ordnung bis auf Punkt 6: **`dir` wurde ausgeführt** (laut David zumindest im
Arbeitsverzeichnis). Copilot führt einfache Shell-Befehle offenbar aus, ohne
`onPermissionRequest` zu fragen. Behoben durch eine zweite, unabhängige Sperre in
[berechtigungen.ts](../server/laufzeit/copilot/berechtigungen.ts): Shell-Werkzeuge werden über
`excludedTools` nicht angeboten und über den Hook `onPreToolUse` vor jeder Ausführung
abgelehnt. Erkenntnis für das Tool-Gateway (Schritt 2): **Regeln immer im Hook `onPreToolUse`
durchsetzen, nicht nur in `onPermissionRequest`.**

Zweite Runde: `dir` scheitert jetzt – der Agent hat es auf fünf Wegen versucht, alle abgelehnt.
**Schritt 1 ist damit abgenommen.** Damit der Agent nicht Credits mit Umwegen verbraucht, steht
seitdem im Auftrag jeder Sitzung, dass Shell und Internet gesperrt sind (`umgebungsRegeln` in
[copilot.ts](../server/laufzeit/copilot/copilot.ts)); noch nicht am Firmenrechner geprüft.
Lehre für später: Gesperrtes immer auch dem Agenten sagen, nicht nur technisch sperren.

### Bekannte Lücken (bewusst später)

- Antworten werden als reiner Text angezeigt, Markdown (Fettschrift, Code-Blöcke) noch nicht
  gerendert → Schritt 4, braucht ein zusätzliches Paket.
- Abbrechen hinterlässt keinen Hinweis im Verlauf.
- Ein Agent fest aus `einstellungen.json`; Agentenverwaltung kommt in Schritt 4.

## Stand Schritt 2 (2026-11-13)

Gebaut:

- **Seite „MCP-Server"**: Server eintragen (Schlüssel, Name, Startbefehl, Argumente je Zeile,
  Umgebungsvariablen, Arbeitsordner), Tools auslesen, ändern, löschen. Die App liest die Tools
  mit einem eigenen kleinen MCP-Client aus ([server/mcp/](../server/mcp/)), ohne Zusatzpaket.
  Nur Server, die über stdio laufen (Start als Unterprozess); HTTP-Server bei Bedarf später.
- **Tool-Gateway** ([server/gateway/gateway.ts](../server/gateway/gateway.ts)): je Tool eine
  der vier Regeln, dazu eine Standardregel je Server für alle Tools ohne eigene Regel (auch für
  Tools, die später neu dazukommen). Regeln werden bei jedem Aufruf neu gelesen, Änderungen
  wirken sofort.
  - *erlauben*: wird ausgeführt
  - *melden*: wird ausgeführt, danach Postfach-Eintrag mit Argumenten und Ergebnis
  - *freigabe*: wird nicht ausgeführt; Postfach-Eintrag, der Agent bekommt „Vorschlag #n
    wartet auf Freigabe, nicht wiederholen, weiterarbeiten"
  - *verbieten*: wird dem Agenten gar nicht angeboten (`excludedTools`) und trotzdem abgelehnt
- **Durchsetzung bei Copilot** ([gateway-hooks.ts](../server/laufzeit/copilot/gateway-hooks.ts)):
  im Hook `onPreToolUse` (Lehre aus Schritt 1) und unabhängig davon noch einmal in
  `onPermissionRequest`. Meldungen entstehen im Hook `onPostToolUse`. MCP-Server, die nicht in
  der App eingetragen sind, werden abgelehnt.
- **Postfach-Ablage**: Freigaben und Meldungen landen in der Tabelle `postfach` und erscheinen
  im Chat als Hinweis „Vorschlag #n …". Anzeige und Aktionen im Postfach kommen in Schritt 3.
- **Stellvertreter-Server** [mcp/stellvertreter-sap/](../mcp/stellvertreter-sap/) und
  [mcp/stellvertreter-jira-confluence/](../mcp/stellvertreter-jira-confluence/) mit festen
  Beispieldaten. Sie werden beim ersten Start einmalig mit Regeln eingetragen (SAP: lesen
  erlaubt, `objekt_aendern` verboten; Jira: lesen erlaubt, verschieben melden, Seite anlegen
  Freigabe). Gelöschte Stellvertreter kommen nicht wieder.
- **Simulation**: Tool-Schritte im Drehbuch gehen jetzt durch das Gateway und rufen die
  eingetragenen Server wirklich auf. Stichwörter: *Ticket*, *Klasse*, *Fehler*,
  *verschieben* (melden), *Doku* (Freigabe), *ändern* (verboten).

Auf dem Privatrechner geprüft (nur Simulation, auch mit Node 22.16): alle vier Regeln im Chat,
Postfach-Einträge, Regeländerung wirkt sofort, Eingabeprüfung (Schlüssel, doppelte Server),
verständlicher Fehler bei falschem Startbefehl, keine Restprozesse nach dem Beenden.
`npm test`: 18 Tests (Gateway, MCP-Client gegen echten Stellvertreter-Prozess, Berechtigungen).

### Festlegungen in Schritt 2 (Vorschlag)

- MCP-Server werden in der App eingetragen und in der Datenbank gespeichert, nicht in
  `einstellungen.json` – Windows-Pfade lassen sich so ohne JSON-Schreibweise eintragen.
- Server-Schlüssel ohne Bindestrich (nur `a-z`, `0-9`, `_`): Copilot nennt die Tools
  `<schlüssel>-<tool>`, das Gateway trennt am ersten Bindestrich.
- Neuer Server: Standardregel *Freigabe* – erst fragen, dann schrittweise freigeben.
- Regeln gelten je Agent; bis zur Agentenverwaltung (Schritt 4) gibt es nur den Agenten
  `standard`.
- *melden* erzeugt nur nach erfolgreichen Aufrufen eine Meldung.

### Annahmen, die erst am Firmenrechner geprüft werden können

- Bei Ablehnung im Hook `onPreToolUse` meldet Copilot das Tool als fehlgeschlagen und gibt dem
  Agenten den Grund weiter (im Chat: Tool-Karte „fehlgeschlagen" mit dem Text „Nicht ausgeführt: …").
- `onPermissionRequest` liefert bei MCP-Tools als `serverName` den Schlüssel aus der App.
  Falls nicht, würden **alle** MCP-Aufrufe abgelehnt – dann Foto der Tool-Karte.
- `excludedTools` mit `mcp:<schlüssel>-<tool>` blendet verbotene Tools aus.
- `onPostToolUse` kommt auch für MCP-Tools (sonst fehlt der Hinweis „Meldung #n").
- Umgebungsvariablen: ob Copilot sie zur eigenen Umgebung (PATH) ergänzt oder sie ersetzt.
- Ob die in der Copilot-Kommandozeile eingerichteten MCP-Server auch in SDK-Sitzungen
  auftauchen. Wenn ja, werden ihre Tools abgelehnt (nicht in der App eingetragen).

### Abnahme Schritt 2 auf dem Firmenrechner

Vorher: `npm install`, `einstellungen.json` aus Schritt 1 mit `"modus": "copilot"` behalten.

1. `npm start`, Seite **MCP-Server**: „SAP (Stellvertreter)" und „Jira/Confluence
   (Stellvertreter)" sind da, je mit Tool-Liste und Regeln.
2. Chat: „Lies das Ticket ABAP-123" → Tool `jira-ticket_lesen` erledigt, Antwort nennt die
   Kundengruppe.
3. „Setze ABAP-123 auf Review" → Tool erledigt, darunter orange „Meldung #… im Postfach".
4. „Lege in Confluence im Bereich ABAP eine Seite zu ZCL_KUNDEN_SERVICE an" → Tool
   fehlgeschlagen mit „Nicht ausgeführt: … Vorschlag #…", orange „Vorschlag #… wartet auf
   Freigabe"; der Agent nennt die Nummer und versucht es nicht erneut.
5. „Ändere den Quelltext von ZCL_KUNDEN_SERVICE über den SAP-Server" → der Agent sagt, dass er
   das nicht kann (das Tool wird ihm nicht angeboten).
6. Auf der Seite MCP-Server bei Jira `ticket_lesen` auf **Verbieten** stellen, im selben Chat
   noch einmal Punkt 2 → wird abgelehnt. Danach wieder auf „Standard" stellen.
7. **Echte Server**: zuerst die Stellvertreter löschen (sonst nimmt das Modell gern deren
   Tools, siehe Ergebnis unten), dann „Server eintragen" für den Jira/Confluence-MCP und den
   SAP-MCP, mit dem Startbefehl aus Eclipse (Schlüssel z. B. `atlassian` und `sap`). Argumente
   je eine Zeile. Beim SAP-MCP kann Edge für das Cookie aufgehen. → Tool-Liste erscheint.
8. Lesende Tools auf **Erlauben**, schreibende beim SAP-MCP auf **Verbieten** (V-06). Im Chat
   ein echtes Ticket lesen lassen.

Bitte fotografieren: Tool-Listen der echten Server (Punkt 7 – die Tool-Namen brauchen wir für
die Stellvertreter und spätere Voreinstellungen) und bei Fehlern Terminal und Browser.

### Ergebnis der Abnahme (2026-11-13, erste Runde)

- Echter Atlassian-MCP eingetragen wie in Eclipse (`node.exe` mit `--use-system-ca` und
  Skriptpfad, `env` leer): verbindet sich, Tools werden ausgelesen.
- Solange der Jira-Stellvertreter daneben eingetragen war, rief der Agent dessen Tool auf
  (Argument `schluessel` statt des Parameters des echten Servers). Nach dem Umstellen laufen
  beide eingetragenen MCP-Server (Angabe von David). **Lehre:** Stellvertreter und echte Server
  nicht gleichzeitig eintragen – das Modell wählt zwischen ähnlichen Tools, und die deutschen
  Namen der Stellvertreter passen besser zum deutschen Auftrag.
- Noch offen nach der ersten Runde: Punkte 1–6 und 8, Foto der Tool-Listen der echten Server.

Zweite Runde (2026-11-24): Punkte 1–6 und 8 laut David **alles in Ordnung**, mit echtem
Copilot und eingetragenem echten Atlassian- und SAP-MCP. **Schritt 2 ist damit abgenommen.**
Damit gelten auch die Annahmen zu `onPreToolUse` (Ablehnung kommt beim Agenten an),
`serverName` = Schlüssel aus der App, `excludedTools` und `onPostToolUse` für MCP-Tools als
bestätigt. Nicht einzeln zurückgemeldet:

- Tool-Listen der echten Server (Namen, welche SAP-Tools schreiben) – fehlen weiter, werden
  für Stellvertreter und Voreinstellungen gebraucht.
- Verhalten bei eigenen Umgebungsvariablen (PATH ersetzt oder ergänzt) und ob MCP-Server aus
  der Copilot-Kommandozeile in SDK-Sitzungen auftauchen.

### Bekannte Lücken nach Schritt 2

- ~~Postfach nur als Ablage~~ → erledigt in Schritt 3.
- Regel *verbieten* auf *erlauben* zurückgestellt: Das Tool wird erst angeboten, wenn die
  Sitzung neu aufgebaut wird. Das passiert automatisch bei der nächsten Nachricht, sofern der
  Agent gerade nicht arbeitet.
- MCP-Server über HTTP werden noch nicht unterstützt.

## Stand Schritt 3 (2026-11-24)

Umgesetzt nach Davids Antworten (E-43 bis E-48). Gebaut:

- **Seite „Postfach“** mit allen Einträgen, offene zuerst, Zähler der offenen in der
  Navigation. Jede Karte zeigt Art, Status, Chat (anklickbar), Tool mit Argumenten, Ergebnis
  und Davids Antwort. Unter den Knöpfen steht, was passiert.
- **Zwei Arten von Freigaben** ([postfach-dienst.ts](../server/postfach/postfach-dienst.ts)):
  - *Freigabe zum Abschluss* (E-44): *Freigeben* führt den gespeicherten Aufruf über den
    eigenen MCP-Client aus ([mcp-aufrufer.ts](../server/mcp/mcp-aufrufer.ts)), ohne KI, und
    die Aufgabe ist erledigt. *Verwerfen* bricht sie ab, ebenfalls ohne KI.
    *Änderungen anfordern* setzt den Agenten in seiner Sitzung fort.
  - *Freigabe zum Weitermachen* (E-45): Der Agent ruft das Plattform-Tool
    `auf_freigabe_warten` auf und hört auf. Nach der Freigabe wird die Aufgabe mit dem
    Ergebnis in die Warteschlange gestellt. Wartet sie auf mehrere Vorschläge, geht es erst
    weiter, wenn alle erledigt sind, und der Agent bekommt alle Ergebnisse in einer Nachricht.
  - Schlägt die Ausführung fehl, bleibt der Eintrag offen („Erneut freigeben“), ohne KI.
- **Rückfragen** (E-47): Plattform-Tool `rueckfrage_stellen`; die Antwort im Postfach setzt den
  Agenten fort. Im Auftrag steht, wann er fragen soll: nur wenn das Ergebnis wesentlich davon
  abhängt, mehrere Fragen bündeln, bei Kleinigkeiten eine begründete Annahme treffen und nennen.
- **Meldungen**: *Zur Kenntnis genommen* oder *Antworten*. Antworten geht bei jedem Eintrag,
  auch bei erledigten.
- **Warteschlange** ([warteschlange.ts](../server/datenbank/warteschlange.ts)): Der Agent
  arbeitet immer nur an einer Aufgabe. Chat-Nachrichten und Fortsetzungen aus dem Postfach
  werden eingereiht und nacheinander abgearbeitet. Die Warteschlange liegt in der Datenbank
  und übersteht einen Neustart.
- **Neue Aufgabenstatus**: eingereiht, wartet (aufs Postfach), erledigt, abgebrochen – in der
  Chat-Liste als Marke, im Chat als Hinweis. Postfach-Aktionen erscheinen im Chat-Verlauf.
- Bestehende Datenbanken bekommen die neuen Postfach-Spalten beim Start nachgerüstet.
- Simulation: neue Stichwörter *verlinken* (Freigabe zum Weitermachen), *Rückfrage* bzw.
  *neue Klasse*; *Doku* ist jetzt die Freigabe zum Abschluss.

Auf dem Privatrechner geprüft (nur Simulation): alle Abläufe über die Schnittstelle
durchgespielt (Abschluss freigeben, Änderung anfordern → neuer Vorschlag → verwerfen,
Weitermachen nach Freigabe, Rückfrage beantworten, zwei Chats nacheinander, Meldung zur
Kenntnis), Oberfläche im Browser ohne Fehler, Nachrüstung an der Datenbank aus Schritt 2.

**Nachträge vor dem Test** (Wünsche von David, E-49 bis E-51):

- **Chat löschen**: × am Chat in der Liste (erscheint beim Überfahren). Löscht Verlauf, Postfach-
  Einträge, Warteschlange und die gespeicherte Copilot-Sitzung (`deleteSession`). Solange der
  Agent am Chat arbeitet, geht es nicht – erst abbrechen.
- **„Neuer Chat“ räumt auf**: Chats ohne eine einzige Nachricht werden dabei gelöscht.
- **Modellwahl je Chat**: Leiste über dem Chat mit Modell (aus `listModels`, mit Kostenfaktor),
  Thinking Effort (nur bei Modellen, die ihn anbieten) und Context Window (Größe in Tokens;
  „Lang“ nur bei Modellen mit langem Kontext). Gilt ab der nächsten Nachricht: Die Sitzung wird
  mit der neuen Wahl fortgesetzt, der Verlauf bleibt. Ohne Wahl gilt `modell` aus
  `einstellungen.json`. Im Chat steht klein, welches Modell geantwortet hat (bei Wechsel).

Auch das in der Simulation und im Browser geprüft. `npm test`: 30 Tests.

### Festlegungen in Schritt 3 (Vorschlag)

- **Wer entscheidet, ob Abschluss oder Weitermachen?** Der Agent: Ruft er nach dem Vorschlag
  `auf_freigabe_warten` auf, ist es eine Freigabe zum Weitermachen, sonst eine zum Abschluss.
  Er weiß als Einziger, ob er das Ergebnis noch braucht.
- ~~**Ein Agent, eine Sache zur Zeit**: Auch Chat-Nachrichten warten, wenn der Agent gerade in
  einem anderen Chat arbeitet (bisher liefen Chats parallel).~~ Entfällt mit Schritt 4: Jeder Chat
  läuft für sich (E-57, E-61).
- **Verwerfen** bricht die Aufgabe auch bei der Freigabe zum Weitermachen und bei Rückfragen ab.
  Soll der Agent einen anderen Weg suchen, ist *Änderungen anfordern* bzw. *Antworten* gemeint.
- **Vorschläge nicht direkt bearbeiten**: Statt die Argumente zu ändern, fordert David
  Änderungen an, und der Agent legt neu vor.
- **Inzwischen verbotene Tools** werden auch bei der Freigabe nicht ausgeführt.
- Schreibt David in einen Chat, der aufs Postfach wartet, geht die Nachricht sofort an den
  Agenten; die offenen Einträge bleiben bestehen.

### Annahmen, die erst am Firmenrechner geprüft werden können

- Eigene Tools mit `defineTool` (Parameter als JSON-Schema, `defer: "never"`) werden dem
  Agenten angeboten, und er ruft `auf_freigabe_warten` und `rueckfrage_stellen` sinnvoll auf.
- Der eigene MCP-Client kann Tools des echten Atlassian-MCP **aufrufen** (in Schritt 2 hat er
  sie nur ausgelesen). Beim SAP-MCP öffnet die erste Freigabe ggf. Edge fürs Cookie.
- `resumeSession` setzt nach einer Postfach-Aktion mit Kontext fort, auch nach einem Neustart
  der App.
- `listModels` liefert bei der Business-Lizenz Einzelmodelle (privat war die Liste leer), mit
  Thinking-Effort-Stufen und Context-Window-Größe. „Lang“ wird angeboten, wenn das SDK für das
  Modell Long-Context-Preise meldet – ob das zuverlässig ist, ist offen.
- `resumeSession` übernimmt ein anderes Modell, `reasoningEffort` und `contextTier`.
  Unklar: Bleibt ein Chat beim zuletzt gewählten Modell, wenn man auf „Standard (automatisch)“
  zurückstellt? (Ohne Modellangabe wird keins mitgegeben.)
- `deleteSession` löscht die Copilot-Sitzung eines gelöschten Chats.

### Abnahme Schritt 3 auf dem Firmenrechner

**Vorbereitung**

- ZIP entpacken, `npm install`, `einstellungen.json` mit `"modus": "copilot"` behalten. Die
  Datenbank aus Schritt 2 bleibt, sie wird beim Start nachgerüstet.
- `npm start`: Im Terminal keine Fehler; in der Navigation ist **Postfach** anklickbar.
- Seite MCP-Server, Atlassian-MCP: Lesende Tools auf **Erlauben**. **Ein** schreibendes Tool,
  das harmlos ist, auf **Freigabe** – am besten „Kommentar anlegen“. Dazu ein Testticket
  aussuchen, an dem Kommentare nicht stören (im Folgenden `TEST-1`).

**A. Chats und Modellwahl** (kurz, wenig Credits)

1. Dreimal „Neuer Chat“ → in der Liste steht nur **ein** leerer neuer Chat.
2. Einen alten Chat überfahren, × → Rückfrage bestätigen → Chat ist weg.
3. Modellleiste im neuen Chat: Liste der Modelle aufklappen → **Foto**. Ein Modell mit
   Thinking Effort wählen → Stufen aufklappen → **Foto**. Context Window: Größe steht da, bei
   manchen Modellen „Lang“ wählbar?
4. Modell X mit Thinking Effort „hoch“ wählen, „Was ist 2+2?“ → Antwort kommt, darüber
   klein „Modell: X“.
5. Im selben Chat Modell Y wählen, „Und 3+3?“ → „Modell: Y“; die Antwort zeigt, dass der Agent
   den Verlauf noch kennt (ggf. „Was hatte ich zuerst gefragt?“).
6. Zurück auf „Standard (automatisch)“, noch eine Frage → welches Modell steht jetzt da?

**B. Postfach mit echtem Copilot**

7. Neuer Chat: „Lege an Ticket TEST-1 einen Kommentar ‚Test Schritt 3‘ an.“ → Tool-Karte
   „nicht ausgeführt“, orange „Vorschlag #… wartet auf Freigabe“, Chat-Marke „Postfach“, Zähler
   in der Navigation. Der Agent wiederholt den Aufruf **nicht** und ruft **kein**
   `auf_freigabe_warten` auf (Freigabe zum Abschluss).
8. Postfach: Karte „Freigabe zum Abschluss“ → **Freigeben** → Ergebnis erscheint, Kommentar ist
   in Jira, Chat „erledigt“, grüner Vermerk im Chat. Der Agent tut danach **nichts** mehr.
9. Neuer Chat wie 7 → im Postfach „Text bitte auf Englisch“ als **Änderungen anfordern** →
   der Agent arbeitet im selben Chat weiter und legt einen neuen Vorschlag vor. Diesen
   **verwerfen** → Chat „abgebrochen“, in Jira kein Kommentar.
10. Neuer Chat: „Lege an TEST-1 einen Kommentar ‚Test Weitermachen‘ an und lies danach das
    Ticket, um zu prüfen, dass er da ist.“ → Der Agent ruft `auf_freigabe_warten` auf, die
    Karte heißt „Freigabe zum Weitermachen“, Chat-Marke „Postfach“.
11. **App beenden und neu starten.** Dann Vorschlag aus 10 freigeben → Chat „eingereiht“ →
    „arbeitet“; der Agent liest das Ticket und bestätigt den Kommentar (Kontext nach Neustart).
12. Neuer Chat: „Lege eine neue ABAP-Klasse für den Kundenexport an. Frag mich vorher nach
    dem Paket.“ → Rückfrage im Postfach (Agent hört auf). Antworten „$TMP“ → der Agent macht
    mit der Antwort weiter. (Anlegen kann er noch nicht – es geht nur um die Rückfrage.)
13. Warteschlange: In Chat A „Fasse die letzten 10 Tickets im Projekt … zusammen“ (dauert
    etwas), sofort in Chat B „Was ist 2+2?“ → B zeigt „eingereiht“ und antwortet erst, wenn A
    fertig ist.
14. Eine Meldung im Postfach (falls aus Schritt 2 eine Regel „Melden“ besteht) → **Zur Kenntnis
    genommen** → Zähler sinkt.
15. Chat aus 8 löschen → im Postfach sind seine Einträge weg.

**Bitte zurückmelden** (Foto oder Text, je Nummer ok / nicht ok): A1–6, B7–15. Fotos:
Modellliste und Thinking-Effort-Stufen (3), Postfach mit offenen Einträgen, bei Fehlern Terminal
und Browser. Weiter offen aus Schritt 2: die Tool-Namen der echten Server.

### Ergebnis der Abnahme (2026-11-24)

Alle Punkte A1–6 und B7–15 laut David in Ordnung, mit echtem Copilot und echtem Atlassian-MCP.
**Schritt 3 ist damit abgenommen.** Bestätigt sind damit auch: eigene Tools mit `defineTool`,
Aufrufe des echten Atlassian-MCP über den eigenen MCP-Client, `resumeSession` nach Postfach-
Aktionen und nach Neustart, `listModels` mit Einzelmodellen, Modellwechsel im laufenden Chat,
`deleteSession`. Die Festlegungen in Schritt 3 gelten als bestätigt, soweit unten nichts anderes steht.

Rückmeldungen:

- Context Window: Größe soll bei „Standard“ und „Lang“ dabeistehen (E-53).
- **Freigaben im Chat statt im Postfach** (E-52): Wer im Chat arbeitet, will dort auch
  bestätigen. Das Postfach ist für Workflows, die im Hintergrund laufen.

### Umbau nach der Abnahme (2026-11-24)

- Vorschläge erscheinen im Chat als **Karte** mit *Freigeben*, *Verwerfen* und *Änderungen
  anfordern*. Die Abläufe dahinter sind unverändert (Abschluss ohne KI, Weitermachen über die
  Warteschlange).
- **Rückfragen** stehen hervorgehoben im Chat; die nächste Nachricht im Eingabefeld ist die
  Antwort (die Rückfrage gilt dann als beantwortet, der Agent bekommt „Antwort auf deine
  Rückfrage #n“).
- **Meldungen** aus Chats gelten gleich als gesehen – die Tool-Karte zeigt den Aufruf schon.
- Aufgaben haben eine **Herkunft** (`chat`, später `workflow`). Postfach-Seite und Zähler zeigen
  nur Workflow-Einträge; die Seite ist bis Phase 4 in der Navigation ausgegraut.
- Für den Agenten heißt es nicht mehr „liegt im Postfach“, sondern „wartet auf Freigabe“.
- Context Window: Auswahl zeigt „Standard (… Tokens)“ und „Lang (… Tokens)“. Die Größen kommen aus
  dem Prompt-Budget je Stufe (`tokenPrices.maxPromptTokens` bzw. `…longContext.maxPromptTokens`)
  plus maximaler Ausgabe; fehlt das, die allgemeine Obergrenze des Modells.

Geprüft in der Simulation und im Browser; `npm test`: 32 Tests.

### Zweiter Umbau: Der Agent wartet im Chat auf David (E-54)

Rückmeldung nach dem Test: Der Ablauf „Tool schlägt fehl → Karte → `auf_freigabe_warten` → Text“
wirkt unschön. Gewünscht: Karte sofort, dann nichts, bis David etwas tut. Umgesetzt:

- Im Chat wartet der Hook `onPreToolUse` im Gateway, bis David entschieden hat
  ([gateway.ts](../server/gateway/gateway.ts), [entscheidungen.ts](../server/postfach/entscheidungen.ts)).
  *Freigeben*: der Hook lässt durch, Copilot führt das Tool selbst aus, der Agent bekommt das
  echte Ergebnis; es steht auch in der Karte. *Verwerfen*: Ablehnung, der Lauf wird sofort
  angehalten, Chat „abgebrochen“. **Eine Nachricht im Eingabefeld** ist der Änderungswunsch –
  der wartende Aufruf wird mit dem Wunsch abgelehnt, der Agent ruft das Tool angepasst erneut auf.
- Zweite Sperre: Die Berechtigungsprüfung lässt ein Tool mit Regel *Freigabe* nur durch, wenn es
  gerade freigegeben wurde – je Freigabe genau einmal. Sollte Copilot das Warten im Hook doch
  irgendwann abbrechen, wird so trotzdem nichts ohne Freigabe ausgeführt.
- `rueckfrage_stellen` wartet im Chat ebenfalls und liefert die Antwort als Ergebnis.
  `auf_freigabe_warten` gibt es im Chat nicht mehr (nur noch für Workflows).
- Solange der Agent in einem Chat wartet, ist er für andere Chats frei. Nach der Entscheidung
  geht der wartende Aufruf weiter, sobald der Agent wieder frei ist (vor der Warteschlange).
- Im Verlauf erscheinen der Tool-Aufruf und die Vorschlagskarte als **eine** Karte; der Aufruf
  von `rueckfrage_stellen` wird nicht extra gezeigt. Die Karte hat nur *Freigeben* und
  *Verwerfen*; das Eingabefeld sagt „Änderungswunsch zum Vorschlag …“.
- Wird ein Chat gelöscht, während der Agent darin wartet, gilt der Vorschlag als verworfen.
- Nach einem **Neustart** der App wartet niemand mehr: Dann führt *Freigeben* den Aufruf selbst
  aus und setzt den Agenten mit dem Ergebnis fort (wie im ersten Umbau).
- Folge für E-44: Nach dem Freigeben schreibt der Agent im Chat noch kurz etwas (ein kleiner
  Modellaufruf). Im Auftrag steht, dass ein kurzer Satz genügt. Für Workflows bleibt es ohne KI.

Annahmen, die erst am Firmenrechner geprüft werden können:

- `onPreToolUse` darf beliebig lange warten (das SDK nennt keine Zeitgrenze). Falls doch eine
  greift: Was sieht man im Chat? (Ausgeführt wird dann wegen der zweiten Sperre nichts.)
- Ein eigenes Tool (`rueckfrage_stellen`) darf ebenso lange auf das Ergebnis warten.
- Die `toolCallId` im Hook ist dieselbe wie im Ereignis `tool.execution_start` – sonst steht unter
  der Vorschlagskarte zusätzlich die normale Tool-Karte (nur ein Schönheitsfehler).
- `session.abort()` direkt nach der Ablehnung beim Verwerfen beendet den Lauf, ohne dass der
  Agent noch etwas schreibt.

Geprüft in der Simulation und im Browser; `npm test`: 38 Tests.

### Nachprüfung am Firmenrechner (kurz)

Vorbereitung wie bei der Abnahme: harmloses schreibendes Atlassian-Tool auf **Freigabe**, Testticket
`TEST-1`.

1. Neuer Chat: „Lege an TEST-1 einen Kommentar ‚Nachprüfung‘ an.“ → **sofort** die Karte
   „Vorschlag #… · Freigabe nötig“, **keine** fehlgeschlagene Tool-Karte, kein
   `auf_freigabe_warten`, kein Text danach. Chat-Marke „wartet auf dich“.
2. **Eine Minute warten** (prüft, ob Copilot das Warten abbricht), dann **Freigeben** → Ergebnis in
   der Karte, Kommentar in Jira, der Agent schreibt kurz, dass es erledigt ist.
3. Wie 1, dann ins Eingabefeld „Bitte auf Englisch“ → Karte „Änderung angefordert“, der Agent
   legt sofort eine neue Karte mit englischem Text vor. Diese **verwerfen** → Chat
   „abgebrochen“, der Agent schreibt nichts mehr, in Jira kein Kommentar.
4. „Lege eine neue ABAP-Klasse an, frag mich vorher nach dem Paket.“ → Rückfrage erscheint, kein
   Text danach. Antwort im Eingabefeld → der Agent macht mit der Antwort weiter.
5. Wie 1; während die Karte wartet, in einem **anderen** Chat „Was ist 2+2?“ → kommt sofort.
   Danach im ersten Chat freigeben → geht weiter.
6. Wie 1, **App neu starten**, dann freigeben → Kommentar in Jira, der Agent macht weiter.
7. Postfach in der Navigation ausgegraut; Context Window zeigt Größen – **Foto** bei einem Modell
   mit „Lang“.

### Ergebnis der Nachprüfung (2026-11-24)

Punkte 1–7 laut David **alle in Ordnung**, mit echtem Copilot und echtem Atlassian-MCP. Der
Umbau nach Schritt 3 (E-52, E-54) ist damit abgenommen. Bestätigt sind auch die Annahmen aus dem
zweiten Umbau:

- `onPreToolUse` darf warten: Der Agent wartet einfach auf die Freigabe, Copilot bricht nicht ab
  (mindestens eine Minute geprüft). Eine Ausweichlösung für eine Zeitgrenze ist nicht nötig.
- `rueckfrage_stellen` wartet ebenso auf die Antwort (Punkt 4).
- Keine zusätzliche Tool-Karte unter der Vorschlagskarte → `toolCallId` stimmt überein (Punkt 1).
- *Verwerfen* beendet den Lauf, ohne dass der Agent noch schreibt (Punkt 3).

Auffällig: **Während die Karte wartet, verschwindet das Eingabefeld**, obwohl die Karte sagt, ein
Änderungswunsch gehöre ins Eingabefeld. Wird vor bzw. mit Schritt 4 behoben. (Am Mac in Chrome
auch bei kleinem Fenster nicht nachzustellen; mit Schritt 4 hat die Karte wieder ein eigenes Feld,
E-55, und die Abnahme prüft das Eingabefeld eigens – Punkt F17.)

Die Tool-Namen der echten MCP-Server werden nicht gebraucht: Die App liest die Tools selbst aus,
Regeln stellt David in der App ein.

### Bekannte Lücken nach Schritt 3

- Darstellung je Typ (Confluence-Vorschau, Jira-Statuswechsel) fehlt; Argumente stehen als JSON.
- Postfach ohne Filter und Suche.
- Keine Übergabenotiz (V-10, Weg 2): Wiederaufnahme nur über die gespeicherte Sitzung.
- Änderungsmeldungen mit Vorher/Nachher und „Rückgängig“ (E-31) kommen mit ADT in Phase 3.
- Abbrechen hinterlässt weiterhin keinen Hinweis im Verlauf.

## Plan Schritt 4 (2026-11-24, Davids Antworten eingearbeitet)

Gebaut am 2026-11-25 – siehe „Stand Schritt 4“. Entscheidungen E-55 bis E-61; was als „Vorschlag“
markiert ist, hat David nicht ausdrücklich bestätigt, aber auch nicht abgelehnt.

**A. Agentenverwaltung**
- Seite **Agenten**: Name, Auftrag, Standardmodell (mit Thinking Effort, Context Window),
  MCP-Server, Regel je Tool, Instructions/Skills.
- Beim ersten Start wird aus `einstellungen.json` (`agent`, `modell`) der Agent `standard`
  angelegt; danach liest die App die Werte dort nicht mehr (Vorschlag).
- Regeln je Tool (Tabelle `tool_regeln` hat schon `agent_id`) wandern auf die Agentenseite; die
  MCP-Seite zeigt nur noch Server und Tool-Listen (Vorschlag).
- Neuer Agent: alle Server mit *Freigabe*; Knopf „Kopieren“ übernimmt die Regeln eines anderen (Vorschlag).
- Chat: Agent beim Anlegen wählen, **im laufenden Chat wechselbar** (E-56). Das Modell gibt der
  Agent vor, der Chat kann es übersteuern (E-51). Offen in der Technik: Beim Wechsel ändern sich
  Auftrag und Tools – die Sitzung wird mit der neuen Konfiguration fortgesetzt (`resumeSession`
  mit neuer `systemMessage`); ob Copilot das so übernimmt, ist am Firmenrechner zu prüfen.
  Im Verlauf steht klein, welcher Agent geantwortet hat.
- **Parallel** (E-57): ~~Vorschlag – jeder Agent arbeitet an einer Sache zur Zeit, verschiedene
  Agenten gleichzeitig.~~ Geklärt am 2026-11-25 (E-61): **Jeder Chat läuft für sich**, auch zwei
  Chats desselben Agenten.

**B. Instructions/Skills** (E-18, E-30, E-58)
- Ein Ordner aus `einstellungen.json` (Ort: offene Frage L3) mit `*.instructions.md` und
  Skill-Ordnern mit `SKILL.md`. Die App zeigt, legt an, bearbeitet (Markdown-Vorschau) und ordnet
  Agenten zu. Die Dateien bleiben die Wahrheit.
- Zugeordnete Instructions werden an den Auftrag gehängt (eindeutig, auch in der Simulation
  sichtbar). Skills über `skillDirectories` des SDK, nicht zugeordnete über `disabledSkills` aus
  (Vorschlag; Wirkung am Firmenrechner prüfen). Frontmatter (`applyTo`, `name`, `description`)
  wird angezeigt.

**C. Verbrauchsanzeige** (V-14, ohne Limit – E-60)
- Ereignis `assistant.usage` des SDK je Modellaufruf: Modell, Tokens, Kostenfaktor (`cost`),
  AI-Credits (`copilotUsage.totalNanoAiu`). Gespeichert je Lauf (eine Nachricht bis fertig).
- Anzeige klein unter jeder Antwort, Summe je Chat, Seite **Verbrauch** (gesamt, je Agent, je
  Modell, je Monat). Die Simulation liefert erfundene Zahlen. Einheit am Firmenrechner mit der
  GitHub-Abrechnung vergleichen.

**D. Einrichtungsseite** – nur prüfen und anzeigen (E-60): Node-Version, Modus,
Copilot-Anmeldung (Hinweis `/login`), Workspace- und Instructions-Ordner (vorhanden,
beschreibbar), MCP-Server erreichbar, Modellliste. Je Prüfung eine Zeile ok/Fehler mit Hinweis.

**E. Markdown im Chat** (E-59): Vorschlag `marked` + `DOMPurify` (verbreitet, ohne
Unterabhängigkeiten; DOMPurify, weil Tickets und Quelltext HTML enthalten können; Links mit
`rel="noopener"`). Versionen am 2026-11-25 genannt: `marked` 18.2.1, `dompurify` 3.4.18 (mit
`@types/trusted-types` 2.0.7).
Dieselbe Darstellung dient als Vorschau für Instructions.

**F. Nebenbei**
- Feld „Änderungswunsch“ wieder in der Vorschlagskarte (E-55), schickt wie das Eingabefeld.
- Hinweis im Verlauf, wenn ein Lauf abgebrochen wurde.

Test nur in der Simulation (E-40); `daten/` vorher sichern, danach zurücksetzen. Am Ende
Abnahme-Checkliste für den Firmenrechner hier eintragen.

## Stand Schritt 4 (2026-11-25)

Gebaut nach dem Plan oben, in der Reihenfolge F, A, B, C, D, E. Nicht gebaut, wie vereinbart:
Limit je Lauf, Monatsbudget, Einstellungen in der App bearbeiten (E-60).

**F. Nebenbei**
- Die Vorschlagskarte im Chat hat wieder ein Feld **Änderungswunsch** (E-55); Enter schickt ab.
  Der Wunsch erscheint im Verlauf wie eine normale Nachricht und geht an den wartenden Agenten –
  genau wie über das Eingabefeld, das weiterhin geht.
- **Abbruch-Hinweis** im Verlauf (orange): „Von dir abgebrochen.“, „Aus der Warteschlange
  genommen.“ und nach einem Neustart „Unterbrochen: Die App wurde beendet, während der Agent
  arbeitete.“

**A. Agentenverwaltung** ([server/agenten/](../server/agenten/), Seite **Agenten**)
- Agent: Name, Auftrag, Standardmodell (Modell, Thinking Effort, Context Window), MCP-Server
  (anhaken), Instructions, Skills. Darunter die **Regeln je Tool** für jeden angehakten Server –
  sie stehen nicht mehr auf der MCP-Seite. Knöpfe: Neuer Agent, Kopieren, Löschen.
- Beim ersten Start entsteht aus `einstellungen.json` (`agent`, `modell`) der Agent **standard**
  mit allen eingetragenen Servern; seine Regeln sind die aus Schritt 2/3. Danach liest die App
  `agent` und `modell` dort nicht mehr. Bestehende Chats gehören ihm.
- Über dem Chat: **Agent** wählbar, auch im laufenden Chat (E-56). Ab der nächsten Nachricht wird
  die Sitzung mit Auftrag, Servern, Regeln und Skills des neuen Agenten fortgesetzt
  (`resumeSession`), der Verlauf bleibt. Im Verlauf steht klein „Agent: …“ (am Anfang und bei
  jedem Wechsel). Modell: „Standard des Agenten (…)“ oder eine eigene Wahl des Chats (E-51).
- Das Gateway sperrt Tools von Servern, die dem Agenten nicht zugeordnet sind; Copilot startet
  diese Server für ihn gar nicht erst.
- **Parallel** (E-61): Jeder Chat hat seinen eigenen Lauf; Chats arbeiten gleichzeitig, auch mit
  demselben Agenten. Innerhalb eines Chats der Reihe nach (eine Fortsetzung aus dem Postfach
  wartet, bis der laufende Schritt fertig ist). Die Statusmarke „eingereiht“ sieht man dadurch
  kaum noch.

**B. Instructions & Skills** ([server/instructions/](../server/instructions/), Seite
**Instructions & Skills**)
- Ein Ordner aus `einstellungen.json`, neu: `"instructionsOrdner"` (Standard `./daten/instructions`,
  Ort am Firmenrechner: offene Frage L3). Die App sucht darin – auch in Unterordnern – nach
  `*.instructions.md` und Skill-Ordnern mit `SKILL.md` (E-58).
- Anzeigen mit Markdown-Vorschau, Kopf (Frontmatter) getrennt; Bearbeiten im Textfeld; neue
  Instruction bzw. neuen Skill anlegen. Die Dateien bleiben die Wahrheit, gespeichert wird direkt
  dort. Zugeordnet wird auf der Agenten-Seite.
- Zugeordnete Instructions hängen hinter dem Auftrag (Überschrift „# Instructions“, je Datei
  „## Pfad“). In der Simulation zeigt „Wer bist du?“ den ganzen Auftrag.
- Skills: `skillDirectories` = die Ordner, in denen Skill-Ordner liegen; nicht zugeordnete Skills
  über `disabledSkills` (Name aus dem Frontmatter `name`, sonst Ordnername).

**C. Verbrauch** (V-14 ohne Limit, E-60)
- Je Modellaufruf aus `assistant.usage`: Modell, Tokens ein/aus, Cache, Kostenfaktor (`cost`),
  `copilotUsage.totalNanoAiu`. Gespeichert in der Tabelle `verbrauch`, auch für Unteragenten.
- Anzeige: klein unter jeder Antwort (Summe des Laufs), über dem Chat „Chat bisher …“, Seite
  **Verbrauch** (gesamt, je Monat, je Agent, je Modell). AI-Credits = Nano-AI-Units ÷ 10⁹ –
  Einheit am Firmenrechner mit der GitHub-Abrechnung vergleichen. Die Simulation liefert
  erfundene Zahlen. Gelöschte Chats zählen weiter mit.

**D. Einrichtungsseite** – nur prüfen und anzeigen (E-60): Node-Version, Modus,
Copilot-Anmeldung (mit Hinweis `/login`), Modellliste, Workspace- und Instructions-Ordner
(vorhanden, beschreibbar, Anzahl Dateien), MCP-Server. Die MCP-Server zeigen zunächst das letzte
Auslesen; **„MCP-Server starten und prüfen“** startet sie wirklich (beim SAP-MCP kann Edge
aufgehen). Darunter die Einstellungen, wie die App sie benutzt.

**E. Markdown** (E-59, [Markdown.tsx](../oberflaeche/komponenten/Markdown.tsx)): Antworten des
Agenten und die Vorschau der Instructions. Sicherheit: HTML im Text wird als Text gezeigt (auch
ABAP-Feldsymbole wie `<ls_zeile>` bleiben sichtbar), Bilder werden nicht geladen, sondern als
Link gezeigt (sonst könnte eine Bildadresse Daten hinausschicken), DOMPurify lässt nur eine feste
Liste harmloser Tags durch, Links nur `http(s)`/`mailto`, sie öffnen in einem neuen Tab.

Auf dem Privatrechner geprüft (nur Simulation, Datenbank aus Schritt 3, vorher gesichert und
danach zurückgesetzt): Nachrüstung der Datenbank (Agent „Assistent“ mit beiden Servern), Instruction
und Skill angelegt und bearbeitet, Agent angelegt und zugeordnet, Agentenwechsel im Chat mit
sichtbarem Auftrag samt Instructions, Änderungswunsch in der Karte → neuer Vorschlag → verwerfen,
zwei Chats gleichzeitig, Abbrechen mit Hinweis, Sperre eines nicht zugeordneten Servers,
Verbrauchs- und Einrichtungsseite, Markdown mit eingeschleustem HTML/Script/`javascript:`-Link/Bild
(nichts ausgeführt, keine fremde Anfrage). Oberfläche in Chrome ohne Konsolenfehler.
`npm test`: 50 Tests, `npm run typpruefung` ohne Fehler.

### Festlegungen in Schritt 4 (Vorschlag)

- **Neuer MCP-Server** ist zunächst keinem Agenten zugeordnet; die MCP-Seite sagt das. Ein **neuer
  Agent** bekommt alle Server, ohne eigene Regeln – also überall „Freigabe nötig“.
- **Kopieren** übernimmt den ganzen Agenten samt Regeln („… (Kopie)“).
- **Löschen**: Der Standard-Agent lässt sich nicht löschen; die Chats eines gelöschten Agenten
  übernimmt der Standard-Agent; solange der Agent in einem Chat arbeitet, geht Löschen nicht.
- **Neuer Chat** bekommt den Agenten des gerade offenen Chats.
- **Speichern**: Regeln je Tool wirken sofort (wie bisher). Alles andere am Agenten mit
  „Speichern“; es gilt ab der nächsten Nachricht. Nach jeder Änderung (Agent, Server, Regeln,
  Instructions) werden auch Sitzungen, die gerade laufen, vor ihrem nächsten Lauf neu aufgebaut –
  damit ist die Lücke „verbieten → erlauben wirkt erst bei neuer Sitzung“ aus Schritt 2 kleiner.
- **Instructions** werden vollständig angehängt, unabhängig von `applyTo` (das bezieht sich auf
  Dateien, an denen gearbeitet wird). Bearbeiten lassen sich nur `*.instructions.md` und `SKILL.md`
  im Ordner; Löschen gibt es in der App nicht. Windows-Zeilenenden bleiben beim Speichern erhalten.

### Annahmen, die erst am Firmenrechner geprüft werden können

- `resumeSession` übernimmt beim Agentenwechsel den neuen Auftrag (`systemMessage`), andere
  `mcpServers` und `excludedTools`, und der Verlauf bleibt (Punkt B8).
- Mehrere Sitzungen laufen über einen `CopilotClient` gleichzeitig. **Jede Sitzung startet ihre
  MCP-Server selbst** – laufen zwei Chats mit dem SAP-MCP gleichzeitig an, holt jeder sein Cookie
  (ggf. zweimal Edge). Bei Ärger: Foto, dann überlegen wir eine Sperre nur für den SAP-MCP.
- `skillDirectories` und `disabledSkills` wirken wie gedacht, und `disabledSkills` erwartet den
  Namen aus dem Frontmatter.
- `assistant.usage` liefert Tokens und `copilotUsage.totalNanoAiu`; ob ÷ 10⁹ die AI-Credits der
  Abrechnung ergibt.
- `getAuthStatus` liefert den Anmeldenamen für die Einrichtungsseite.

### Bekannte Lücken nach Schritt 4

- Parallele Chats teilen sich den Workspace-Ordner – zwei Chats können dieselbe Datei ändern
  (SAP-Objekte schützt die Sperre in SAP).
- Der Verbrauch eines Laufs erscheint erst, wenn der Lauf fertig ist, nicht live.
- Instructions und Skills lassen sich in der App nicht löschen oder umbenennen.
- Das verschwindende Eingabefeld (Nachprüfung) ließ sich hier nicht nachstellen.
- Weiter offen aus Schritt 3: Darstellung je Typ (Confluence-Vorschau, Jira-Statuswechsel).

### Pakete für Nexus (neu in Schritt 4)

`marked` **18.2.1** (keine Abhängigkeiten, MIT), `dompurify` **3.4.18** (MPL-2.0 oder Apache-2.0)
mit `@types/trusted-types` **2.0.7**. Fest versioniert in `package.json`.

### Abnahme Schritt 4 auf dem Firmenrechner

**Vorbereitung**

- ZIP entpacken, `npm install` (holt die drei neuen Pakete über Nexus), `einstellungen.json`
  behalten. Wenn der Ort der vorhandenen Instructions/Skills bekannt ist (L3), dort eintragen:
  `"instructionsOrdner": "D:/…/instructions"` (Schrägstriche `/`). Sonst gilt `daten/instructions`.
- `npm start`: im Terminal keine Fehler. Navigation: Chat, Agenten, Instructions & Skills,
  MCP-Server, Verbrauch, Einrichtung, Postfach (ausgegraut).
- Für F: harmloses schreibendes Atlassian-Tool (Kommentar anlegen) auf **Freigabe**, Testticket
  `TEST-1` – wie bei der Nachprüfung, jetzt auf der Agenten-Seite beim Agenten „Assistent“.

**A. Einrichtung**

1. Seite **Einrichtung**: Node, Modus „Copilot“, Copilot-Anmeldung mit deinem Namen, Modelle,
   Workspace- und Instructions-Ordner ✓ → **Foto**.
2. **MCP-Server starten und prüfen** → Atlassian- und SAP-MCP „Erreichbar, n Tools“ (beim SAP-MCP
   kann Edge aufgehen).

**B. Agenten und parallele Chats**

3. Seite **Agenten**: „Assistent“ (Standard) mit dem Auftrag aus `einstellungen.json`, beide
   Server angehakt, darunter die Regeln aus Schritt 3 (z. B. Kommentar anlegen = Freigabe) → **Foto**.
4. Seite **MCP-Server**: keine Regeln mehr, „Benutzt von: Assistent“.
5. **Neuer Agent** → Name „Leser“, Auftrag „Du liest Jira-Tickets. Antworte immer auf Englisch.“,
   nur den Atlassian-MCP anhaken, Standardmodell ein günstiges Modell, **Speichern**. Unten die
   lesenden Atlassian-Tools auf **Erlauben**.
6. Neuer Chat, oben Agent **Leser**: „Lies TEST-1“ → Antwort auf Englisch; im Verlauf klein
   „Agent: Leser“ und das Modell des Agenten.
7. Im selben Chat: „Lies die ABAP-Klasse ZCL_… im SAP“ → der Agent sagt, dass er das nicht kann
   (SAP-MCP ist ihm nicht zugeordnet).
8. Im selben Chat oben auf **Assistent** wechseln: „Fasse das Ticket von eben auf Deutsch
   zusammen“ → deutsche Zusammenfassung **ohne** erneutes Lesen; „Agent: Assistent“ im Verlauf.
   (Prüft, dass der Verlauf beim Agentenwechsel bleibt.)
9. Parallel: In Chat A „Fasse die letzten 10 Tickets im Projekt … zusammen“, sofort in Chat B
   „Was ist 2+2?“ → B antwortet, während A noch arbeitet (beide mit blauem Punkt in der Liste).
10. Wie 9, aber A und B mit **demselben** Agenten → laufen ebenfalls gleichzeitig.

**C. Instructions & Skills**

11. Seite **Instructions & Skills**: Ordner steht oben, die vorhandenen Dateien sind gelistet
    (bei eingetragenem L3-Ordner) → **Foto** der Liste. Eine Datei öffnen → Vorschau formatiert.
12. **Neue Instruction** „test-hallo“, Bearbeiten, darunter „Beginne jede Antwort mit ‚Hallo
    David‘.“, Speichern. Auf der Agenten-Seite bei „Assistent“ anhaken, Speichern. Im Chat mit
    Assistent eine Frage → Antwort beginnt mit „Hallo David“. Danach wieder abhaken.
13. Falls Skills da sind: einen Skill bei „Assistent“ anhaken und eine Frage stellen, zu der er
    passt → taucht eine Tool-Karte für den Skill auf? Mit abgehaktem Skill dieselbe Frage →
    kein Skill. **Foto**, wenn etwas auffällt.

**D. Verbrauch**

14. Nach einigen Nachrichten: unter jeder Antwort klein „n Modellaufrufe · … Tokens · … AI-Credits“,
    über dem Chat „Chat bisher …“. Seite **Verbrauch** → **Foto**. Wenn möglich mit der
    GitHub-Abrechnung (Copilot-Nutzung) vergleichen: passt die Größenordnung der AI-Credits?

**E. Markdown und Einstellungen**

15. „Erkläre den Unterschied zwischen SELECT SINGLE und SELECT … UP TO 1 ROWS, mit einer Tabelle
    und einem Codebeispiel“ → Tabelle und Codeblock formatiert → **Foto**.
16. „Erkläre Feldsymbole und nenne <ls_zeile> im Fließtext, nicht im Codeblock“ → `<ls_zeile>`
    steht sichtbar im Text.
    **Frage an dich** (zurückgestellt, E-60): Nachdem du die Einrichtungsseite gesehen hast –
    sollen Modus, Workspace- und Instructions-Ordner in der App einstellbar sein, oder reicht
    `einstellungen.json`?

**F. Vorschlagskarte und Abbruch**

17. Neuer Chat mit Assistent: „Lege an TEST-1 einen Kommentar ‚Schritt 4‘ an.“ → Karte wartet;
    **das Eingabefeld unten bleibt sichtbar** (wenn nicht: Foto vom ganzen Fenster).
18. In das Feld **in der Karte** „Bitte auf Englisch“ + Enter → steht als deine Nachricht im
    Verlauf, die alte Karte „Änderung angefordert“, eine neue Karte mit englischem Text. Diese
    **verwerfen** → „abgebrochen“, kein Kommentar in Jira.
19. „Erkläre ausführlich die ABAP-Unit-Testklassen mit vielen Beispielen“ → während er schreibt
    **Abbrechen** → im Verlauf orange „Von dir abgebrochen.“
20. Wie 19, aber während er schreibt die App beenden (Strg+C) und neu starten → im Chat
    „Unterbrochen: Die App wurde beendet …“.

**Bitte zurückmelden** (Foto oder Text, je Nummer ok / nicht ok): 1–20 und die Frage unter 16.
Fotos: 1, 3, 11, 14, 15, bei Fehlern Terminal und Browser. Weiter offen: L2 (Modelle aus dem
Prüfpaket), L3 (Ort der Instructions/Skills).

## Ziel

Am Ende von Phase 1 gibt es eine lokale Web-Anwendung, in der David einen Agenten anlegt, ihm
seine vorhandenen MCP-Server gibt, mit ihm chattet und freigabepflichtige Aktionen im Postfach
sieht und beantwortet. ABAP schreiben kann der Agent dann noch nicht.

## Enthalten

| Baustein | Was David damit tun kann |
|---|---|
| Start | Ein Befehl startet die App, sie öffnet sich im Browser. Oberfläche auf Deutsch |
| Einrichtung | Prüfseite: Node, Copilot-Anmeldung, MCP-Server erreichbar – mit verständlichen Hinweisen (z. B. „in der Copilot-Kommandozeile `/login` ausführen") |
| MCP-Server | Vorhandene Server (Jira/Confluence, SAP-MCP) eintragen; die App liest deren Tools aus |
| Agenten | Anlegen und bearbeiten: Name, Auftrag (Systemprompt), Modell, welche Tools, welche Policy je Tool, welche Instructions/Skills; im Chat wechselbar, Chats laufen gleichzeitig (E-56, E-61) |
| Chat | Mit einem Agenten schreiben; live sehen, was er tut (Antworten, Tool-Aufrufe, Ergebnisse) |
| Tool-Gateway | Vier Policies je Tool: erlauben / erlauben + melden / Freigabe / verbieten. Technisch erzwungen |
| Dateigrenze | Agent liest und schreibt nur im Workspace-Ordner; Shell standardmäßig aus |
| Postfach | Freigaben, Änderungsmeldungen (Vorher/Nachher bei Dateien), Rückfragen, Ergebnisse. Aktionen: freigeben, antworten, verwerfen, zur Kenntnis nehmen |
| Wiederaufnahme | Antwort auf einen Postfach-Eintrag setzt den Agenten mit Kontext fort (Sitzung fortsetzen, sonst Übergabenotiz) |
| Instructions/Skills | Ordner anzeigen, Dateien anlegen und bearbeiten, Agenten zuordnen |
| Verbrauch | Anzeige je Lauf und gesamt; Limit je Lauf zurückgestellt (E-60) |
| Simulationsmodus | Alles läuft auch ohne Copilot und ohne echte MCP-Server (Drehbuch-Laufzeit, Stellvertreter-Server) |

## Nicht enthalten

- ABAP entwickeln über ADT (Workspace, check/push/activate, Unit-Tests, Rückgängig) → Phase 3
- Zeitsteuerung und gespeicherte Workflows → Phase 4
- Orchestrator → Phase 5 (gleichzeitige Chats gibt es seit Schritt 4, E-61)
- Anmeldung/Rollen, Teams-Benachrichtigung

Phase 2 (Doku-Agent) ist nach Phase 1 überwiegend Konfiguration: ein Agent mit SAP-MCP (lesen)
und Confluence (anlegen mit Freigabe) plus passendem Auftrag.

## Wie getestet wird (E-40)

Auf dem Privatrechner nur im Simulationsmodus. Der Teil, der wirklich mit dem Copilot SDK
spricht, wird nach den Messergebnissen aus Phase 0 geschrieben und läuft erstmals auf dem
Firmenrechner. Dort ist mindestens eine Korrekturrunde zu erwarten.

## Reihenfolge

1. Grundgerüst, simulierte Laufzeit, Chat mit Live-Ansicht, Copilot-Anbindung
   → **früher Transfer auf den Firmenrechner**, um die blind geschriebene Copilot-Anbindung zu prüfen
2. MCP-Server und Tool-Gateway mit Policies
3. Postfach und Wiederaufnahme
4. Agentenverwaltung, Instructions/Skills, Verbrauch, Einrichtungsseite
   → zweiter Transfer, Phase 1 fertig

## Technik

Monorepo (`apps/server`, `apps/web`, `packages/shared`), TypeScript, React, eingebautes SQLite
von Node, Mindestversion Node 22.16 (Stand Firmenrechner). Wenige, fest versionierte
Abhängigkeiten wegen Nexus; die Liste wird vor dem ersten Transfer genannt.
