// Simulierte Laufzeit: spielt das Drehbuch ab statt ein echtes Modell zu fragen.
// Damit lässt sich die ganze App ohne Copilot entwickeln und testen.
// Tool-Aufrufe aus dem Drehbuch gehen wie bei Copilot durch das Tool-Gateway und werden,
// wenn es sie erlaubt, wirklich beim eingetragenen MCP-Server ausgeführt.
import { randomUUID } from "node:crypto";
import type { McpServerDaten } from "../../../gemeinsam/typen.ts";
import type { ToolAdresse } from "../../gateway/gateway.ts";
import { startAngaben } from "../../mcp/mcp-dienst.ts";
import { McpVerbindung, type AufrufErgebnis } from "../../mcp/mcp-verbindung.ts";
import type { AgentenLaufzeit, AgentenSitzung, EreignisEmpfaenger, SitzungsEinstellungen } from "../laufzeit.ts";
import { findeSchritte, type DrehbuchSchritt } from "./drehbuch.ts";

const pause = (ms: number) => new Promise((fertig) => setTimeout(fertig, ms));

type ToolSchritt = Extract<DrehbuchSchritt, { tool: string }>;
type McpAufruf = (server: McpServerDaten, tool: string, argumente: unknown) => Promise<AufrufErgebnis>;

class SimulationsSitzung implements AgentenSitzung {
  readonly id: string;
  private einstellungen: SitzungsEinstellungen;
  private empfaenger: EreignisEmpfaenger;
  private rufeMcpAuf: McpAufruf;
  private abgebrochen = false;

  constructor(id: string, einstellungen: SitzungsEinstellungen, empfaenger: EreignisEmpfaenger, rufeMcpAuf: McpAufruf) {
    this.id = id;
    this.einstellungen = einstellungen;
    this.empfaenger = empfaenger;
    this.rufeMcpAuf = rufeMcpAuf;
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
        await pause(300);
        const { erfolgreich, ergebnis } = await this.fuehreAus(schritt);
        this.empfaenger({ art: "tool_ende", aufrufId, erfolgreich, ergebnis });
      } else {
        await this.schreibe(schritt.text.replace("{eingabe}", text));
      }
    }
  }

  /** Fragt das Gateway und ruft das Tool beim MCP-Server auf, wenn es erlaubt ist. */
  private async fuehreAus(schritt: ToolSchritt): Promise<{ erfolgreich: boolean; ergebnis: string }> {
    const { gateway, mcpServer } = this.einstellungen;
    const adresse = gateway.zerlege(schritt.tool);

    // Kein MCP-Tool eines eingetragenen Servers: das Ergebnis steht im Drehbuch.
    if (!adresse) return { erfolgreich: !schritt.fehlgeschlagen, ergebnis: schritt.ergebnis ?? "" };

    const entscheidung = gateway.vorAufruf(adresse, schritt.argumente);
    if (!entscheidung.ausfuehren) return { erfolgreich: false, ergebnis: entscheidung.grund };

    try {
      const server = mcpServer.find((s) => s.schluessel === adresse.server);
      if (!server) throw new Error(`Server ${adresse.server} war beim Start der Sitzung nicht eingetragen.`);
      const antwort = await this.rufeMcpAuf(server, adresse.tool, schritt.argumente);
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
  /**
   * Offene Verbindungen zu MCP-Servern, damit nicht jeder Aufruf einen neuen Prozess startet.
   * Schlüssel ist der Startbefehl: Ändert David ihn, wird ein neuer Prozess gestartet.
   */
  private verbindungen = new Map<string, Promise<McpVerbindung>>();

  async starte(einstellungen: SitzungsEinstellungen, empfaenger: EreignisEmpfaenger): Promise<AgentenSitzung> {
    return new SimulationsSitzung(randomUUID(), einstellungen, empfaenger, this.rufeMcpAuf);
  }

  async setzeFort(sitzungId: string, einstellungen: SitzungsEinstellungen, empfaenger: EreignisEmpfaenger): Promise<AgentenSitzung> {
    return new SimulationsSitzung(sitzungId, einstellungen, empfaenger, this.rufeMcpAuf);
  }

  private rufeMcpAuf: McpAufruf = async (server, tool, argumente) => {
    const angaben = startAngaben(server);
    const schluessel = JSON.stringify(angaben);
    let verbindung = this.verbindungen.get(schluessel);
    if (!verbindung) {
      verbindung = McpVerbindung.oeffne(angaben);
      this.verbindungen.set(schluessel, verbindung);
    }
    try {
      return await (await verbindung).rufeAuf(tool, argumente);
    } catch (fehler) {
      // Kaputte Verbindung vergessen, beim nächsten Aufruf wird neu gestartet.
      this.verbindungen.delete(schluessel);
      verbindung.then((v) => v.schliesse()).catch(() => {});
      throw fehler;
    }
  };

  async beenden(): Promise<void> {
    for (const verbindung of this.verbindungen.values()) {
      await verbindung.then((v) => v.schliesse()).catch(() => {});
    }
    this.verbindungen.clear();
  }
}
