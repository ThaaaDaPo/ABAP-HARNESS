// Das Tool ergebnis_melden für KI-Schritte mit festen Ergebnisfeldern. Damit liefert der Agent sein
// Ergebnis in genau der Form, mit der die nächsten Schritte arbeiten können (z. B. umsetzbar: ja/nein).
// Die App prüft jedes Feld; stimmt etwas nicht, bekommt der Agent den Fehler und meldet erneut.
// Das funktioniert mit jedem Modell, auch ohne eingebaute „strukturierte Ausgabe“.
import type { ErgebnisFeld, WertTyp } from "../../gemeinsam/typen.ts";
import type { PlattformTool } from "../postfach/plattform-tools.ts";
import { wandle } from "./ausdruecke.ts";

export const ergebnisToolName = "ergebnis_melden";

/** Hier landet das geprüfte Ergebnis. `wert` bleibt undefined, solange nichts gültig gemeldet wurde. */
export interface ErgebnisAblage {
  felder: ErgebnisFeld[];
  wert?: Record<string, unknown>;
}

const jsonTypen: Record<WertTyp, object> = {
  text: { type: "string" },
  zahl: { type: "number" },
  ja_nein: { type: "boolean" },
  liste: { type: "array", items: {} },
};

/** Was der Agent am Ende seines Auftrags liest. */
export function ergebnisHinweis(felder: ErgebnisFeld[]): string {
  const liste = felder.map((f) => `- ${f.name} (${f.typ}): ${f.beschreibung || "–"}`).join("\n");
  return `Melde dein Ergebnis zum Schluss mit dem Tool ${ergebnisToolName}. Felder:\n${liste}`;
}

/** Prüft die Felder und wandelt sie in den richtigen Typ (z. B. "ja" → true). */
export function pruefeErgebnis(felder: ErgebnisFeld[], roh: unknown): { wert: Record<string, unknown> } | { fehler: string } {
  const eingang = roh && typeof roh === "object" ? (roh as Record<string, unknown>) : {};
  const wert: Record<string, unknown> = {};
  const fehler: string[] = [];
  for (const feld of felder) {
    if (eingang[feld.name] === undefined || eingang[feld.name] === null) {
      fehler.push(`Das Feld ${feld.name} fehlt.`);
      continue;
    }
    try {
      wert[feld.name] = wandle(eingang[feld.name], feld.typ, `Das Feld ${feld.name}`);
    } catch (f) {
      fehler.push((f as Error).message);
    }
  }
  return fehler.length > 0 ? { fehler: fehler.join(" ") } : { wert };
}

export function erstelleErgebnisTool(ablage: ErgebnisAblage): PlattformTool {
  return {
    name: ergebnisToolName,
    beschreibung:
      "Meldet das Ergebnis dieses Arbeitsschritts an den Workflow. Am Ende genau einmal aufrufen, mit allen Feldern. " +
      "Danach ist der Schritt erledigt; es braucht keinen weiteren Text.",
    parameter: {
      type: "object",
      properties: Object.fromEntries(ablage.felder.map((f) => [f.name, { ...jsonTypen[f.typ], description: f.beschreibung }])),
      required: ablage.felder.map((f) => f.name),
    },
    fuehreAus(argumente) {
      const geprueft = pruefeErgebnis(ablage.felder, argumente);
      if ("fehler" in geprueft) return `Fehler: ${geprueft.fehler} Bitte ${ergebnisToolName} mit korrigierten Feldern erneut aufrufen.`;
      ablage.wert = geprueft.wert;
      return "Ergebnis übernommen. Der Schritt ist erledigt.";
    },
  };
}
