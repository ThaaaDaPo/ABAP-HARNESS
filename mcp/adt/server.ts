// ADT-MCP: ABAP entwickeln über die ADT-Schnittstelle des SAP-Systems, ohne Eclipse (V-01).
// Wird von der App eingetragen und gestartet (Seite MCP-Server → ADT) – von Copilot je Sitzung und
// von der App selbst (Tools auslesen, Simulation, Freigaben).
//
// Start: node --experimental-strip-types mcp/adt/server.ts --zugang <datei>
// Konfiguration und SSO-Cookie holt er bei der App (app-zugang.ts); erst beim ersten Tool-Aufruf,
// damit das Auslesen der Tools auch ohne SAP geht.
import { starteMcpServer } from "../gemeinsam/mini-server.ts";
import { AppZugang } from "./app-zugang.ts";
import type { AdtGegenstelle } from "./gegenstelle.ts";
import { SimulierteGegenstelle } from "./simulierte-gegenstelle.ts";
import { erstelleWerkzeuge, type AdtKontext } from "./werkzeuge.ts";
import { Workspace } from "./workspace.ts";

const zugang = AppZugang.ausArgumenten();
let kontext: Promise<AdtKontext> | null = null;
let gegenstelle: AdtGegenstelle | null = null;

async function baueKontext(): Promise<AdtKontext> {
  const konfiguration = await zugang.konfiguration();
  if (konfiguration.gegenstelle === "sap") {
    if (!konfiguration.url) throw new Error("ADT ist nicht eingerichtet: In der App unter MCP-Server → ADT die SAP-Adresse eintragen.");
    // Die SAP-Bibliothek nur laden, wenn sie gebraucht wird
    const { SapGegenstelle } = await import("./sap-gegenstelle.ts");
    gegenstelle = new SapGegenstelle(konfiguration, zugang);
  } else {
    gegenstelle = new SimulierteGegenstelle(konfiguration.simulationsDatei);
  }
  return { gegenstelle, workspace: new Workspace(konfiguration.workspaceOrdner), konfiguration };
}

starteMcpServer(
  "abap-harness-adt",
  erstelleWerkzeuge(() => {
    // Schlägt der Aufbau fehl (z. B. App nicht erreichbar), beim nächsten Aufruf neu versuchen.
    kontext ??= baueKontext().catch((fehler) => {
      kontext = null;
      throw fehler;
    });
    return kontext;
  }),
  async () => {
    await gegenstelle?.beenden();
  },
);
