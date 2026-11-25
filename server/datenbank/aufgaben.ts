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
}

export interface AufgabeIntern extends Aufgabe {
  /** Id der Agenten-Sitzung, damit sie nach einem Neustart fortgesetzt werden kann. */
  sitzungId: string | null;
  /** "chat": David ist dabei. "workflow" (ab Phase 4): läuft ohne ihn. */
  herkunft: "chat" | "workflow";
}

function ausZeile(zeile: AufgabenZeile): AufgabeIntern {
  return {
    id: zeile.id,
    titel: zeile.titel,
    status: zeile.status,
    sitzungId: zeile.sitzung_id,
    herkunft: zeile.herkunft,
    erstelltAm: zeile.erstellt_am,
    agentId: zeile.agent_id,
    modellWahl: { modell: zeile.modell, denkaufwand: zeile.denkaufwand, kontext: zeile.kontext },
  };
}

/** Ohne interne Felder, für die Oberfläche. */
export function oeffentlich(aufgabe: AufgabeIntern): Aufgabe {
  const { sitzungId: _sitzung, herkunft: _herkunft, ...rest } = aufgabe;
  return rest;
}

export function legeAufgabeAn(db: Datenbank, titel: string, agentId: string): AufgabeIntern {
  const id = randomUUID();
  db.prepare(`INSERT INTO aufgaben (id, titel, status, sitzung_id, erstellt_am, agent_id) VALUES (?, ?, 'bereit', NULL, ?, ?)`).run(
    id,
    titel,
    new Date().toISOString(),
    agentId,
  );
  return holeAufgabe(db, id)!;
}

export function holeAufgabe(db: Datenbank, id: string): AufgabeIntern | null {
  const zeile = db.prepare(`SELECT * FROM aufgaben WHERE id = ?`).get(id) as AufgabenZeile | undefined;
  return zeile ? ausZeile(zeile) : null;
}

export function holeAlleAufgaben(db: Datenbank): AufgabeIntern[] {
  const zeilen = db.prepare(`SELECT * FROM aufgaben ORDER BY erstellt_am DESC`).all() as unknown as AufgabenZeile[];
  return zeilen.map(ausZeile);
}

/** Chats ohne eine einzige Nachricht, die gerade auf nichts warten – die räumt „Neuer Chat“ weg. */
export function holeLeereAufgaben(db: Datenbank): string[] {
  const zeilen = db
    .prepare(
      `SELECT a.id FROM aufgaben a
       WHERE a.status = 'bereit'
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
