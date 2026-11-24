# 08 – Phase 1: Plattformkern (Umfang)

Status: **gestartet 2026-11-13. Schritt 1 und Schritt 2 (MCP-Server, Tool-Gateway) abgenommen. Schritt 3 (Postfach, Warteschlange, Wiederaufnahme) gebaut, Abnahme auf dem Firmenrechner steht aus.**

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
- **Ein Agent, eine Sache zur Zeit**: Auch Chat-Nachrichten warten, wenn der Agent gerade in
  einem anderen Chat arbeitet (bisher liefen Chats parallel).
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

### Bekannte Lücken nach Schritt 3

- Darstellung je Typ (Confluence-Vorschau, Jira-Statuswechsel) fehlt; Argumente stehen als JSON.
- Postfach ohne Filter und Suche.
- Keine Übergabenotiz (V-10, Weg 2): Wiederaufnahme nur über die gespeicherte Sitzung.
- Änderungsmeldungen mit Vorher/Nachher und „Rückgängig“ (E-31) kommen mit ADT in Phase 3.
- Abbrechen hinterlässt weiterhin keinen Hinweis im Verlauf.

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
| Agenten | Anlegen und bearbeiten: Name, Auftrag (Systemprompt), Modell, welche Tools, welche Policy je Tool, welche Instructions/Skills |
| Chat | Mit einem Agenten schreiben; live sehen, was er tut (Antworten, Tool-Aufrufe, Ergebnisse) |
| Tool-Gateway | Vier Policies je Tool: erlauben / erlauben + melden / Freigabe / verbieten. Technisch erzwungen |
| Dateigrenze | Agent liest und schreibt nur im Workspace-Ordner; Shell standardmäßig aus |
| Postfach | Freigaben, Änderungsmeldungen (Vorher/Nachher bei Dateien), Rückfragen, Ergebnisse. Aktionen: freigeben, antworten, verwerfen, zur Kenntnis nehmen |
| Wiederaufnahme | Antwort auf einen Postfach-Eintrag setzt den Agenten mit Kontext fort (Sitzung fortsetzen, sonst Übergabenotiz) |
| Instructions/Skills | Ordner anzeigen, Dateien anlegen und bearbeiten, Agenten zuordnen |
| Verbrauch | Anzeige je Lauf und gesamt, Limit je Lauf |
| Simulationsmodus | Alles läuft auch ohne Copilot und ohne echte MCP-Server (Drehbuch-Laufzeit, Stellvertreter-Server) |

## Nicht enthalten

- ABAP entwickeln über ADT (Workspace, check/push/activate, Unit-Tests, Rückgängig) → Phase 3
- Zeitsteuerung und gespeicherte Workflows → Phase 4
- Orchestrator, mehrere Läufe gleichzeitig → Phase 5
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
