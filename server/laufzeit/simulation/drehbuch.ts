// Das Drehbuch legt fest, wie der simulierte Agent auf eine Nachricht reagiert.
// Es steht in drehbuch.json und kann ohne Code-Änderung erweitert werden.
import fs from "node:fs";
import path from "node:path";

export type DrehbuchSchritt =
  | { text: string }
  /**
   * Tool-Aufruf. Gehört das Tool zu einem eingetragenen MCP-Server ("<server>-<tool>"), entscheidet
   * das Gateway und der Server liefert das Ergebnis. Sonst gelten ergebnis und fehlgeschlagen.
   */
  | { tool: string; argumente: unknown; ergebnis?: string; fehlgeschlagen?: boolean }
  | { warten: number };

interface DrehbuchEintrag {
  beschreibung: string;
  /** Passt, wenn die Nachricht eines dieser Wörter enthält. Leer = passt immer (Standard). */
  wennEnthaelt: string[];
  schritte: DrehbuchSchritt[];
}

const datei = path.join(import.meta.dirname, "drehbuch.json");

export function findeSchritte(nachricht: string): DrehbuchSchritt[] {
  // Bei jedem Aufruf neu lesen, damit Änderungen am Drehbuch sofort wirken.
  const eintraege: DrehbuchEintrag[] = JSON.parse(fs.readFileSync(datei, "utf8"));
  const klein = nachricht.toLowerCase();
  const passend =
    eintraege.find((e) => e.wennEnthaelt.some((wort) => klein.includes(wort.toLowerCase()))) ??
    eintraege.find((e) => e.wennEnthaelt.length === 0);
  return passend?.schritte ?? [{ text: "(Das Drehbuch hat keinen passenden Eintrag.)" }];
}
