// Das Tool-Gateway entscheidet bei jedem Aufruf eines MCP-Tools nach der Regel, die David
// eingestellt hat: erlauben, melden, freigabe oder verbieten.
// Es weiß nichts von Copilot oder Simulation – beide Laufzeiten fragen es auf dieselbe Weise.
// Die Regeln werden bei jedem Aufruf neu gelesen, damit Änderungen in der App sofort wirken.
//
// Freigabe im Chat (E-54): Der Aufruf wartet, bis David entschieden hat. Gibt er frei, läuft das
// Tool ganz normal und der Agent bekommt das echte Ergebnis.
// Freigabe ohne David (Workflows, später): Der Aufruf wird nicht ausgeführt, sondern als Vorschlag
// abgelegt, und der Agent arbeitet weiter (E-44, E-45).
import type { Ereignis, ToolRegel } from "../../gemeinsam/typen.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import { holeServer } from "../datenbank/mcp-server.ts";
import { legeAb, schliesseAb } from "../datenbank/postfach.ts";
import { regelFuer } from "../datenbank/tool-regeln.ts";
import type { NutzerEntscheidung } from "../postfach/entscheidungen.ts";

/** Bis es die Agentenverwaltung gibt (Schritt 4), gelten alle Regeln für diesen einen Agenten. */
export const standardAgentId = "standard";

/** Welches Tool auf welchem Server gemeint ist. */
export interface ToolAdresse {
  server: string;
  tool: string;
}

export type Entscheidung = { ausfuehren: true } | { ausfuehren: false; grund: string };

/** So heißt ein MCP-Tool zur Laufzeit: "<server>-<tool>", z. B. "jira-ticket_lesen" (Phase 0, C4). */
export function laufzeitName(adresse: ToolAdresse): string {
  return `${adresse.server}-${adresse.tool}`;
}

export interface GatewayKontext {
  db: Datenbank;
  agentId: string;
  aufgabeId: string;
  /** Für die Anzeige im Chat, wenn ein Vorschlag oder eine Meldung entsteht. */
  melde: (ereignis: Ereignis) => void;
  /**
   * Nur im Chat: wartet, bis David über den Vorschlag entschieden hat. Fehlt es (Workflow),
   * wird nicht gewartet, sondern der Vorschlag abgelegt und der Aufruf abgelehnt.
   */
  warteAufNutzer?: (nr: number) => Promise<NutzerEntscheidung>;
}

export class ToolGateway {
  private kontext: GatewayKontext;
  /** Freigegebene Aufrufe, die noch laufen: Aufruf-Id (oder Tool-Name) → Nummer des Vorschlags. */
  private freigegeben = new Map<string, number>();
  /** Je Tool: wie viele freigegebene Aufrufe die Berechtigungsprüfung noch durchlassen darf. */
  private durchlassen = new Map<string, number>();

  constructor(kontext: GatewayKontext) {
    this.kontext = kontext;
  }

  /**
   * Macht aus dem Laufzeit-Namen Server und Tool. Server-Schlüssel enthalten keinen Bindestrich,
   * deshalb trennt der erste Bindestrich eindeutig. Null, wenn kein eingetragener Server passt –
   * dann ist es ein eingebautes Werkzeug von Copilot (Dateien lesen usw.).
   */
  zerlege(toolName: string): ToolAdresse | null {
    const trenner = toolName.indexOf("-");
    if (trenner <= 0) return null;
    const server = toolName.slice(0, trenner);
    if (!holeServer(this.kontext.db, server)) return null;
    return { server, tool: toolName.slice(trenner + 1) };
  }

  regel(adresse: ToolAdresse): ToolRegel {
    // Ein Server, der nicht (mehr) eingetragen ist, hat keine Regeln – also gesperrt.
    if (!holeServer(this.kontext.db, adresse.server)) return "verbieten";
    return regelFuer(this.kontext.db, this.kontext.agentId, adresse.server, adresse.tool);
  }

