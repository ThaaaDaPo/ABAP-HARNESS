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
  /** Leer = automatische Modellauswahl von Copilot. */
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
  modell: "",
  agent: {
    name: "Assistent",
    auftrag: "Du bist ein hilfreicher Assistent für SAP- und ABAP-Entwicklung. Antworte auf Deutsch, knapp und sachlich.",
  },
};

export function ladeEinstellungen(): Einstellungen {
  const datei = path.join(projektOrdner, "einstellungen.json");
  const ausDatei = fs.existsSync(datei) ? JSON.parse(fs.readFileSync(datei, "utf8")) : {};
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
  fs.mkdirSync(einstellungen.workspaceOrdner, { recursive: true });
  fs.mkdirSync(einstellungen.datenOrdner, { recursive: true });

  return einstellungen;
}
