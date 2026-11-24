// Eigene Tools der App, die jeder Agent bekommt. Sie gehören zum Postfach:
// - rueckfrage_stellen:   stellt dem Nutzer eine Frage (E-47). Im Chat wartet der Aufruf auf
//                         Davids Antwort und liefert sie als Ergebnis (E-54). Ohne David
//                         (Workflow) hört der Agent auf und wird mit der Antwort fortgesetzt.
// - auf_freigabe_warten:  nur ohne David: der Agent braucht das Ergebnis eines Vorschlags und
//                         pausiert die Aufgabe (E-45). Im Chat wartet schon der Tool-Aufruf selbst.
// Beide Laufzeiten (Copilot und Simulation) rufen dieselben Funktionen auf.
import type { Ereignis } from "../../gemeinsam/typen.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import * as postfach from "../datenbank/postfach.ts";
import type { NutzerEntscheidung } from "./entscheidungen.ts";

export interface PlattformTool {
  name: string;
  beschreibung: string;
  /** JSON-Schema der Argumente */
  parameter: Record<string, unknown>;
  /** Gibt den Text zurück, den der Agent als Ergebnis bekommt. */
  fuehreAus(argumente: any): string | Promise<string>;
}

export interface PlattformKontext {
  db: Datenbank;
  aufgabeId: string;
  melde: (ereignis: Ereignis) => void;
  /** Nur im Chat: wartet auf Davids Antwort. */
  warteAufNutzer?: (nr: number) => Promise<NutzerEntscheidung>;
}

export function erstellePlattformTools(kontext: PlattformKontext): PlattformTool[] {
  if (kontext.warteAufNutzer) return [rueckfrageStellen(kontext)];
  return [rueckfrageStellen(kontext), aufFreigabeWarten(kontext)];
}

function rueckfrageStellen({ db, aufgabeId, melde, warteAufNutzer }: PlattformKontext): PlattformTool {
  return {
    name: "rueckfrage_stellen",
    beschreibung:
      "Stellt dem Nutzer eine Rückfrage. Nur für Fragen, an denen das Ergebnis wesentlich hängt " +
      "und die du nicht selbst klären kannst. Mehrere Fragen in einer Rückfrage bündeln. " +
      (warteAufNutzer
        ? "Das Tool wartet, bis der Nutzer geantwortet hat, und liefert seine Antwort."
        : "Danach die Antwort beenden: Du wirst mit der Antwort des Nutzers fortgesetzt."),
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
      if (!warteAufNutzer) {
        return `Rückfrage #${nr} ist gestellt. Beende jetzt deine Antwort ohne weitere Schritte; du wirst mit der Antwort fortgesetzt.`;
      }
      return warteAufNutzer(nr).then((entscheidung) =>
        entscheidung.art === "antwort"
          ? `Antwort des Nutzers:\n${entscheidung.text}`
          : "Der Nutzer hat die Rückfrage verworfen. Die Aufgabe ist abgebrochen.",
      );
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
