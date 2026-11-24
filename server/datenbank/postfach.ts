// Postfach-Einträge ablegen, lesen und ihren Status ändern.
// Was die Aktionen (freigeben, verwerfen, antworten …) bewirken, steht in server/postfach/.
import type { PostfachArt, PostfachEintrag, PostfachStatus } from "../../gemeinsam/typen.ts";
import type { Datenbank } from "./datenbank.ts";

export interface NeuerEintrag {
  aufgabeId: string;
  art: PostfachArt;
  server: string;
  tool: string;
  argumente: unknown;
  /** Nur bei Meldungen: was das Tool geliefert hat */
  ergebnis?: string;
}

interface PostfachZeile {
  nr: number;
  aufgabe_id: string;
  aufgabe_titel: string;
  art: PostfachArt;
  server: string;
  tool: string;
  argumente: string;
  ergebnis: string | null;
  antwort: string | null;
  status: PostfachStatus;
  weiter_nach_freigabe: number;
  erstellt_am: string;
  erledigt_am: string | null;
}

/** Diese Status heißen: David muss noch etwas tun. */
export const offeneStatus: PostfachStatus[] = ["offen", "fehlgeschlagen"];

const offenSql = `status IN ('offen', 'fehlgeschlagen')`;

function ausZeile(zeile: PostfachZeile): PostfachEintrag {
  return {
    nr: zeile.nr,
    aufgabeId: zeile.aufgabe_id,
    aufgabeTitel: zeile.aufgabe_titel,
    art: zeile.art,
    server: zeile.server,
    tool: zeile.tool,
    argumente: JSON.parse(zeile.argumente),
    ergebnis: zeile.ergebnis,
    antwort: zeile.antwort,
    status: zeile.status,
    weiterNachFreigabe: zeile.weiter_nach_freigabe === 1,
    erstelltAm: zeile.erstellt_am,
    erledigtAm: zeile.erledigt_am,
  };
}

const auswahl = `SELECT p.*, a.titel AS aufgabe_titel FROM postfach p JOIN aufgaben a ON a.id = p.aufgabe_id`;

/** Legt den Eintrag ab und gibt seine Nummer zurück. */
export function legeAb(db: Datenbank, eintrag: NeuerEintrag): number {
  const ergebnis = db
    .prepare(
      `INSERT INTO postfach (aufgabe_id, art, server, tool, argumente, ergebnis, status, erstellt_am)
       VALUES (?, ?, ?, ?, ?, ?, 'offen', ?)`,
    )
    .run(
      eintrag.aufgabeId,
      eintrag.art,
      eintrag.server,
      eintrag.tool,
      JSON.stringify(eintrag.argumente ?? null),
      eintrag.ergebnis ?? null,
      new Date().toISOString(),
    );
  return Number(ergebnis.lastInsertRowid);
}

/** Alle Einträge: offene zuerst, darin die ältesten oben; danach die erledigten, neueste oben. */
export function holeAlleEintraege(db: Datenbank): PostfachEintrag[] {
  const zeilen = db
    .prepare(`${auswahl} ORDER BY CASE WHEN p.${offenSql} THEN 0 ELSE 1 END, CASE WHEN p.${offenSql} THEN p.nr ELSE -p.nr END`)
    .all() as unknown as PostfachZeile[];
  return zeilen.map(ausZeile);
}

export function holeEintrag(db: Datenbank, nr: number): PostfachEintrag | null {
  const zeile = db.prepare(`${auswahl} WHERE p.nr = ?`).get(nr) as PostfachZeile | undefined;
  return zeile ? ausZeile(zeile) : null;
}

export function zaehleOffene(db: Datenbank): number {
  return (db.prepare(`SELECT COUNT(*) AS anzahl FROM postfach WHERE ${offenSql}`).get() as { anzahl: number }).anzahl;
}

/** Offene Freigaben und Rückfragen der Aufgabe – solange es welche gibt, wartet die Aufgabe. */
export function hatOffeneFreigabeOderRueckfrage(db: Datenbank, aufgabeId: string): boolean {
  return !!db.prepare(`SELECT 1 FROM postfach WHERE aufgabe_id = ? AND art != 'meldung' AND ${offenSql}`).get(aufgabeId);
}

/** Offene Einträge, auf die der Agent wartet, bevor er weitermachen kann (Rückfragen, E-45-Freigaben). */
export function hatBlockierendeEintraege(db: Datenbank, aufgabeId: string): boolean {
  return !!db
    .prepare(
      `SELECT 1 FROM postfach WHERE aufgabe_id = ? AND ${offenSql}
       AND (art = 'rueckfrage' OR (art = 'freigabe' AND weiter_nach_freigabe = 1))`,
    )
    .get(aufgabeId);
}

/** Der zuletzt abgelegte offene Vorschlag der Aufgabe, falls der Agent keine Nummer nennt. */
export function letzterOffenerVorschlag(db: Datenbank, aufgabeId: string): number | null {
  const zeile = db
    .prepare(`SELECT nr FROM postfach WHERE aufgabe_id = ? AND art = 'freigabe' AND ${offenSql} ORDER BY nr DESC LIMIT 1`)
    .get(aufgabeId) as { nr: number } | undefined;
  return zeile?.nr ?? null;
}

export function setzeWeiterNachFreigabe(db: Datenbank, nr: number): void {
  db.prepare(`UPDATE postfach SET weiter_nach_freigabe = 1 WHERE nr = ?`).run(nr);
}

export interface Abschluss {
  status: PostfachStatus;
  ergebnis?: string;
  antwort?: string;
}

/** Neuer Status nach einer Aktion. Ergebnis und Antwort bleiben, wenn sie nicht mitkommen. */
export function schliesseAb(db: Datenbank, nr: number, abschluss: Abschluss): void {
  const erledigt = offeneStatus.includes(abschluss.status) ? null : new Date().toISOString();
  db.prepare(
    `UPDATE postfach SET status = ?, ergebnis = COALESCE(?, ergebnis), antwort = COALESCE(?, antwort), erledigt_am = ? WHERE nr = ?`,
  ).run(abschluss.status, abschluss.ergebnis ?? null, abschluss.antwort ?? null, erledigt, nr);
}

export function setzeAntwort(db: Datenbank, nr: number, antwort: string): void {
  db.prepare(`UPDATE postfach SET antwort = ? WHERE nr = ?`).run(antwort, nr);
}
