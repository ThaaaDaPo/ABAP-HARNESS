// Das Tool-Gateway entscheidet bei jedem Aufruf eines MCP-Tools nach der Regel, die David
// eingestellt hat: erlauben, melden, freigabe oder verbieten.
// Es weiß nichts von Copilot oder Simulation – beide Laufzeiten fragen es auf dieselbe Weise.
// Die Regeln werden bei jedem Aufruf neu gelesen, damit Änderungen in der App sofort wirken.
import type { Ereignis, ToolRegel } from "../../gemeinsam/typen.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import { holeServer } from "../datenbank/mcp-server.ts";
import { legeAb } from "../datenbank/postfach.ts";
import { regelFuer } from "../datenbank/tool-regeln.ts";

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
  /** Für den Hinweis im Chat, wenn etwas ins Postfach gelegt wurde. */
  melde: (ereignis: Ereignis) => void;
}

export class ToolGateway {
  private kontext: GatewayKontext;

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
   * Läuft vor dem Aufruf. Bei "freigabe" wird hier der Vorschlag ins Postfach gelegt;
   * der Agent erfährt aus dem Grund, dass er nicht warten, sondern weiterarbeiten soll.
   */
  vorAufruf(adresse: ToolAdresse, argumente: unknown): Entscheidung {
    const name = laufzeitName(adresse);
    switch (this.regel(adresse)) {
      case "erlauben":
      case "melden":
        return { ausfuehren: true };

      case "freigabe": {
        const nr = this.legeAb("freigabe", adresse, argumente);
        return {
          ausfuehren: false,
          grund:
            `Nicht ausgeführt: Der Aufruf liegt als Vorschlag #${nr} im Postfach und wartet auf Freigabe durch den Nutzer. ` +
            `Wiederhole ihn nicht. Arbeite an dem weiter, was nicht davon abhängt, und sage dem Nutzer, dass Vorschlag #${nr} auf Freigabe wartet.`,
        };
      }

      case "verbieten":
        return {
          ausfuehren: false,
          grund: `Nicht ausgeführt: Das Tool ${name} ist für diesen Agenten gesperrt. Suche keinen anderen Weg dafür.`,
        };
    }
  }

  /** Läuft nach einem erfolgreichen Aufruf. Bei "melden" entsteht ein Postfach-Eintrag mit dem Ergebnis. */
  nachAufruf(adresse: ToolAdresse, argumente: unknown, ergebnis: string): void {
    if (this.regel(adresse) === "melden") this.legeAb("meldung", adresse, argumente, ergebnis);
  }

  /** Ohne Nebenwirkung: Darf der Aufruf ausgeführt werden? Für die zweite, unabhängige Sperre. */
  darfAusfuehren(adresse: ToolAdresse): boolean {
    const regel = this.regel(adresse);
    return regel === "erlauben" || regel === "melden";
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

  private legeAb(art: "freigabe" | "meldung", adresse: ToolAdresse, argumente: unknown, ergebnis?: string): number {
    const nr = legeAb(this.kontext.db, { aufgabeId: this.kontext.aufgabeId, art, ...adresse, argumente, ergebnis });
    this.kontext.melde({ art: "postfach", postfachNr: nr, eintragsArt: art, toolName: laufzeitName(adresse) });
    return nr;
  }
}
