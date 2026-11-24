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
  // Meldungen aus einem Chat hat David schon live gesehen – sie gelten gleich als zur Kenntnis genommen.
  const status = eintrag.art === "meldung" && kommtAusChat(db, eintrag.aufgabeId) ? "zur_kenntnis" : "offen";
  const ergebnis = db
    .prepare(
      `INSERT INTO postfach (aufgabe_id, art, server, tool, argumente, ergebnis, status, erstellt_am)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      eintrag.aufgabeId,
      eintrag.art,
      eintrag.server,
      eintrag.tool,
      JSON.stringify(eintrag.argumente ?? null),
      eintrag.ergebnis ?? null,
      status,
      new Date().toISOString(),
    );
  return Number(ergebnis.lastInsertRowid);
}

function kommtAusChat(db: Datenbank, aufgabeId: string): boolean {
  const zeile = db.prepare(`SELECT herkunft FROM aufgaben WHERE id = ?`).get(aufgabeId) as { herkunft: string } | undefined;
  return zeile?.herkunft !== "workflow";
}

/** Offene zuerst, darin die ältesten oben; danach die erledigten, neueste oben. */
const reihenfolge = `ORDER BY CASE WHEN p.${offenSql} THEN 0 ELSE 1 END, CASE WHEN p.${offenSql} THEN p.nr ELSE -p.nr END`;

export function holeAlleEintraege(db: Datenbank): PostfachEintrag[] {
  return (db.prepare(`${auswahl} ${reihenfolge}`).all() as unknown as PostfachZeile[]).map(ausZeile);
}

/** Einträge aus Workflows – nur die gehören ins Postfach (E-52). */
export function holeWorkflowEintraege(db: Datenbank): PostfachEintrag[] {
  return (db.prepare(`${auswahl} WHERE a.herkunft = 'workflow' ${reihenfolge}`).all() as unknown as PostfachZeile[]).map(ausZeile);
}

/** Einträge eines Chats, in der Reihenfolge, in der sie entstanden sind. */
export function holeEintraegeDerAufgabe(db: Datenbank, aufgabeId: string): PostfachEintrag[] {
  return (db.prepare(`${auswahl} WHERE p.aufgabe_id = ? ORDER BY p.nr`).all(aufgabeId) as unknown as PostfachZeile[]).map(ausZeile);
}

/** Offene Rückfragen der Aufgabe. Im Chat beantwortet David sie im normalen Eingabefeld. */
export function offeneRueckfragen(db: Datenbank, aufgabeId: string): number[] {
  const zeilen = db.prepare(`SELECT nr FROM postfach WHERE aufgabe_id = ? AND art = 'rueckfrage' AND ${offenSql} ORDER BY nr`).all(aufgabeId) as {
    nr: number;
  }[];
  return zeilen.map((z) => z.nr);
}

export function holeEintrag(db: Datenbank, nr: number): PostfachEintrag | null {
  const zeile = db.prepare(`${auswahl} WHERE p.nr = ?`).get(nr) as PostfachZeile | undefined;
  return zeile ? ausZeile(zeile) : null;
}

/** Offene Einträge aus Workflows (Zähler in der Navigation) */
export function zaehleOffene(db: Datenbank): number {
  return (
    db.prepare(`SELECT COUNT(*) AS anzahl FROM postfach p JOIN aufgaben a ON a.id = p.aufgabe_id WHERE a.herkunft = 'workflow' AND p.${offenSql}`).get() as {
      anzahl: number;
    }
  ).anzahl;
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
