// Prüft, dass eine Datenbank aus Schritt 2 (Firmenrechner) die neuen Spalten bekommt. npm test
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { oeffneDatenbank } from "./datenbank.ts";

test("Postfach aus Schritt 2 wird nachgerüstet, alte Einträge bleiben", () => {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "harness-db-"));
  const alt = new DatabaseSync(path.join(ordner, "harness.db"));
  alt.exec(`
    CREATE TABLE aufgaben (id TEXT PRIMARY KEY, titel TEXT NOT NULL, status TEXT NOT NULL, sitzung_id TEXT, erstellt_am TEXT NOT NULL);
    CREATE TABLE postfach (nr INTEGER PRIMARY KEY AUTOINCREMENT, aufgabe_id TEXT NOT NULL, art TEXT NOT NULL, server TEXT NOT NULL,
      tool TEXT NOT NULL, argumente TEXT NOT NULL, ergebnis TEXT, status TEXT NOT NULL, erstellt_am TEXT NOT NULL);
    INSERT INTO aufgaben VALUES ('a1', 'Alt', 'bereit', NULL, '');
    INSERT INTO postfach (aufgabe_id, art, server, tool, argumente, status, erstellt_am) VALUES ('a1', 'freigabe', 'jira', 'seite_anlegen', '{}', 'offen', '');
  `);
  alt.close();

  const db = oeffneDatenbank(ordner);
  const zeile = { ...(db.prepare(`SELECT nr, weiter_nach_freigabe, antwort, erledigt_am FROM postfach`).get() as object) };
  assert.deepEqual(zeile, { nr: 1, weiter_nach_freigabe: 0, antwort: null, erledigt_am: null });
  // Zweites Öffnen darf nicht scheitern
  db.close();
  oeffneDatenbank(ordner).close();
});
