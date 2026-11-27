// Workflow-Läufe und ihr Protokoll (je ausgeführtem Schritt eine Zeile) lesen und schreiben.
// Was ein Lauf tut, steht in server/workflows/.
import type {
  LaufAusloeser,
  LaufSchritt,
  LaufStatus,
  SchrittStatus,
  WorkflowDefinition,
  WorkflowLauf,
  WorkflowSchritt,
} from "../../gemeinsam/typen.ts";
import { legeAufgabeAn, setzeWorkflowLauf } from "./aufgaben.ts";
import type { Datenbank } from "./datenbank.ts";
import { summeDesWorkflowLaufs } from "./verbrauch.ts";

interface LaufZeile {
  nr: number;
  workflow_id: string;
  workflow_name: string;
  definition: string;
  ausloeser: LaufAusloeser;
  eingaben: string;
  status: LaufStatus;
  aktueller_schritt: string;
  ergebnis: string | null;
  fehler: string | null;
  aufgabe_id: string;
  aufrufer_aufgabe_id: string | null;
  chat_aufgabe_id: string | null;
  eltern_lauf: number | null;
  benachrichtigen: number;
  gestartet_am: string;
  beendet_am: string | null;
}

/** Ein Lauf mit dem, was nur der Server braucht. */
export interface LaufIntern extends WorkflowLauf {
  definition: WorkflowDefinition;
  /** Aufgabe des Laufs: daran hängen die Freigaben der festen Tool-Schritte */
  aufgabeId: string;
  /** Wer ihn gestartet hat (Chat oder KI-Schritt) – null bei manuellem Start und Zeitplan */
  aufruferAufgabeId: string | null;
  /** Der Aufrufer wartet nicht und bekommt am Ende eine Nachricht (E-71) */
  benachrichtigen: boolean;
}

const json = (text: string | null) => (text === null ? null : JSON.parse(text));

function ausZeile(db: Datenbank, zeile: LaufZeile): LaufIntern {
  const definition: WorkflowDefinition = JSON.parse(zeile.definition);
  return {
    nr: zeile.nr,
    workflowId: zeile.workflow_id,
    workflowName: zeile.workflow_name,
    ausloeser: zeile.ausloeser,
    status: zeile.status,
    eingaben: JSON.parse(zeile.eingaben),
    aktuellerSchritt: zeile.aktueller_schritt,
    ergebnis: json(zeile.ergebnis),
    fehler: zeile.fehler,
    gestartetAm: zeile.gestartet_am,
    beendetAm: zeile.beendet_am,
    chatAufgabeId: zeile.chat_aufgabe_id,
    elternLauf: zeile.eltern_lauf,
    creditLimit: definition.creditLimit,
    verbrauch: summeDesWorkflowLaufs(db, zeile.nr),
    definition,
    aufgabeId: zeile.aufgabe_id,
    aufruferAufgabeId: zeile.aufrufer_aufgabe_id,
    benachrichtigen: zeile.benachrichtigen === 1,
  };
}

/** Ohne interne Felder, für die Oberfläche. */
export function oeffentlich(lauf: LaufIntern): WorkflowLauf {
  const { definition: _d, aufgabeId: _a, aufruferAufgabeId: _r, benachrichtigen: _b, ...rest } = lauf;
  return rest;
}

export interface NeuerLauf {
  workflowId: string;
  definition: WorkflowDefinition;
  ausloeser: LaufAusloeser;
  eingaben: Record<string, unknown>;
  aufruferAufgabeId: string | null;
  chatAufgabeId: string | null;
  elternLauf: number | null;
  benachrichtigen: boolean;
}

