// Prüft, dass Datenbanken aus früheren Schritten (Firmenrechner) nachgerüstet werden. npm test
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { test } from "node:test";
import { richteStandardAgentenEin } from "../agenten/agenten-dienst.ts";
import type { Einstellungen } from "../einstellungen.ts";
import { holeAgent, standardAgentId } from "./agenten.ts";
import { holeAufgabe } from "./aufgaben.ts";
import { oeffneDatenbank } from "./datenbank.ts";
import { legeServerAn } from "./mcp-server.ts";

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

test("Datenbank aus Schritt 3: Chats gehören dem Standard-Agenten, der alle Server bekommt", () => {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "harness-db-"));
  const alt = oeffneDatenbank(ordner);
  // Stand Schritt 3: Chat und Server, aber noch keine Agenten
  alt.exec(`DELETE FROM agenten`);
  alt.prepare(`INSERT INTO aufgaben (id, titel, status, erstellt_am) VALUES ('a1', 'Alt', 'bereit', '')`).run();
  legeServerAn(alt, { schluessel: "atlassian", name: "Atlassian", befehl: "node", argumente: [], umgebung: {}, arbeitsordner: "" });
  alt.close();

  const db = oeffneDatenbank(ordner);
  const einstellungen = { agent: { name: "Assistent", auftrag: "Hilf." }, modell: "gpt-x" } as Einstellungen;
  richteStandardAgentenEin(db, einstellungen);
  const agent = holeAgent(db, standardAgentId);
  assert.deepEqual(
    [agent?.name, agent?.auftrag, agent?.modellWahl.modell, agent?.mcpServer],
    ["Assistent", "Hilf.", "gpt-x", ["atlassian"]],
  );
  assert.equal(holeAufgabe(db, "a1")?.agentId, standardAgentId);
  // Ein zweiter Start ändert nichts mehr – auch nicht, wenn einstellungen.json inzwischen anders ist
  richteStandardAgentenEin(db, { ...einstellungen, agent: { name: "Neu", auftrag: "" } });
  assert.equal(holeAgent(db, standardAgentId)?.name, "Assistent");
});
