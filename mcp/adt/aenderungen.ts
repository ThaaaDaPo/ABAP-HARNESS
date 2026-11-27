// Änderungssätze (E-31): Jedes Speichern und Anlegen hält fest, was es im System geändert hat – mit
// vollem Vorher und Nachher. Daraus zeigt die App den Vergleich nebeneinander und macht die Änderung
// auf Wunsch rückgängig. Abgelegt als JSON im Workspace (abap/.adt/aenderungen/), weil der ADT-MCP
// als eigener Prozess läuft und die App den Workspace ohnehin kennt. Der Agent bekommt nur die
// Nummer im Ergebnistext, nicht noch einmal den ganzen Quelltext – das spart Tokens.
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { AdtAenderung } from "../../gemeinsam/typen.ts";

const idMuster = /^\d{8}-\d{6}-[0-9a-f]{4}$/;

export function neueAenderungsId(jetzt = new Date()): string {
  const zeit = jetzt.toISOString().replace(/[-:T]/g, "").slice(0, 14);
  return `${zeit.slice(0, 8)}-${zeit.slice(8)}-${randomBytes(2).toString("hex")}`;
}

/** Pfad des Änderungssatzes. Null bei einer ungültigen Nummer (kommt von außen, z. B. aus der URL). */
export function aenderungsDatei(workspaceOrdner: string, id: string): string | null {
  if (!idMuster.test(id)) return null;
  return path.join(workspaceOrdner, "abap", ".adt", "aenderungen", `${id}.json`);
}

export function leseAenderung(workspaceOrdner: string, id: string): AdtAenderung | null {
  const datei = aenderungsDatei(workspaceOrdner, id);
  if (!datei || !fs.existsSync(datei)) return null;
  return JSON.parse(fs.readFileSync(datei, "utf8"));
}

export function schreibeAenderung(workspaceOrdner: string, aenderung: AdtAenderung): void {
  const datei = aenderungsDatei(workspaceOrdner, aenderung.id);
  if (!datei) throw new Error(`Ungültige Änderungsnummer ${aenderung.id}`);
  fs.mkdirSync(path.dirname(datei), { recursive: true });
  fs.writeFileSync(datei, JSON.stringify(aenderung, null, 2), "utf8");
}