/** Legt den Lauf mit seiner Aufgabe an. Status: laeuft. */
export function legeLaufAn(db: Datenbank, neu: NeuerLauf): LaufIntern {
  const aufgabe = legeAufgabeAn(db, `Workflow „${neu.definition.name}“`, "standard");
  const ergebnis = db
    .prepare(
      `INSERT INTO workflow_laeufe (workflow_id, workflow_name, definition, ausloeser, eingaben, status, aufgabe_id,
         aufrufer_aufgabe_id, chat_aufgabe_id, eltern_lauf, benachrichtigen, gestartet_am)
       VALUES (?, ?, ?, ?, ?, 'laeuft', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      neu.workflowId,
      neu.definition.name,
      JSON.stringify(neu.definition),
      neu.ausloeser,
      JSON.stringify(neu.eingaben),
      aufgabe.id,
      neu.aufruferAufgabeId,
      neu.chatAufgabeId,
      neu.elternLauf,
      neu.benachrichtigen ? 1 : 0,
      new Date().toISOString(),
    );
  const nr = Number(ergebnis.lastInsertRowid);
  // Titel mit Nummer, damit Postfach-Einträge zeigen, aus welchem Lauf sie kommen
  db.prepare(`UPDATE aufgaben SET titel = ? WHERE id = ?`).run(`Workflow „${neu.definition.name}“ · Lauf #${nr}`, aufgabe.id);
  setzeWorkflowLauf(db, aufgabe.id, nr);
  return holeLauf(db, nr)!;
}

export function holeLauf(db: Datenbank, nr: number): LaufIntern | null {
  const zeile = db.prepare(`SELECT * FROM workflow_laeufe WHERE nr = ?`).get(nr) as LaufZeile | undefined;
  return zeile ? ausZeile(db, zeile) : null;
}

/** Neueste zuerst. Ohne workflowId alle Workflows. */
export function holeLaeufe(db: Datenbank, workflowId?: string, anzahl = 100): LaufIntern[] {
  const zeilen = (
    workflowId
      ? db.prepare(`SELECT * FROM workflow_laeufe WHERE workflow_id = ? ORDER BY nr DESC LIMIT ?`).all(workflowId, anzahl)
      : db.prepare(`SELECT * FROM workflow_laeufe ORDER BY nr DESC LIMIT ?`).all(anzahl)
  ) as unknown as LaufZeile[];
  return zeilen.map((z) => ausZeile(db, z));
}

/** Läufe, die beim letzten Beenden der App noch liefen oder warteten. */
export function holeOffeneLaeufe(db: Datenbank): LaufIntern[] {
  const zeilen = db.prepare(`SELECT * FROM workflow_laeufe WHERE status IN ('laeuft', 'wartet') ORDER BY nr`).all() as unknown as LaufZeile[];
  return zeilen.map((z) => ausZeile(db, z));
}

/** Aus welchem Chat der Lauf gestartet wurde (E-68). Null, wenn nicht aus einem Chat. */
export function chatDesLaufs(db: Datenbank, nr: number): string | null {
  const zeile = db.prepare(`SELECT chat_aufgabe_id AS chat FROM workflow_laeufe WHERE nr = ?`).get(nr) as { chat: string | null } | undefined;
  return zeile?.chat ?? null;
}

export function setzeStatus(db: Datenbank, nr: number, status: LaufStatus): void {
  db.prepare(`UPDATE workflow_laeufe SET status = ? WHERE nr = ?`).run(status, nr);
}

export function setzeAktuellenSchritt(db: Datenbank, nr: number, titel: string): void {
  db.prepare(`UPDATE workflow_laeufe SET aktueller_schritt = ? WHERE nr = ?`).run(titel, nr);
}

/** Lauf ist fertig (erfolgreich, fehlgeschlagen, abgebrochen) oder unterbrochen. */
export function beendeLauf(db: Datenbank, nr: number, status: LaufStatus, ergebnis: unknown, fehler: string | null): void {
  db.prepare(`UPDATE workflow_laeufe SET status = ?, ergebnis = ?, fehler = ?, aktueller_schritt = '', beendet_am = ? WHERE nr = ?`).run(
    status,
    ergebnis === undefined ? null : JSON.stringify(ergebnis),
    fehler,
    new Date().toISOString(),
    nr,
  );
}

/** Fortsetzen nach Unterbrechung oder Fehler: wieder „läuft“, Fehler und Ende gelöscht. */
export function nimmLaufWiederAuf(db: Datenbank, nr: number): void {
  db.prepare(`UPDATE workflow_laeufe SET status = 'laeuft', fehler = NULL, ergebnis = NULL, beendet_am = NULL WHERE nr = ?`).run(nr);
}

// ---------------------------------------------------------------------------------------------
// Protokoll der Schritte
// ---------------------------------------------------------------------------------------------

interface SchrittZeile {
  nr: number;
  schluessel: string;
  schritt_id: string;
  art: WorkflowSchritt["art"];
  titel: string;
  durchlauf: string;
  tiefe: number;
  status: SchrittStatus;
  eingabe: string | null;
  ergebnis: string | null;
  meldung: string | null;
  aufgabe_id: string | null;
  postfach_nr: number | null;
  gestartet_am: string;
  beendet_am: string | null;
}

export interface ProtokollEintrag extends LaufSchritt {
  schluessel: string;
}

function schrittAusZeile(zeile: SchrittZeile): ProtokollEintrag {
  return {
    nr: zeile.nr,
    schluessel: zeile.schluessel,
    schrittId: zeile.schritt_id,
    art: zeile.art,
    titel: zeile.titel,
    durchlauf: zeile.durchlauf,
    tiefe: zeile.tiefe,
    status: zeile.status,
    eingabe: json(zeile.eingabe),
    ergebnis: json(zeile.ergebnis),
    meldung: zeile.meldung,
    aufgabeId: zeile.aufgabe_id,
    postfachNr: zeile.postfach_nr,
    gestartetAm: zeile.gestartet_am,
    beendetAm: zeile.beendet_am,
  };
}

export function holeSchritte(db: Datenbank, laufNr: number): ProtokollEintrag[] {
  const zeilen = db.prepare(`SELECT * FROM workflow_schritte WHERE lauf_nr = ? ORDER BY nr`).all(laufNr) as unknown as SchrittZeile[];
  return zeilen.map(schrittAusZeile);
}

export function holeSchritt(db: Datenbank, laufNr: number, schluessel: string): ProtokollEintrag | null {
  const zeile = db.prepare(`SELECT * FROM workflow_schritte WHERE lauf_nr = ? AND schluessel = ?`).get(laufNr, schluessel) as SchrittZeile | undefined;
  return zeile ? schrittAusZeile(zeile) : null;
}

/**
 * Der Schritt beginnt. Gab es ihn an dieser Stelle schon (Fortsetzen), wird die Zeile neu belegt und
 * behält ihren Platz in der Reihenfolge.
 */
export function beginneSchritt(
  db: Datenbank,
  laufNr: number,
  schluessel: string,
  schritt: { id: string; art: WorkflowSchritt["art"]; titel: string },
  durchlauf: string,
  tiefe: number,
): void {
  db.prepare(
    `INSERT INTO workflow_schritte (lauf_nr, schluessel, schritt_id, art, titel, durchlauf, tiefe, status, gestartet_am)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'laeuft', ?)
     ON CONFLICT (lauf_nr, schluessel) DO UPDATE SET status = 'laeuft', eingabe = NULL, ergebnis = NULL, meldung = NULL,
       aufgabe_id = NULL, postfach_nr = NULL, gestartet_am = excluded.gestartet_am, beendet_am = NULL`,
  ).run(laufNr, schluessel, schritt.id, schritt.art, schritt.titel, durchlauf, tiefe, new Date().toISOString());
}

/** Ergänzt, was während des Schritts bekannt wird (Eingabe, Aufgabe des KI-Schritts, Postfach-Eintrag). */
export function vermerkeImSchritt(
  db: Datenbank,
  laufNr: number,
  schluessel: string,
  angaben: { eingabe?: unknown; aufgabeId?: string; postfachNr?: number; status?: SchrittStatus; meldung?: string },
): void {
  const { eingabe, aufgabeId, postfachNr, status, meldung } = angaben;
  db.prepare(
    `UPDATE workflow_schritte SET eingabe = COALESCE(?, eingabe), aufgabe_id = COALESCE(?, aufgabe_id),
       postfach_nr = COALESCE(?, postfach_nr), status = COALESCE(?, status), meldung = COALESCE(?, meldung)
     WHERE lauf_nr = ? AND schluessel = ?`,
  ).run(
    eingabe === undefined ? null : JSON.stringify(eingabe),
    aufgabeId ?? null,
    postfachNr ?? null,
    status ?? null,
    meldung ?? null,
    laufNr,
    schluessel,
  );
}

export function beendeSchritt(db: Datenbank, laufNr: number, schluessel: string, status: SchrittStatus, ergebnis: unknown, meldung: string | null): void {
  db.prepare(`UPDATE workflow_schritte SET status = ?, ergebnis = ?, meldung = COALESCE(?, meldung), beendet_am = ? WHERE lauf_nr = ? AND schluessel = ?`).run(
    status,
    ergebnis === undefined ? null : JSON.stringify(ergebnis),
    meldung,
    new Date().toISOString(),
    laufNr,
    schluessel,
  );
}

/** Beim Unterbrechen: Was gerade lief oder wartete, gilt als abgebrochen und wird beim Fortsetzen wiederholt. */
export function brecheOffeneSchritteAb(db: Datenbank, laufNr: number, meldung: string): void {
  db.prepare(`UPDATE workflow_schritte SET status = 'abgebrochen', meldung = ?, beendet_am = ? WHERE lauf_nr = ? AND status IN ('laeuft', 'wartet')`).run(
    meldung,
    new Date().toISOString(),
    laufNr,
  );
}
