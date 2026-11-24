// Die Agenten-Laufzeit ist austauschbar: echtes Copilot oder Simulation (Drehbuch).
// Der Rest der App kennt nur diese Schnittstelle und weiß nicht, welche gerade läuft.
import type { Ereignis, ModellInfo, ModellWahl } from "../../gemeinsam/typen.ts";
import type { GespeicherterServer } from "../datenbank/mcp-server.ts";
import type { Einstellungen } from "../einstellungen.ts";
import type { ToolGateway } from "../gateway/gateway.ts";
import type { McpAufrufer } from "../mcp/mcp-aufrufer.ts";
import type { PlattformTool } from "../postfach/plattform-tools.ts";

export interface SitzungsEinstellungen {
  /** Systemprompt: wer der Agent ist und wie er arbeiten soll. */
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
