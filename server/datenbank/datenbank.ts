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

    -- Agenten (seit Schritt 4). mcp_server, instructions und skills sind JSON-Listen.
    -- Die Regeln je Tool stehen in tool_regeln (agent_id).
    CREATE TABLE IF NOT EXISTS agenten (
      id           TEXT PRIMARY KEY,
      name         TEXT NOT NULL,
      auftrag      TEXT NOT NULL,
      modell       TEXT NOT NULL,
      denkaufwand  TEXT NOT NULL,
      kontext      TEXT NOT NULL,
      mcp_server   TEXT NOT NULL,
      instructions TEXT NOT NULL,
      skills       TEXT NOT NULL,
      erstellt_am  TEXT NOT NULL
    );

    -- Verbrauch je Modellaufruf (seit Schritt 4). lauf fasst die Aufrufe einer Nachricht zusammen.
    -- Bleibt stehen, wenn ein Chat gelöscht wird: Verbraucht ist verbraucht.
    CREATE TABLE IF NOT EXISTS verbrauch (
      nr             INTEGER PRIMARY KEY AUTOINCREMENT,
      aufgabe_id     TEXT NOT NULL,
      agent_id       TEXT NOT NULL,
      lauf           TEXT NOT NULL,
      modell         TEXT NOT NULL,
      eingabe_tokens INTEGER NOT NULL,
      ausgabe_tokens INTEGER NOT NULL,
      cache_tokens   INTEGER NOT NULL,
      nano_aiu       INTEGER,
      kostenfaktor   REAL,
      zeitpunkt      TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS verbrauch_nach_aufgabe ON verbrauch(aufgabe_id);

    -- Einstellungen, die David in der App vornimmt (seit Phase 3: ADT). wert ist JSON.
    CREATE TABLE IF NOT EXISTS app_einstellungen (
      schluessel TEXT PRIMARY KEY,
      wert       TEXT NOT NULL
    );

    -- Läufe von Workflows (seit Phase 4). definition ist der Stand der Workflow-Datei beim Start,
    -- damit eine spätere Änderung der Datei einen laufenden Lauf nicht durcheinanderbringt.
    -- aufgabe_id: Aufgabe des Laufs, an der Freigaben der festen Tool-Schritte hängen.
    -- chat_aufgabe_id: aus diesem Chat gestartet – Freigaben erscheinen dort statt im Postfach (E-68).
    CREATE TABLE IF NOT EXISTS workflow_laeufe (
      nr                  INTEGER PRIMARY KEY AUTOINCREMENT,
      workflow_id         TEXT NOT NULL,
      workflow_name       TEXT NOT NULL,
      definition          TEXT NOT NULL,
      ausloeser           TEXT NOT NULL,
      eingaben            TEXT NOT NULL,
      status              TEXT NOT NULL,
      aktueller_schritt   TEXT NOT NULL DEFAULT '',
      ergebnis            TEXT,
      fehler              TEXT,
      aufgabe_id          TEXT NOT NULL,
      aufrufer_aufgabe_id TEXT,
      chat_aufgabe_id     TEXT,
      eltern_lauf         INTEGER,
      benachrichtigen     INTEGER NOT NULL DEFAULT 0,
      gestartet_am        TEXT NOT NULL,
      beendet_am          TEXT
    );

    -- Protokoll eines Laufs: je ausgeführtem Schritt (in Schleifen je Durchlauf) eine Zeile.
    -- schluessel ist die Stelle im Ablauf, z. B. "schleife[2]/tool1". Beim Fortsetzen nach einer
    -- Unterbrechung werden fertige Tool-, KI- und Workflow-Schritte daraus übernommen statt wiederholt.
    CREATE TABLE IF NOT EXISTS workflow_schritte (
      nr           INTEGER PRIMARY KEY AUTOINCREMENT,
      lauf_nr      INTEGER NOT NULL,
      schluessel   TEXT NOT NULL,
      schritt_id   TEXT NOT NULL,
      art          TEXT NOT NULL,
      titel        TEXT NOT NULL,
      durchlauf    TEXT NOT NULL,
      tiefe        INTEGER NOT NULL,
      status       TEXT NOT NULL,
      eingabe      TEXT,
      ergebnis     TEXT,
      meldung      TEXT,
      aufgabe_id   TEXT,
      postfach_nr  INTEGER,
      gestartet_am TEXT NOT NULL,
      beendet_am   TEXT,
      UNIQUE (lauf_nr, schluessel)
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
  // Woher die Aufgabe kommt: "chat" (David ist dabei) oder "workflow" (Teil eines Workflow-Laufs).
  // Freigaben aus Chats werden im Chat erledigt, nur die aus Workflows im Postfach (E-52).
  ergaenzeSpalte(db, "aufgaben", "herkunft", "TEXT NOT NULL DEFAULT 'chat'");
  // Agent je Chat (seit Schritt 4). Bestehende Chats gehören dem Agenten, der aus einstellungen.json entsteht.
  ergaenzeSpalte(db, "aufgaben", "agent_id", "TEXT NOT NULL DEFAULT 'standard'");
  // Eingebaute MCP-Server (ADT): Startbefehl setzt die App, eingestellt wird über ein eigenes Formular.
  ergaenzeSpalte(db, "mcp_server", "eingebaut", "INTEGER NOT NULL DEFAULT 0");
  // Was der Agent mit der nächsten Nachricht erfahren soll, z. B. dass David eine ADT-Änderung
  // rückgängig gemacht hat (seit Phase 3). Leer = nichts.
  ergaenzeSpalte(db, "aufgaben", "hinweis_fuer_agent", "TEXT NOT NULL DEFAULT ''");
  // Seit Phase 4: Aufgaben eines Workflow-Laufs (Aufgabe des Laufs und KI-Schritte) tragen seine Nummer.
  ergaenzeSpalte(db, "aufgaben", "workflow_lauf", "INTEGER");
  // Workflows, die ein Agent starten darf (JSON-Liste der Kennungen)
  ergaenzeSpalte(db, "agenten", "workflows", "TEXT NOT NULL DEFAULT '[]'");

  return db;
}

function ergaenzeSpalte(db: Datenbank, tabelle: string, spalte: string, definition: string): void {
  const spalten = db.prepare(`PRAGMA table_info(${tabelle})`).all() as { name: string }[];
  if (!spalten.some((s) => s.name === spalte)) db.exec(`ALTER TABLE ${tabelle} ADD COLUMN ${spalte} ${definition}`);
}
