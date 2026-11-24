// Ruft Tools bei eingetragenen MCP-Servern auf, ohne Agent dazwischen.
// Gebraucht von der Simulation (statt Copilot) und vom Postfach: Bei einer Freigabe führt die
// Plattform den gespeicherten Aufruf selbst aus (V-05, E-44) – das kostet keine Tokens.
import type { McpServerDaten } from "../../gemeinsam/typen.ts";
import { startAngaben } from "./mcp-dienst.ts";
import { McpVerbindung, type AufrufErgebnis } from "./mcp-verbindung.ts";

export class McpAufrufer {
  /**
   * Offene Verbindungen, damit nicht jeder Aufruf einen neuen Prozess startet (beim SAP-MCP
   * hieße das jedes Mal ein neues Cookie). Schlüssel ist der Startbefehl: Ändert David ihn,
   * wird ein neuer Prozess gestartet.
   */
  private verbindungen = new Map<string, Promise<McpVerbindung>>();

  async rufeAuf(server: McpServerDaten, tool: string, argumente: unknown): Promise<AufrufErgebnis> {
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
  }

  async schliesseAlle(): Promise<void> {
    for (const verbindung of this.verbindungen.values()) {
      await verbindung.then((v) => v.schliesse()).catch(() => {});
    }
    this.verbindungen.clear();
  }
}
