// Verbrauch je Modellaufruf speichern und zusammenzählen (V-14, ohne Limit – E-60).
import type { ModellAufrufVerbrauch, VerbrauchSumme, VerbrauchUebersicht } from "../../gemeinsam/typen.ts";
import type { Datenbank } from "./datenbank.ts";

export interface VerbrauchsZeile extends ModellAufrufVerbrauch {
  aufgabeId: string;
  agentId: string;
  /** Kennung des Laufs: alle Modellaufrufe zu einer Nachricht */
  lauf: string;
}

export function speichereVerbrauch(db: Datenbank, zeile: VerbrauchsZeile): void {
  db.prepare(
    `INSERT INTO verbrauch (aufgabe_id, agent_id, lauf, modell, eingabe_tokens, ausgabe_tokens, cache_tokens, nano_aiu, kostenfaktor, zeitpunkt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    zeile.aufgabeId,
    zeile.agentId,
    zeile.lauf,
    zeile.modell,
    zeile.eingabeTokens,
    zeile.ausgabeTokens,
    zeile.cacheTokens,
    zeile.nanoAiu,
    zeile.kostenfaktor,
    new Date().toISOString(),
  );
}

/** SQL für die Summenspalten; passt zu summeAus(). */
const summenSql = `COUNT(*) AS aufrufe, SUM(eingabe_tokens) AS eingabe, SUM(ausgabe_tokens) AS ausgabe,
  SUM(cache_tokens) AS cache, SUM(nano_aiu) AS nano, SUM(nano_aiu IS NULL) AS ohne`;

interface SummenZeile {
  aufrufe: number;
  eingabe: number | null;
  ausgabe: number | null;
  cache: number | null;
  nano: number | null;
  ohne: number | null;
}

function summeAus(zeile: SummenZeile | undefined): VerbrauchSumme {
  return {
    aufrufe: zeile?.aufrufe ?? 0,
    eingabeTokens: zeile?.eingabe ?? 0,
    ausgabeTokens: zeile?.ausgabe ?? 0,
    cacheTokens: zeile?.cache ?? 0,
    nanoAiu: zeile?.nano ?? 0,
    ohneKosten: zeile?.ohne ?? 0,
  };
}

export function summeDesLaufs(db: Datenbank, lauf: string): VerbrauchSumme {
  return summeAus(db.prepare(`SELECT ${summenSql} FROM verbrauch WHERE lauf = ?`).get(lauf) as unknown as SummenZeile);
}

export function summeDerAufgabe(db: Datenbank, aufgabeId: string): VerbrauchSumme {
  return summeAus(db.prepare(`SELECT ${summenSql} FROM verbrauch WHERE aufgabe_id = ?`).get(aufgabeId) as unknown as SummenZeile);
}

/** Alles, was die KI-Schritte eines Workflow-Laufs verbraucht haben (Credit-Limit je Lauf, E-69). */
export function summeDesWorkflowLaufs(db: Datenbank, laufNr: number): VerbrauchSumme {
  return summeAus(
    db
      .prepare(`SELECT ${summenSql} FROM verbrauch WHERE aufgabe_id IN (SELECT id FROM aufgaben WHERE workflow_lauf = ?)`)
      .get(laufNr) as unknown as SummenZeile,
  );
}

/** AI-Credits aus Nano-AI-Units (wie in der Oberfläche, verbrauch-text.ts) */
export function credits(summe: VerbrauchSumme): number {
  return summe.nanoAiu / 1e9;
}

/** Gesamt und aufgeteilt nach Agent, Modell und Monat – für die Seite „Verbrauch“. */
export function verbrauchsUebersicht(db: Datenbank): VerbrauchUebersicht {
  const gruppiert = (spalte: string, von = "verbrauch") =>
    (db.prepare(`SELECT ${spalte} AS name, ${summenSql} FROM ${von} GROUP BY 1 ORDER BY 1`).all() as unknown as (SummenZeile & { name: string })[]).map(
      (zeile) => ({ name: zeile.name, ...summeAus(zeile) }),
    );
  return {
    gesamt: summeAus(db.prepare(`SELECT ${summenSql} FROM verbrauch`).get() as unknown as SummenZeile),
    // Gelöschte Agenten erscheinen mit ihrer Kennung
    jeAgent: gruppiert("COALESCE(a.name, v.agent_id)", "verbrauch v LEFT JOIN agenten a ON a.id = v.agent_id"),
    jeModell: gruppiert("modell"),
    jeMonat: gruppiert("substr(zeitpunkt, 1, 7)").reverse(),
  };
}