  /**
   * Läuft vor dem Aufruf. Bei "freigabe" entsteht hier der Vorschlag; im Chat wartet der Aufruf
   * dann auf Davids Entscheidung. `aufrufId` verbindet Vorschlag und Tool-Aufruf in der Anzeige.
   */
  async vorAufruf(adresse: ToolAdresse, argumente: unknown, aufrufId?: string): Promise<Entscheidung> {
    const name = laufzeitName(adresse);
    switch (this.regel(adresse)) {
      case "erlauben":
      case "melden":
        return { ausfuehren: true };

      case "freigabe": {
        const nr = this.legeAb("freigabe", adresse, argumente, undefined, aufrufId);
        const { warteAufNutzer } = this.kontext;
        if (!warteAufNutzer) return { ausfuehren: false, grund: ohneNutzerAbgelegt(nr) };

        const entscheidung = await warteAufNutzer(nr);
        if (entscheidung.art === "freigegeben") {
          this.freigegeben.set(aufrufId ?? name, nr);
          this.durchlassen.set(name, (this.durchlassen.get(name) ?? 0) + 1);
          return { ausfuehren: true };
        }
        if (entscheidung.art === "verworfen") {
          return { ausfuehren: false, grund: `Nicht ausgeführt: Der Nutzer hat Vorschlag #${nr} verworfen. Die Aufgabe ist abgebrochen.` };
        }
        return {
          ausfuehren: false,
          grund:
            `Nicht ausgeführt: Der Nutzer hat Vorschlag #${nr} nicht freigegeben und wünscht Änderungen:\n${entscheidung.text}\n\n` +
            `Rufe das Tool mit entsprechend geänderten Argumenten erneut auf.`,
        };
      }

      case "verbieten":
        return {
          ausfuehren: false,
          grund: `Nicht ausgeführt: Das Tool ${name} ist für diesen Agenten gesperrt. Suche keinen anderen Weg dafür.`,
        };
    }
  }

  /**
   * Läuft nach einem erfolgreichen Aufruf. Bei "melden" entsteht ein Postfach-Eintrag mit dem
   * Ergebnis; bei einem freigegebenen Vorschlag kommt das Ergebnis an den Vorschlag.
   */
  nachAufruf(adresse: ToolAdresse, argumente: unknown, ergebnis: string, aufrufId?: string): void {
    const schluessel = aufrufId ?? laufzeitName(adresse);
    const nr = this.freigegeben.get(schluessel);
    if (nr !== undefined) {
      this.freigegeben.delete(schluessel);
      schliesseAb(this.kontext.db, nr, { status: "freigegeben", ergebnis });
    }
    if (this.regel(adresse) === "melden") this.legeAb("meldung", adresse, argumente, ergebnis);
  }

  /**
   * Für die zweite, unabhängige Sperre (Berechtigungsprüfung): Darf der Aufruf ausgeführt werden?
   * Bei "freigabe" nur, wenn David ihn gerade freigegeben hat – je Freigabe genau einmal.
   */
  darfAusfuehren(adresse: ToolAdresse): boolean {
    const regel = this.regel(adresse);
    if (regel === "erlauben" || regel === "melden") return true;
    if (regel !== "freigabe") return false;
    const name = laufzeitName(adresse);
    const anzahl = this.durchlassen.get(name) ?? 0;
    if (anzahl === 0) return false;
    this.durchlassen.set(name, anzahl - 1);
    return true;
  }

  /**
   * Alle bekannten Tools mit der Regel "verbieten". Sie werden dem Agenten gar nicht erst
   * angeboten – das spart Credits, weil er sie dann nicht ausprobiert.
   */
  verboteneTools(server: { schluessel: string; tools: { name: string }[] }[]): ToolAdresse[] {
    return server.flatMap((s) =>
      s.tools.map((t) => ({ server: s.schluessel, tool: t.name })).filter((adresse) => this.regel(adresse) === "verbieten"),
    );
  }

  private legeAb(art: "freigabe" | "meldung", adresse: ToolAdresse, argumente: unknown, ergebnis?: string, aufrufId?: string): number {
    const nr = legeAb(this.kontext.db, { aufgabeId: this.kontext.aufgabeId, art, ...adresse, argumente, ergebnis });
    this.kontext.melde({
      art: "postfach",
      postfachNr: nr,
      eintragsArt: art,
      toolName: laufzeitName(adresse),
      ...(aufrufId ? { aufrufId } : {}),
    });
    return nr;
  }
}

/** Was der Agent erfährt, wenn niemand auf den Vorschlag wartet (Workflow). */
function ohneNutzerAbgelegt(nr: number): string {
  return (
    `Nicht ausgeführt: Der Aufruf ist als Vorschlag #${nr} abgelegt und wartet auf Freigabe durch den Nutzer. ` +
    `Wiederhole ihn nicht – nach der Freigabe führt die Plattform ihn selbst aus. ` +
    `Ist deine Aufgabe damit erledigt, schließe mit einer kurzen Zusammenfassung ab und nenne Vorschlag #${nr}. ` +
    `Brauchst du das Ergebnis, um weiterzumachen, erledige erst alles, was nicht davon abhängt, ` +
    `rufe dann auf_freigabe_warten mit vorschlag ${nr} auf und beende deine Antwort.`
  );
}
