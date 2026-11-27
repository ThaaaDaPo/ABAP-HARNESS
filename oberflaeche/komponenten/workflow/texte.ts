// Anzeigetexte und Vorlagen rund um Workflows – an einer Stelle, damit Editor, Lauf-Ansicht und
// Chat-Karte dieselben Wörter benutzen.
import type { LaufAusloeser, LaufStatus, SchrittArt, SchrittRegel, SchrittStatus, Vergleich, WertTyp, WorkflowSchritt } from "../../../gemeinsam/typen.ts";

export const laufStatusText: Record<LaufStatus, string> = {
  laeuft: "läuft",
  wartet: "wartet auf dich",
  erfolgreich: "erfolgreich",
  fehlgeschlagen: "fehlgeschlagen",
  abgebrochen: "abgebrochen",
  unterbrochen: "unterbrochen",
};

export const schrittStatusText: Record<SchrittStatus, string> = {
  laeuft: "läuft",
  wartet: "wartet",
  fertig: "fertig",
  fehler: "Fehler",
  abgebrochen: "abgebrochen",
};

export const ausloeserText: Record<LaufAusloeser, string> = {
  manuell: "manuell",
  agent: "durch Agent",
  zeitplan: "Zeitplan",
  workflow: "aus Workflow",
};

export const artText: Record<SchrittArt, string> = {
  tool: "Tool",
  ki: "KI",
  wenn: "Wenn",
  fuer_jedes: "Für jedes",
  setzen: "Variable setzen",
  workflow: "Workflow",
  beenden: "Beenden",
};

/** Kurze Erklärung im Menü „Schritt hinzufügen“ */
export const artErklaerung: Record<SchrittArt, string> = {
  tool: "MCP-Tool fest aufrufen, ohne KI",
  ki: "Agent bearbeitet einen Auftrag",
  wenn: "Bedingung: dann / sonst",
  fuer_jedes: "Schleife über eine Liste",
  setzen: "Variable mit Text oder Wert belegen",
  workflow: "Anderen Workflow ausführen",
  beenden: "Lauf vorzeitig erfolgreich beenden",
};

export const regelText: Record<SchrittRegel, string> = {
  erlauben: "Erlauben",
  melden: "Erlauben + melden",
  freigabe: "Freigabe nötig",
};

export const wertTypText: Record<WertTyp, string> = { text: "Text", zahl: "Zahl", ja_nein: "ja/nein", liste: "Liste" };

export const vergleichText: Record<Vergleich, string> = {
  gleich: "ist gleich",
  ungleich: "ist ungleich",
  enthaelt: "enthält",
  groesser: "ist größer als",
  kleiner: "ist kleiner als",
  leer: "ist leer",
  nicht_leer: "ist nicht leer",
  wahr: "ist ja",
  falsch: "ist nein",
};

/** Vergleiche ohne rechte Seite */
export const ohneRechts: Vergleich[] = ["leer", "nicht_leer", "wahr", "falsch"];

/** Montag zuerst; die Zahl ist der Wochentag wie in JavaScript (0 = Sonntag) */
export const wochentage: { tag: number; kurz: string }[] = [
  { tag: 1, kurz: "Mo" },
  { tag: 2, kurz: "Di" },
  { tag: 3, kurz: "Mi" },
  { tag: 4, kurz: "Do" },
  { tag: 5, kurz: "Fr" },
  { tag: 6, kurz: "Sa" },
  { tag: 0, kurz: "So" },
];

/** Eindeutige Kennung für einen neuen Schritt */
function neueId(art: SchrittArt): string {
  return `${art}_${Math.random().toString(36).slice(2, 8)}`;
}

export function neuerSchritt(art: SchrittArt): WorkflowSchritt {
  const basis = { id: neueId(art), titel: "" };
  switch (art) {
    case "tool":
      return { ...basis, art, server: "", tool: "", argumente: {}, regel: "freigabe", ergebnis: "", beiFehler: "abbrechen" };
    case "ki":
      return { ...basis, art, agentId: "standard", auftrag: "", felder: [], ergebnis: "" };
    case "wenn":
      return { ...basis, art, bedingung: { links: "", vergleich: "gleich", rechts: "" }, dann: [], sonst: [] };
    case "fuer_jedes":
      return { ...basis, art, liste: "", als: "eintrag", hoechstens: 20, schritte: [] };
    case "setzen":
      return { ...basis, art, name: "", wert: "" };
    case "workflow":
      return { ...basis, art, workflowId: "", eingaben: {}, ergebnis: "" };
    case "beenden":
      return { ...basis, art, ergebnis: "" };
  }
}

/** Alle Variablennamen, die im Workflow entstehen – als Hilfe beim Schreiben von Platzhaltern. */
export function variablenNamen(schritte: WorkflowSchritt[]): string[] {
  const namen: string[] = [];
  for (const s of schritte) {
    if ((s.art === "tool" || s.art === "ki" || s.art === "workflow") && s.ergebnis) namen.push(s.ergebnis);
    if (s.art === "setzen" && s.name) namen.push(s.name);
    if (s.art === "fuer_jedes") namen.push(s.als, `${s.als}_nr`, ...variablenNamen(s.schritte));
    if (s.art === "wenn") namen.push(...variablenNamen(s.dann), ...variablenNamen(s.sonst));
  }
  return [...new Set(namen)];
}
