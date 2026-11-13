// Aufgaben lesen und schreiben.
import { randomUUID } from "node:crypto";
import type { Aufgabe, AufgabenStatus } from "../../gemeinsam/typen.ts";
import type { Datenbank } from "./datenbank.ts";

interface AufgabenZeile {
  id: string;
  titel: string;
  status: AufgabenStatus;
  sitzung_id: string | null;
  erstellt_am: string;
}

export interface AufgabeIntern extends Aufgabe {
  /** Id der Agenten-Sitzung, damit sie nach einem Neustart fortgesetzt werden kann. */
  sitzungId: string | null;
}

function ausZeile(zeile: AufgabenZeile): AufgabeIntern {
  return {
    id: zeile.id,
    titel: zeile.titel,
    status: zeile.status,
    sitzungId: zeile.sitzung_id,
    erstelltAm: zeile.erstellt_am,
  };
}

/** Ohne interne Felder, für die Oberfläche. */
export function oeffentlich(aufgabe: AufgabeIntern): Aufgabe {
  const { sitzungId: _weglassen, ...rest } = aufgabe;
  return rest;
}

export function legeAufgabeAn(db: Datenbank, titel: string): AufgabeIntern {
  const aufgabe: AufgabeIntern = {
    id: randomUUID(),
    titel,
    status: "bereit",
    sitzungId: null,
    erstelltAm: new Date().toISOString(),
  };
  db.prepare(`INSERT INTO aufgaben (id, titel, status, sitzung_id, erstellt_am) VALUES (?, ?, ?, ?, ?)`).run(
    aufgabe.id,
    aufgabe.titel,
    aufgabe.status,
    aufgabe.sitzungId,
    aufgabe.erstelltAm,
  );
  return aufgabe;
}

export function holeAufgabe(db: Datenbank, id: string): AufgabeIntern | null {
  const zeile = db.prepare(`SELECT * FROM aufgaben WHERE id = ?`).get(id) as AufgabenZeile | undefined;
  return zeile ? ausZeile(zeile) : null;
}

export function holeAlleAufgaben(db: Datenbank): AufgabeIntern[] {
  const zeilen = db.prepare(`SELECT * FROM aufgaben ORDER BY erstellt_am DESC`).all() as unknown as AufgabenZeile[];
  return zeilen.map(ausZeile);
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
