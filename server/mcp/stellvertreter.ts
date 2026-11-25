// Trägt beim ersten Start die beiden Stellvertreter-Server (mcp/stellvertreter-*) mit
// sinnvollen Regeln ein. So kann man Gateway und Chat sofort ausprobieren – auf dem
// Privatrechner in der Simulation, auf dem Firmenrechner auch mit echtem Copilot.
// Wer sie löscht, bekommt sie nicht wieder: eingetragen wird nur ein einziges Mal.
import type { McpServerDaten, ToolRegel } from "../../gemeinsam/typen.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import { holeServer, legeServerAn } from "../datenbank/mcp-server.ts";
import { setzeRegel, standardTool } from "../datenbank/tool-regeln.ts";
import { standardAgentId } from "../datenbank/agenten.ts";
import { leseTools } from "./mcp-dienst.ts";

/** Die Stellvertreter sind TypeScript; Node braucht dafür bis Version 22.18 diesen Schalter. */
export const nodeMitTypeScript = ["--experimental-strip-types", "--disable-warning=ExperimentalWarning"];

const stellvertreter: { daten: McpServerDaten; regeln: Record<string, ToolRegel> }[] = [
  {
    daten: {
      schluessel: "sap",
      name: "SAP (Stellvertreter)",
      befehl: "node",
      argumente: [...nodeMitTypeScript, "mcp/stellvertreter-sap/server.ts"],
      umgebung: {},
      arbeitsordner: "",
    },
    // Lesen ist frei; Schreiben über den SAP-MCP ist gesperrt, entwickelt wird später über ADT (V-06).
    regeln: { [standardTool]: "erlauben", objekt_aendern: "verbieten" },
  },
  {
    daten: {
      schluessel: "jira",
      name: "Jira/Confluence (Stellvertreter)",
      befehl: "node",
      argumente: [...nodeMitTypeScript, "mcp/stellvertreter-jira-confluence/server.ts"],
      umgebung: {},
      arbeitsordner: "",
    },
    // Lesen frei, Ticket verschieben mit Meldung, Confluence-Seite anlegen nur mit Freigabe (E-20).
    regeln: {
      [standardTool]: "freigabe",
      ticket_lesen: "erlauben",
      tickets_suchen: "erlauben",
      seite_lesen: "erlauben",
      ticket_verschieben: "melden",
    },
  },
];

export async function richteStellvertreterEin(db: Datenbank): Promise<void> {
  // Die Datenbank merkt sich in user_version, dass das schon passiert ist.
  const { user_version: version } = db.prepare(`PRAGMA user_version`).get() as { user_version: number };
  if (version >= 1) return;

  for (const { daten, regeln } of stellvertreter) {
    if (holeServer(db, daten.schluessel)) continue;
    legeServerAn(db, daten);
    for (const [tool, regel] of Object.entries(regeln)) setzeRegel(db, standardAgentId, daten.schluessel, tool, regel);
    await leseTools(db, daten.schluessel);
  }
  db.exec(`PRAGMA user_version = 1`);
}
