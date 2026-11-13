// Die Agenten-Laufzeit ist austauschbar: echtes Copilot oder Simulation (Drehbuch).
// Der Rest der App kennt nur diese Schnittstelle und weiß nicht, welche gerade läuft.
import type { Ereignis } from "../../gemeinsam/typen.ts";
import type { Einstellungen } from "../einstellungen.ts";

export interface SitzungsEinstellungen {
  /** Systemprompt: wer der Agent ist und wie er arbeiten soll. */
  auftrag: string;
  /** Leer = automatische Auswahl. */
  modell: string;
  workspaceOrdner: string;
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
  beenden(): Promise<void>;
}

export async function erstelleLaufzeit(einstellungen: Einstellungen): Promise<AgentenLaufzeit> {
  // Copilot wird nur geladen, wenn es gebraucht wird.
  if (einstellungen.modus === "copilot") {
    const { CopilotLaufzeit } = await import("./copilot/copilot.ts");
    return new CopilotLaufzeit();
  }
  const { SimulationsLaufzeit } = await import("./simulation/simulation.ts");
  return new SimulationsLaufzeit();
}
