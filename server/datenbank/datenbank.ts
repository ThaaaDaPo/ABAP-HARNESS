// Öffnet die SQLite-Datenbank (in Node eingebaut, kein Zusatzpaket) und legt die Tabellen an.
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type Datenbank = DatabaseSync;

export function oeffneDatenbank(datenOrdner: string): Datenbank {
  const db = new DatabaseSync(path.join(datenOrdner, "harness.db"));

  db.exec(`
    CREATE TABLE IF NOT EXISTS aufgaben (
      id          TEXT PRIMARY KEY,
      titel       TEXT NOT NULL,
      status      TEXT NOT NULL,
      sitzung_id  TEXT,
      erstellt_am TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ereignisse (
      nr          INTEGER PRIMARY KEY AUTOINCREMENT,
      aufgabe_id  TEXT NOT NULL REFERENCES aufgaben(id),
      zeitpunkt   TEXT NOT NULL,
      art         TEXT NOT NULL,
      daten       TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS ereignisse_nach_aufgabe ON ereignisse(aufgabe_id, nr);
  `);

  // Nach einem Neustart arbeitet kein Agent mehr – Aufgaben, die beim Beenden liefen, sind wieder bereit.
  db.exec(`UPDATE aufgaben SET status = 'bereit' WHERE status = 'arbeitet'`);

  return db;
}
