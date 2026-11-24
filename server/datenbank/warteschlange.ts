// Warteschlange des Agenten: Arbeit, die ansteht, während er mit etwas anderem beschäftigt ist.
// Ein Agent arbeitet immer nur an einer Aufgabe; der Rest wartet hier der Reihe nach.
import type { Datenbank } from "./datenbank.ts";
import { hatBlockierendeEintraege } from "./postfach.ts";

interface Zeile {
  nr: number;
  aufgabe_id: string;
  text: string;
  aus_postfach: number;
}

/**
 * aus Postfach: Fortsetzung nach einer Postfach-Aktion. Die wartet, bis alle Freigaben und
 * Rückfragen erledigt sind, auf die der Agent wartet. Nachrichten aus dem Chat warten darauf nicht.
 */
export function reiheEin(db: Datenbank, aufgabeId: string, text: string, ausPostfach: boolean): void {
  db.prepare(`INSERT INTO warteschlange (aufgabe_id, text, aus_postfach, erstellt_am) VALUES (?, ?, ?, ?)`).run(
    aufgabeId,
    text,
    ausPostfach ? 1 : 0,
    new Date().toISOString(),
  );
}

function zeilenDer(db: Datenbank, aufgabeId: string): Zeile[] {
  return db.prepare(`SELECT nr, aufgabe_id, text, aus_postfach FROM warteschlange WHERE aufgabe_id = ? ORDER BY nr`).all(aufgabeId) as unknown as Zeile[];
}

/** Liegt für die Aufgabe etwas in der Warteschlange, das jetzt drankommen darf? */
function kannWeiter(db: Datenbank, zeilen: Zeile[]): boolean {
  if (zeilen.length === 0) return false;
  return zeilen.some((z) => z.aus_postfach === 0) || !hatBlockierendeEintraege(db, zeilen[0].aufgabe_id);
}

/** Die Aufgabe ist eingereiht und kommt dran, sobald der Agent frei ist. */
export function stehtAn(db: Datenbank, aufgabeId: string): boolean {
  return kannWeiter(db, zeilenDer(db, aufgabeId));
}

export function entferne(db: Datenbank, aufgabeId: string): void {
  db.prepare(`DELETE FROM warteschlange WHERE aufgabe_id = ?`).run(aufgabeId);
}

/**
 * Nimmt die nächste Aufgabe, die jetzt weitergehen kann, aus der Warteschlange – mit allem, was
 * für sie ansteht, zu einer Nachricht zusammengefasst. So bekommt der Agent z. B. die Ergebnisse
 * von zwei Freigaben in einem Lauf statt in zweien. Null, wenn nichts ansteht.
 */
export function nimmNaechste(db: Datenbank): { aufgabeId: string; text: string } | null {
  const zeilen = db.prepare(`SELECT nr, aufgabe_id, text, aus_postfach FROM warteschlange ORDER BY nr`).all() as unknown as Zeile[];

  const geprueft = new Set<string>();
  for (const zeile of zeilen) {
    if (geprueft.has(zeile.aufgabe_id)) continue;
    geprueft.add(zeile.aufgabe_id);

    const eigene = zeilen.filter((z) => z.aufgabe_id === zeile.aufgabe_id);
    if (!kannWeiter(db, eigene)) continue;

    entferne(db, zeile.aufgabe_id);
    return { aufgabeId: zeile.aufgabe_id, text: eigene.map((z) => z.text).join("\n\n") };
  }
  return null;
}
