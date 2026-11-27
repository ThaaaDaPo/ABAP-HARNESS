// ADT-MCP: ABAP entwickeln über die ADT-Schnittstelle des SAP-Systems, ohne Eclipse (V-01).
// Wird von der App eingetragen und gestartet (Seite MCP-Server → ADT) – von Copilot je Sitzung und
// von der App selbst (Tools auslesen, Simulation, Freigaben).
//
// Start: node --experimental-strip-types mcp/adt/server.ts --zugang <datei> [--app]
// Konfiguration und SSO-Cookie holt er bei der App (app-zugang.ts); erst beim ersten Tool-Aufruf,
// damit das Auslesen der Tools auch ohne SAP geht.
import type { AdtLaufzeitKonfiguration } from "../../gemeinsam/typen.ts";
import { starteMcpServer } from "../gemeinsam/mini-server.ts";
import { AppZugang } from "./app-zugang.ts";
import type { AdtGegenstelle } from "./gegenstelle.ts";
import { SimulierteGegenstelle } from "./simulierte-gegenstelle.ts";
import { erstelleWerkzeuge, type AdtKontext } from "./werkzeuge.ts";
import { erstelleAppWerkzeuge } from "./zuruecknehmen.ts";
import { Workspace } from "./workspace.ts";

const zugang = AppZugang.ausArgumenten();
/** Der aufgebaute Kontext und die Konfiguration, mit der er gebaut wurde */
let aktuell: { konfiguration: string; kontext: Promise<AdtKontext> } | null = null;
let gegenstelle: AdtGegenstelle | null = null;

async function baueKontext(konfiguration: AdtLaufzeitKonfiguration): Promise<AdtKontext> {
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

/**
 * Holt die Konfiguration bei jedem Aufruf neu (ein kurzer Aufruf an die App auf demselben Rechner).
 * Copilot startet den Server je Sitzung neu, die App hält ihre Prozesse aber offen – so gilt eine
 * geänderte Einstellung (z. B. Übungssystem → SAP-System) auch dort sofort.
 */
async function holeKontext(): Promise<AdtKontext> {
  const konfiguration = await zugang.konfiguration();
  const schluessel = JSON.stringify(konfiguration);
  if (aktuell?.konfiguration !== schluessel) {
    const alte = gegenstelle;
    const neu = { konfiguration: schluessel, kontext: baueKontext(konfiguration) };
    aktuell = neu;
    // Schlägt der Aufbau fehl, beim nächsten Aufruf neu versuchen
    neu.kontext.catch(() => {
      if (aktuell === neu) aktuell = null;
    });
    void alte?.beenden().catch(() => {});
  }
  return aktuell.kontext;
}

// --app: Die App selbst startet diesen Prozess (z. B. für „Rückgängig“) und bekommt dafür Tools,
// die der Agent nie sieht – Copilot startet den Server ohne diesen Schalter.
const fuerApp = process.argv.includes("--app");

starteMcpServer(
  "abap-harness-adt",
  [...erstelleWerkzeuge(holeKontext), ...(fuerApp ? erstelleAppWerkzeuge(holeKontext) : [])],
  async () => {
    await gegenstelle?.beenden();
  },
);
