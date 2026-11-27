// Die Agenten-Laufzeit ist austauschbar: echtes Copilot oder Simulation (Drehbuch).
// Der Rest der App kennt nur diese Schnittstelle und weiß nicht, welche gerade läuft.
import type { Ereignis, ModellInfo, ModellWahl } from "../../gemeinsam/typen.ts";
import type { GespeicherterServer } from "../datenbank/mcp-server.ts";
import type { Einstellungen } from "../einstellungen.ts";
import type { ToolGateway } from "../gateway/gateway.ts";
import type { McpAufrufer } from "../mcp/mcp-aufrufer.ts";
import type { PlattformTool } from "../postfach/plattform-tools.ts";

export interface SitzungsEinstellungen {
  /** Name des Agenten, nur zur Anzeige (Simulation) */
  agentName: string;
  /** Systemprompt: Auftrag des Agenten, dahinter die zugeordneten Instructions. */
  auftrag: string;
  /** Leer = automatische Auswahl. */
  modell: string;
  /** Thinking Effort; leer = Standard des Modells */
  denkaufwand: string;
  kontext: ModellWahl["kontext"];
  workspaceOrdner: string;
  /** Die MCP-Server, die der Agent benutzen kann. */
  mcpServer: GespeicherterServer[];
  /** Entscheidet bei jedem MCP-Aufruf nach den eingestellten Regeln. Muss jede Laufzeit fragen. */
  gateway: ToolGateway;
  /** Eigene Tools der App (Rückfrage stellen, auf Freigabe warten). */
  plattformTools: PlattformTool[];
  /** Ordner, in denen Skill-Ordner (mit SKILL.md) liegen */
  skillOrdner: string[];
  /** Namen der Skills, die dieser Agent nicht benutzen soll (nicht zugeordnet) */
  abgeschalteteSkills: string[];
  /**
   * Freigaben und Rückfragen warten im Aufruf auf David (E-54) – im Chat und in KI-Schritten von
   * Workflows. Sonst (alte Aufgaben ohne Lauf) wird der Vorschlag abgelegt und der Agent arbeitet weiter.
   */
  wartetImAufruf: boolean;
  /**
   * Voice Agent: nur reden. Keine Tools, keine MCP-Server, keine Skills; der Auftrag ersetzt den
   * Systemprompt von Copilot ganz (kürzer = schnellere Antwort, und er ist aufs Programmieren ausgelegt).
   */
  nurGespraech?: boolean;
}

/** Bekommt jedes Ereignis der Sitzung, sobald es passiert. */
export type EreignisEmpfaenger = (ereignis: Ereignis) => void;

export interface AgentenSitzung {
  /** Damit lässt sich die Sitzung später fortsetzen. */
  readonly id: string;
  /** Schickt eine Nachricht und kehrt zurück, wenn der Agent fertig ist. */
  sende(text: string): Promise<void>;
  abbrechen(): Promise<void>;
  /** Gibt die Sitzung im Speicher frei. Sie bleibt gespeichert und kann fortgesetzt werden. */
  trennen(): Promise<void>;
}

export interface AgentenLaufzeit {
  readonly name: "simulation" | "copilot";
  starte(einstellungen: SitzungsEinstellungen, empfaenger: EreignisEmpfaenger): Promise<AgentenSitzung>;
  setzeFort(sitzungId: string, einstellungen: SitzungsEinstellungen, empfaenger: EreignisEmpfaenger): Promise<AgentenSitzung>;
  /** Löscht die gespeicherte Sitzung endgültig (Chat gelöscht). */
  loescheSitzung(sitzungId: string): Promise<void>;
  /** Die Modelle, die zur Wahl stehen. Kann leer sein (dann nur automatische Auswahl). */
  modelle(): Promise<ModellInfo[]>;
  /** Für die Einrichtungsseite: Ist die Laufzeit angemeldet? null = nicht nötig (Simulation). */
  anmeldung(): Promise<{ angemeldet: boolean | null; text: string }>;
  beenden(): Promise<void>;
}

export async function erstelleLaufzeit(einstellungen: Einstellungen, aufrufer: McpAufrufer): Promise<AgentenLaufzeit> {
  // Copilot wird nur geladen, wenn es gebraucht wird.
  if (einstellungen.modus === "copilot") {
    const { CopilotLaufzeit } = await import("./copilot/copilot.ts");
    return new CopilotLaufzeit();
  }
  const { SimulationsLaufzeit } = await import("./simulation/simulation.ts");
  return new SimulationsLaufzeit(aufrufer);
}
