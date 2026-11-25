// Liest den Kopf (Frontmatter) einer Markdown-Datei:
//
//   ---
//   applyTo: "**/*.abap"
//   description: Regeln für ABAP-Klassen
//   ---
//   Inhalt …
//
// Bewusst nur einfache Zeilen "schlüssel: wert" – mehr brauchen Instructions und Skills nicht, und
// ein YAML-Paket wäre eine Abhängigkeit mehr. Mehrzeilige Werte werden nicht ausgewertet.

export interface MarkdownMitKopf {
  kopf: Record<string, string>;
  /** Der Text ohne Kopf */
  inhalt: string;
}

const kopfMuster = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export function leseFrontmatter(text: string): MarkdownMitKopf {
  // Ein BOM am Anfang (Windows-Editoren) würde den Kopf verdecken.
  const ohneBom = text.replace(/^﻿/, "");
  const treffer = ohneBom.match(kopfMuster);
  if (!treffer) return { kopf: {}, inhalt: ohneBom };

  const kopf: Record<string, string> = {};
  for (const zeile of treffer[1].split(/\r?\n/)) {
    const teile = zeile.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (teile) kopf[teile[1]] = ohneAnfuehrungszeichen(teile[2].trim());
  }
  return { kopf, inhalt: ohneBom.slice(treffer[0].length) };
}

function ohneAnfuehrungszeichen(wert: string): string {
  const erstes = wert[0];
  if ((erstes === '"' || erstes === "'") && wert.endsWith(erstes) && wert.length >= 2) return wert.slice(1, -1);
  return wert;
}
