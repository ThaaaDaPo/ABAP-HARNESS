// Aufgaben lesen, schreiben und löschen.
import { randomUUID } from "node:crypto";
import type { Aufgabe, AufgabenStatus, ModellWahl } from "../../gemeinsam/typen.ts";
import type { Datenbank } from "./datenbank.ts";

interface AufgabenZeile {
  id: string;
  titel: string;
  status: AufgabenStatus;
  sitzung_id: string | null;
  erstellt_am: string;
  modell: string;
  denkaufwand: string;
  kontext: ModellWahl["kontext"];
  herkunft: "chat" | "workflow";
  agent_id: string;
  workflow_lauf: number | null;
}

export interface AufgabeIntern extends Aufgabe {
  /** Id der Agenten-Sitzung, damit sie nach einem Neustart fortgesetzt werden kann. */
  sitzungId: string | null;
  /** "chat": David ist dabei. "workflow": Teil eines Workflow-Laufs (Aufgabe des Laufs oder KI-Schritt). */
  herkunft: "chat" | "workflow";
  /** Nummer des Workflow-Laufs, zu dem die Aufgabe gehört. Null bei Chats. */
  workflowLauf: number | null;
}

function ausZeile(zeile: AufgabenZeile): AufgabeIntern {
  return {
    id: zeile.id,
    titel: zeile.titel,
    status: zeile.status,
    sitzungId: zeile.sitzung_id,
    herkunft: zeile.herkunft,
    workflowLauf: zeile.workflow_lauf,
    erstelltAm: zeile.erstellt_am,
    agentId: zeile.agent_id,
    modellWahl: { modell: zeile.modell, denkaufwand: zeile.denkaufwand, kontext: zeile.kontext },
  };
}

/** Ohne interne Felder, für die Oberfläche. */
export function oeffentlich(aufgabe: AufgabeIntern): Aufgabe {
  const { sitzungId: _sitzung, herkunft: _herkunft, workflowLauf: _lauf, ...rest } = aufgabe;
  return rest;
}

/** Ohne `workflowLauf` ein Chat, sonst eine Aufgabe dieses Workflow-Laufs. */
export function legeAufgabeAn(db: Datenbank, titel: string, agentId: string, workflowLauf: number | null = null): AufgabeIntern {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO aufgaben (id, titel, status, sitzung_id, erstellt_am, agent_id, herkunft, workflow_lauf) VALUES (?, ?, 'bereit', NULL, ?, ?, ?, ?)`,
  ).run(id, titel, new Date().toISOString(), agentId, workflowLauf === null ? "chat" : "workflow", workflowLauf);
  return holeAufgabe(db, id)!;
}

/** Die Aufgabe des Laufs entsteht vor dem Lauf und bekommt seine Nummer danach. */
export function setzeWorkflowLauf(db: Datenbank, id: string, laufNr: number): void {
  db.prepare(`UPDATE aufgaben SET workflow_lauf = ?, herkunft = 'workflow' WHERE id = ?`).run(laufNr, id);
}

export function holeAufgabe(db: Datenbank, id: string): AufgabeIntern | null {
  const zeile = db.prepare(`SELECT * FROM aufgaben WHERE id = ?`).get(id) as AufgabenZeile | undefined;
  return zeile ? ausZeile(zeile) : null;
}

export function holeAlleAufgaben(db: Datenbank): AufgabeIntern[] {
  const zeilen = db.prepare(`SELECT * FROM aufgaben ORDER BY erstellt_am DESC`).all() as unknown as AufgabenZeile[];
  return zeilen.map(ausZeile);
}

/** Nur die Chats, neueste zuerst – Aufgaben von Workflows stehen in der Lauf-Ansicht. */
export function holeChats(db: Datenbank): AufgabeIntern[] {
  return holeAlleAufgaben(db).filter((a) => a.herkunft === "chat");
}

/** Chats ohne eine einzige Nachricht, die gerade auf nichts warten – die räumt „Neuer Chat“ weg. */
export function holeLeereAufgaben(db: Datenbank): string[] {
  const zeilen = db
    .prepare(
      `SELECT a.id FROM aufgaben a
       WHERE a.status = 'bereit' AND a.herkunft = 'chat'
         AND NOT EXISTS (SELECT 1 FROM ereignisse e WHERE e.aufgabe_id = a.id)
         AND NOT EXISTS (SELECT 1 FROM warteschlange w WHERE w.aufgabe_id = a.id)`,
    )
    .all() as { id: string }[];
  return zeilen.map((z) => z.id);
}

export function setzeStatus(db: Datenbank, id: string, status: AufgabenStatus): void {
  db.prepare(`UPDATE aufgaben SET status = ? WHERE id = ?`).run(status, id);
}

export function setzeTitel(db: Datenbank, id: string, titel: string): void {
  db.prepare(`UPDATE aufgaben SET titel = ? WHERE id = ?`).run(titel, id);
}

/** Merkt sich einen Hinweis, den der Agent mit der nächsten Nachricht bekommt. */
export function merkeHinweisFuerAgent(db: Datenbank, id: string, hinweis: string): void {
  db.prepare(`UPDATE aufgaben SET hinweis_fuer_agent = ltrim(hinweis_fuer_agent || char(10) || ?, char(10)) WHERE id = ?`).run(hinweis, id);
}

/** Gibt die gemerkten Hinweise zurück und leert sie. */
export function nimmHinweiseFuerAgent(db: Datenbank, id: string): string {
  const zeile = db.prepare(`SELECT hinweis_fuer_agent AS hinweis FROM aufgaben WHERE id = ?`).get(id) as { hinweis: string } | undefined;
  if (zeile?.hinweis) db.prepare(`UPDATE aufgaben SET hinweis_fuer_agent = '' WHERE id = ?`).run(id);
  return zeile?.hinweis ?? "";
}

export function setzeSitzungId(db: Datenbank, id: string, sitzungId: string): void {
  db.prepare(`UPDATE aufgaben SET sitzung_id = ? WHERE id = ?`).run(sitzungId, id);
}

export function setzeModellWahl(db: Datenbank, id: string, wahl: ModellWahl): void {
  db.prepare(`UPDATE aufgaben SET modell = ?, denkaufwand = ?, kontext = ? WHERE id = ?`).run(
    wahl.modell,
    wahl.denkaufwand,
    wahl.kontext,
    id,
  );
}

export function setzeAgent(db: Datenbank, id: string, agentId: string): void {
  db.prepare(`UPDATE aufgaben SET agent_id = ? WHERE id = ?`).run(agentId, id);
}

/** Löscht die Aufgabe mit Verlauf, Postfach-Einträgen und Warteschlange. */
export function loescheAufgabe(db: Datenbank, id: string): void {
  for (const tabelle of ["ereignisse", "postfach", "warteschlange"]) {
    db.prepare(`DELETE FROM ${tabelle} WHERE aufgabe_id = ?`).run(id);
  }
  db.prepare(`DELETE FROM aufgaben WHERE id = ?`).run(id);
}
