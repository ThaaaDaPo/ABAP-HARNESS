// Postfach-Einträge ablegen. In Schritt 2 legt nur das Tool-Gateway ab;
// Anzeige, Freigeben, Antworten und Verwerfen kommen in Schritt 3.
import type { PostfachArt } from "../../gemeinsam/typen.ts";
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
