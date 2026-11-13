# Prüfpaket (Phase 0)

Prüft auf dem Firmenrechner, ob Copilot SDK und SAP-ADT so funktionieren, wie die Plattform es
braucht. Wegwerf-Code: reines JavaScript, kein Build-Schritt.

## Voraussetzungen

- Windows, Node.js ab 22.15 (`node -v`)
- `npm` zeigt auf das Firmen-Nexus
- Copilot ist angemeldet (`npx @github/copilot` funktioniert)
- Microsoft Edge ist installiert

## Ausführen

Den Ordner `pruefpaket` **ohne** `node_modules` übertragen, dann im Ordner:

```
npm install
copy config.beispiel.json config.json
```

`config.json` ausfüllen: `sap.url` (dieselbe URL, die der bestehende Proxy an `get-cookie.js`
übergibt), `sap.mandant`, `sap.benutzer`. Danach in dieser Reihenfolge:

```
npm run pruefen:umgebung
npm run pruefen:copilot
npm run pruefen:sap
```

Jeder Lauf zeigt eine Ergebnistabelle (zum Abfotografieren) und schreibt
`bericht\bericht.txt` sowie `bericht\bericht.html` mit QR-Codes desselben Inhalts.

## Was passiert dabei

| Bereich | Schritte | Wirkung |
|---|---|---|
| umgebung | U1–U7 | nur lesend: Node-Version, Registry, Pakete ladbar |
| copilot | C1–C8 | startet eine Copilot-Sitzung, verbraucht einige wenige Anfragen; schreibt nur in einen temporären Ordner, der danach gelöscht wird |
| sap | S1–S10 | öffnet kurz Edge für das Cookie; legt das Programm `ZHARNESS_PRUEF_T0` in `$TMP` an, prüft, speichert, aktiviert, testet und **löscht es wieder** |

Der SAP-Teil fasst kein bestehendes Objekt an: Gibt es den Namen schon außerhalb von `$TMP`,
bricht er ab. Schlägt das Löschen am Ende fehl, steht das ausdrücklich in der Ausgabe.

Cookie-Werte werden nie ausgegeben oder gespeichert, nur die Cookie-Namen.

## Wenn `npm install` scheitert

Meist fehlt ein Paket im Nexus. Benötigt werden `@github/copilot-sdk` 1.0.32 samt
`@github/copilot-sdk-win32-x64` (ca. 190 MB, enthält die Copilot-Laufzeit), `abap-adt-api` 10.0.0,
`playwright-core` 1.65.0, `qrcode` 1.5.4. Die Fehlermeldung von npm nennt das fehlende Paket.
