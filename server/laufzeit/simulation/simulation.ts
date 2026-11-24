// Simulierte Laufzeit: spielt das Drehbuch ab statt ein echtes Modell zu fragen.
// Damit lässt sich die ganze App ohne Copilot entwickeln und testen.
// Tool-Aufrufe aus dem Drehbuch gehen wie bei Copilot durch das Tool-Gateway und werden,
// wenn es sie erlaubt, wirklich beim eingetragenen MCP-Server ausgeführt. Die Plattform-Tools
// (Rückfrage, auf Freigabe warten) laufen ebenfalls echt.
import { randomUUID } from "node:crypto";
import type { ModellInfo } from "../../../gemeinsam/typen.ts";
import type { McpAufrufer } from "../../mcp/mcp-aufrufer.ts";
import type { AgentenLaufzeit, AgentenSitzung, EreignisEmpfaenger, SitzungsEinstellungen } from "../laufzeit.ts";
import { findeSchritte, type DrehbuchSchritt } from "./drehbuch.ts";

const pause = (ms: number) => new Promise((fertig) => setTimeout(fertig, ms));

type ToolSchritt = Extract<DrehbuchSchritt, { tool: string }>;

/** Zwei Modelle zum Ausprobieren der Modellwahl: eins ohne, eins mit Einstellmöglichkeiten. */
const simulierteModelle: ModellInfo[] = [
  {
    id: "sim-schnell",
    name: "Simulation schnell",
    denkStufen: [],
    standardDenkStufe: null,
    kontextStandard: 128000,
    langerKontext: false,
    kontextLang: null,
    multiplikator: 0,
  },
  {
    id: "sim-gruendlich",
    name: "Simulation gründlich",
    denkStufen: ["low", "medium", "high"],
    standardDenkStufe: "medium",
    kontextStandard: 200000,
    langerKontext: true,
    kontextLang: 1000000,
    multiplikator: 1,
  },
];

class SimulationsSitzung implements AgentenSitzung {
  readonly id: string;
  private einstellungen: SitzungsEinstellungen;
  private empfaenger: EreignisEmpfaenger;
  private aufrufer: McpAufrufer;
  private abgebrochen = false;

  constructor(id: string, einstellungen: SitzungsEinstellungen, empfaenger: EreignisEmpfaenger, aufrufer: McpAufrufer) {
    this.id = id;
    this.einstellungen = einstellungen;
    this.empfaenger = empfaenger;
    this.aufrufer = aufrufer;
  }

  async sende(text: string): Promise<void> {
    this.abgebrochen = false;
    this.empfaenger({ art: "modell", modell: this.einstellungen.modell || "sim-automatisch" });
    for (const schritt of findeSchritte(text)) {
      if (this.abgebrochen) return;

      if ("warten" in schritt) {
        await this.warte(schritt.warten);
      } else if ("tool" in schritt) {
        const aufrufId = randomUUID();
        this.empfaenger({ art: "tool_start", aufrufId, toolName: schritt.tool, argumente: schritt.argumente });
        await pause(300);
        const { erfolgreich, ergebnis } = await this.fuehreAus(schritt);
        this.empfaenger({ art: "tool_ende", aufrufId, erfolgreich, ergebnis });
      } else {
        await this.schreibe(schritt.text.replace("{eingabe}", text).replace("{modell}", this.modellText()));
      }
    }
  }

  /** Damit man in der Simulation sieht, dass die Modellwahl des Chats ankommt. */
  private modellText(): string {
    const { modell, denkaufwand, kontext } = this.einstellungen;
    return [modell || "automatisch", denkaufwand && `Thinking Effort ${denkaufwand}`, kontext === "lang" && "langer Kontext"]
      .filter(Boolean)
      .join(", ");
  }

  /** Fragt das Gateway und ruft das Tool beim MCP-Server auf, wenn es erlaubt ist. */
  private async fuehreAus(schritt: ToolSchritt): Promise<{ erfolgreich: boolean; ergebnis: string }> {
    const { gateway, mcpServer, plattformTools } = this.einstellungen;

    const plattformTool = plattformTools.find((t) => t.name === schritt.tool);
    if (plattformTool) return { erfolgreich: true, ergebnis: plattformTool.fuehreAus(schritt.argumente ?? {}) };

    const adresse = gateway.zerlege(schritt.tool);

    // Kein MCP-Tool eines eingetragenen Servers: das Ergebnis steht im Drehbuch.
    if (!adresse) return { erfolgreich: !schritt.fehlgeschlagen, ergebnis: schritt.ergebnis ?? "" };

    const entscheidung = gateway.vorAufruf(adresse, schritt.argumente);
    if (!entscheidung.ausfuehren) return { erfolgreich: false, ergebnis: entscheidung.grund };

    try {
      const server = mcpServer.find((s) => s.schluessel === adresse.server);
      if (!server) throw new Error(`Server ${adresse.server} war beim Start der Sitzung nicht eingetragen.`);
      const antwort = await this.aufrufer.rufeAuf(server, adresse.tool, schritt.argumente);
      if (!antwort.fehler) gateway.nachAufruf(adresse, schritt.argumente, antwort.text);
      return { erfolgreich: !antwort.fehler, ergebnis: antwort.text };
    } catch (fehler) {
      return { erfolgreich: false, ergebnis: (fehler as Error).message };
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
  private aufrufer: McpAufrufer;

  constructor(aufrufer: McpAufrufer) {
    this.aufrufer = aufrufer;
  }

  async starte(einstellungen: SitzungsEinstellungen, empfaenger: EreignisEmpfaenger): Promise<AgentenSitzung> {
    return new SimulationsSitzung(randomUUID(), einstellungen, empfaenger, this.aufrufer);
  }

  async setzeFort(sitzungId: string, einstellungen: SitzungsEinstellungen, empfaenger: EreignisEmpfaenger): Promise<AgentenSitzung> {
    return new SimulationsSitzung(sitzungId, einstellungen, empfaenger, this.aufrufer);
  }

  async loescheSitzung(): Promise<void> {}

  async modelle(): Promise<ModellInfo[]> {
    return simulierteModelle;
  }

  // Die MCP-Verbindungen gehören dem Aufrufer und werden beim Herunterfahren dort geschlossen.
  async beenden(): Promise<void> {}
}
