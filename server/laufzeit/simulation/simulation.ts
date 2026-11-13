// Simulierte Laufzeit: spielt das Drehbuch ab statt ein echtes Modell zu fragen.
// Damit lässt sich die ganze App ohne Copilot entwickeln und testen.
import { randomUUID } from "node:crypto";
import type { AgentenLaufzeit, AgentenSitzung, EreignisEmpfaenger } from "../laufzeit.ts";
import { findeSchritte } from "./drehbuch.ts";

const pause = (ms: number) => new Promise((fertig) => setTimeout(fertig, ms));

class SimulationsSitzung implements AgentenSitzung {
  readonly id: string;
  private empfaenger: EreignisEmpfaenger;
  private abgebrochen = false;

  constructor(id: string, empfaenger: EreignisEmpfaenger) {
    this.id = id;
    this.empfaenger = empfaenger;
  }

  async sende(text: string): Promise<void> {
    this.abgebrochen = false;
    for (const schritt of findeSchritte(text)) {
      if (this.abgebrochen) return;

      if ("warten" in schritt) {
        await this.warte(schritt.warten);
      } else if ("tool" in schritt) {
        const aufrufId = randomUUID();
        this.empfaenger({ art: "tool_start", aufrufId, toolName: schritt.tool, argumente: schritt.argumente });
        await pause(600);
        this.empfaenger({
          art: "tool_ende",
          aufrufId,
          erfolgreich: !schritt.fehlgeschlagen,
          ergebnis: schritt.ergebnis,
        });
      } else {
        await this.schreibe(schritt.text.replace("{eingabe}", text));
      }
    }
  }

  /** Gibt den Text Wort für Wort aus, wie ein echtes Modell beim Streamen. */
  private async schreibe(text: string): Promise<void> {
    for (const wort of text.split(/(?<=\s)/)) {
      if (this.abgebrochen) return;
      this.empfaenger({ art: "agent_schreibt", textTeil: wort });
      await pause(25);
    }
    this.empfaenger({ art: "agent_nachricht", text });
  }

  /** Wartet, lässt sich aber durch Abbrechen unterbrechen. */
  private async warte(ms: number): Promise<void> {
    const ende = Date.now() + ms;
    while (Date.now() < ende && !this.abgebrochen) await pause(100);
  }

  async abbrechen(): Promise<void> {
    this.abgebrochen = true;
  }

  async trennen(): Promise<void> {}
}

export class SimulationsLaufzeit implements AgentenLaufzeit {
  readonly name = "simulation";

  async starte(_einstellungen: unknown, empfaenger: EreignisEmpfaenger): Promise<AgentenSitzung> {
    return new SimulationsSitzung(randomUUID(), empfaenger);
  }

  async setzeFort(sitzungId: string, _einstellungen: unknown, empfaenger: EreignisEmpfaenger): Promise<AgentenSitzung> {
    return new SimulationsSitzung(sitzungId, empfaenger);
  }

  async beenden(): Promise<void> {}
}
