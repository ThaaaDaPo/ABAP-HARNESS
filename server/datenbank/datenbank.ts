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

    -- Postfach: Vorschläge, die auf Freigabe warten, Meldungen über ausgeführte Aufrufe und
    -- Rückfragen des Agenten. Weitere Spalten werden unten nachgerüstet.
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

    -- Arbeit, die auf den Agenten wartet: Nachrichten aus dem Chat und Fortsetzungen nach
    -- Postfach-Aktionen. Liegt in der Datenbank, damit nach einem Neustart nichts verloren geht.
    CREATE TABLE IF NOT EXISTS warteschlange (
      nr           INTEGER PRIMARY KEY AUTOINCREMENT,
      aufgabe_id   TEXT NOT NULL REFERENCES aufgaben(id),
      text         TEXT NOT NULL,
      aus_postfach INTEGER NOT NULL,
      erstellt_am  TEXT NOT NULL
    );
  `);

  // Seit Schritt 3. Bestehende Datenbanken (Firmenrechner) bekommen die Spalten nachgerüstet.
  ergaenzeSpalte(db, "postfach", "weiter_nach_freigabe", "INTEGER NOT NULL DEFAULT 0");
  ergaenzeSpalte(db, "postfach", "antwort", "TEXT");
  ergaenzeSpalte(db, "postfach", "erledigt_am", "TEXT");
  // Modellwahl je Chat (seit Schritt 3)
  ergaenzeSpalte(db, "aufgaben", "modell", "TEXT NOT NULL DEFAULT ''");
  ergaenzeSpalte(db, "aufgaben", "denkaufwand", "TEXT NOT NULL DEFAULT ''");
  ergaenzeSpalte(db, "aufgaben", "kontext", "TEXT NOT NULL DEFAULT 'standard'");
  // Woher die Aufgabe kommt: "chat" (David ist dabei) oder später "workflow" (läuft ohne ihn).
  // Freigaben aus Chats werden im Chat erledigt, nur die aus Workflows im Postfach (E-52).
  ergaenzeSpalte(db, "aufgaben", "herkunft", "TEXT NOT NULL DEFAULT 'chat'");

  return db;
}

function ergaenzeSpalte(db: Datenbank, tabelle: string, spalte: string, definition: string): void {
  const spalten = db.prepare(`PRAGMA table_info(${tabelle})`).all() as { name: string }[];
  if (!spalten.some((s) => s.name === spalte)) db.exec(`ALTER TABLE ${tabelle} ADD COLUMN ${spalte} ${definition}`);
}
