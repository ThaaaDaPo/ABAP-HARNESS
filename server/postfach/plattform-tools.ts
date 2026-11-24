// Eigene Tools der App, die jeder Agent bekommt. Sie gehören zum Postfach:
// - rueckfrage_stellen:   stellt dem Nutzer eine Frage, der Agent hört danach auf (E-47).
//                         Im Chat antwortet David direkt, bei Workflows über das Postfach.
// - auf_freigabe_warten:  der Agent braucht das Ergebnis eines Vorschlags und pausiert die Aufgabe (E-45)
// Beide Laufzeiten (Copilot und Simulation) rufen dieselben Funktionen auf.
// Absichtlich nicht das eingebaute ask_user von Copilot: Dabei wartet der Agent auf die Antwort,
// statt aufzuhören und mit einer anderen Aufgabe weiterzumachen.
import type { Ereignis } from "../../gemeinsam/typen.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import * as postfach from "../datenbank/postfach.ts";

export interface PlattformTool {
  name: string;
  beschreibung: string;
  /** JSON-Schema der Argumente */
  parameter: Record<string, unknown>;
  /** Gibt den Text zurück, den der Agent als Ergebnis bekommt. */
  fuehreAus(argumente: any): string;
}

export interface PlattformKontext {
  db: Datenbank;
  aufgabeId: string;
  melde: (ereignis: Ereignis) => void;
}

export function erstellePlattformTools(kontext: PlattformKontext): PlattformTool[] {
  return [rueckfrageStellen(kontext), aufFreigabeWarten(kontext)];
}

function rueckfrageStellen({ db, aufgabeId, melde }: PlattformKontext): PlattformTool {
  return {
    name: "rueckfrage_stellen",
    beschreibung:
      "Stellt dem Nutzer eine Rückfrage. Nur für Fragen, an denen das Ergebnis wesentlich hängt " +
      "und die du nicht selbst klären kannst. Mehrere Fragen in einer Rückfrage bündeln. " +
      "Danach die Antwort beenden: Du wirst mit der Antwort des Nutzers fortgesetzt.",
    parameter: {
      type: "object",
      properties: { frage: { type: "string", description: "Die Frage, mit dem nötigen Zusammenhang, damit sie ohne den Chat verständlich ist" } },
      required: ["frage"],
    },
    fuehreAus(argumente) {
      const frage = String(argumente?.frage ?? "").trim();
      if (!frage) return "Fehler: Die Rückfrage ist leer.";
      const nr = postfach.legeAb(db, { aufgabeId, art: "rueckfrage", server: "", tool: "rueckfrage_stellen", argumente: { frage } });
      melde({ art: "postfach", postfachNr: nr, eintragsArt: "rueckfrage", toolName: "rueckfrage_stellen" });
      return `Rückfrage #${nr} ist gestellt. Beende jetzt deine Antwort ohne weitere Schritte; du wirst mit der Antwort fortgesetzt.`;
    },
  };
}

function aufFreigabeWarten({ db, aufgabeId }: PlattformKontext): PlattformTool {
  return {
    name: "auf_freigabe_warten",
    beschreibung:
      "Pausiert die Aufgabe, bis ein Vorschlag freigegeben ist. Nur aufrufen, wenn du das Ergebnis " +
      "des Vorschlags brauchst, um weiterzumachen. Danach die Antwort beenden: Nach der Freigabe wirst du mit " +
      "dem Ergebnis fortgesetzt. Ist die Aufgabe mit dem Vorschlag erledigt, dieses Tool NICHT aufrufen.",
    parameter: {
      type: "object",
      properties: { vorschlag: { type: "number", description: "Nummer des Vorschlags. Ohne Angabe: der zuletzt abgelegte." } },
    },
    fuehreAus(argumente) {
      const nr = argumente?.vorschlag ? Number(argumente.vorschlag) : postfach.letzterOffenerVorschlag(db, aufgabeId);
      const eintrag = nr ? postfach.holeEintrag(db, nr) : null;
      if (!eintrag || eintrag.aufgabeId !== aufgabeId || eintrag.art !== "freigabe") {
        return `Fehler: In dieser Aufgabe gibt es keinen Vorschlag${nr ? ` #${nr}` : ""}.`;
      }
      if (!postfach.offeneStatus.includes(eintrag.status)) {
        return `Vorschlag #${eintrag.nr} ist schon erledigt (${eintrag.status}). Du musst nicht darauf warten.`;
      }
      postfach.setzeWeiterNachFreigabe(db, eintrag.nr);
      return `Die Aufgabe ist pausiert, bis Vorschlag #${eintrag.nr} freigegeben ist. Beende jetzt deine Antwort; du wirst mit dem Ergebnis fortgesetzt.`;
    },
  };
}
