// Ereignisse einer Aufgabe speichern und lesen.
import type { Ereignis, GespeichertesEreignis } from "../../gemeinsam/typen.ts";
import type { Datenbank } from "./datenbank.ts";

interface EreignisZeile {
  nr: number;
  zeitpunkt: string;
  daten: string;
}

/** Diese Arten sind nur für die Live-Anzeige gedacht und werden nicht gespeichert. */
const nurLive: Ereignis["art"][] = ["agent_schreibt", "status"];

export function sollGespeichertWerden(ereignis: Ereignis): boolean {
  return !nurLive.includes(ereignis.art);
}

export function speichereEreignis(db: Datenbank, aufgabeId: string, ereignis: Ereignis): GespeichertesEreignis {
  const zeitpunkt = new Date().toISOString();
  const ergebnis = db
    .prepare(`INSERT INTO ereignisse (aufgabe_id, zeitpunkt, art, daten) VALUES (?, ?, ?, ?)`)
    .run(aufgabeId, zeitpunkt, ereignis.art, JSON.stringify(ereignis));
  return { ...ereignis, nr: Number(ergebnis.lastInsertRowid), zeitpunkt };
}

export function holeEreignisse(db: Datenbank, aufgabeId: string): GespeichertesEreignis[] {
  const zeilen = db
    .prepare(`SELECT nr, zeitpunkt, daten FROM ereignisse WHERE aufgabe_id = ? ORDER BY nr`)
    .all(aufgabeId) as unknown as EreignisZeile[];
  return zeilen.map((zeile) => ({ ...JSON.parse(zeile.daten), nr: zeile.nr, zeitpunkt: zeile.zeitpunkt }));
}
