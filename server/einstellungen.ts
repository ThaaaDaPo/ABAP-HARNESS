// Liest einstellungen.json aus dem Projektordner. Fehlt die Datei, gelten die Standardwerte
// (Simulationsmodus), damit die App auch ohne Einrichtung startet.
import fs from "node:fs";
import path from "node:path";

export interface Einstellungen {
  port: number;
  /** "simulation": Drehbuch statt echtem Modell. "copilot": echtes GitHub Copilot. */
  modus: "simulation" | "copilot";
  /** Der einzige Ordner, in dem der Agent Dateien lesen und schreiben darf. */
  workspaceOrdner: string;
  /** Hier liegen Datenbank und andere Laufzeitdaten der App. */
  datenOrdner: string;
  /** Ordner mit *.instructions.md und Skill-Ordnern (je mit SKILL.md), E-30/E-58. */
  instructionsOrdner: string;
  /** Ordner mit den Workflows, je Workflow eine Datei <kennung>.workflow.json (E-66). */
  workflowOrdner: string;
  /**
   * Nur beim allerersten Start: Daraus entsteht der Agent "standard" (Modell leer = automatisch).
   * Danach stellt David Agenten in der App ein; diese Werte liest die App dann nicht mehr.
   */
  modell: string;
  agent: {
    name: string;
    auftrag: string;
  };
}

export const projektOrdner = path.resolve(import.meta.dirname, "..");

const standard: Einstellungen = {
  port: 4711,
  modus: "simulation",
  workspaceOrdner: "./daten/workspace",
  datenOrdner: "./daten",
  instructionsOrdner: "./daten/instructions",
  workflowOrdner: "./daten/workflows",
  modell: "",
  agent: {
    name: "Assistent",
    auftrag: "Du bist ein hilfreicher Assistent für SAP- und ABAP-Entwicklung. Antworte auf Deutsch, knapp und sachlich.",
  },
};

export const einstellungsDatei = path.join(projektOrdner, "einstellungen.json");

export function ladeEinstellungen(): Einstellungen {
  const ausDatei = fs.existsSync(einstellungsDatei) ? JSON.parse(fs.readFileSync(einstellungsDatei, "utf8")) : {};
  const einstellungen: Einstellungen = {
    ...standard,
    ...ausDatei,
    agent: { ...standard.agent, ...ausDatei.agent },
  };

  if (einstellungen.modus !== "simulation" && einstellungen.modus !== "copilot") {
    throw new Error(`einstellungen.json: "modus" muss "simulation" oder "copilot" sein, nicht "${einstellungen.modus}"`);
  }

  // Relative Pfade gelten ab dem Projektordner, nicht ab dem Ordner, aus dem gestartet wurde.
  einstellungen.workspaceOrdner = path.resolve(projektOrdner, einstellungen.workspaceOrdner);
  einstellungen.datenOrdner = path.resolve(projektOrdner, einstellungen.datenOrdner);
  einstellungen.instructionsOrdner = path.resolve(projektOrdner, einstellungen.instructionsOrdner);
  einstellungen.workflowOrdner = path.resolve(projektOrdner, einstellungen.workflowOrdner);
  fs.mkdirSync(einstellungen.workspaceOrdner, { recursive: true });
  fs.mkdirSync(einstellungen.datenOrdner, { recursive: true });
  // Einen eingetragenen Instructions-Ordner nicht anlegen: Fehlt er, ist meist der Pfad falsch, und
  // die Einrichtungsseite zeigt das an. Nur der Standardordner unter daten/ entsteht von selbst.
  if (einstellungen.instructionsOrdner === path.resolve(projektOrdner, standard.instructionsOrdner)) {
    fs.mkdirSync(einstellungen.instructionsOrdner, { recursive: true });
  }

  return einstellungen;
}
