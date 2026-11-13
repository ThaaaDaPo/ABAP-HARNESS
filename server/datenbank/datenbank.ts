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

    -- Eingetragene MCP-Server. argumente, umgebung und tools sind JSON.
    CREATE TABLE IF NOT EXISTS mcp_server (
      schluessel      TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      befehl          TEXT NOT NULL,
      argumente       TEXT NOT NULL,
      umgebung        TEXT NOT NULL,
      arbeitsordner   TEXT NOT NULL,
      tools           TEXT NOT NULL,
      tools_gelesen_am TEXT,
      lese_fehler     TEXT,
      erstellt_am     TEXT NOT NULL
    );

    -- Regeln des Tool-Gateways je Agent, Server und Tool. tool = '*' ist die Standardregel des Servers.
    CREATE TABLE IF NOT EXISTS tool_regeln (
      agent_id  TEXT NOT NULL,
      server    TEXT NOT NULL,
      tool      TEXT NOT NULL,
      regel     TEXT NOT NULL,
      PRIMARY KEY (agent_id, server, tool)
    );

    -- Postfach: Vorschläge, die auf Freigabe warten, und Meldungen über ausgeführte Aufrufe.
    -- Anzeige und Aktionen kommen in Schritt 3; das Gateway legt hier schon ab.
    CREATE TABLE IF NOT EXISTS postfach (
      nr          INTEGER PRIMARY KEY AUTOINCREMENT,
      aufgabe_id  TEXT NOT NULL REFERENCES aufgaben(id),
      art         TEXT NOT NULL,
      server      TEXT NOT NULL,
      tool        TEXT NOT NULL,
      argumente   TEXT NOT NULL,
      ergebnis    TEXT,
      status      TEXT NOT NULL,
      erstellt_am TEXT NOT NULL
    );
  `);

  // Nach einem Neustart arbeitet kein Agent mehr – Aufgaben, die beim Beenden liefen, sind wieder bereit.
  db.exec(`UPDATE aufgaben SET status = 'bereit' WHERE status = 'arbeitet'`);

  return db;
}
