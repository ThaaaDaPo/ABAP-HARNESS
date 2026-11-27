// Der Workflow-Ordner: je Workflow eine Datei <kennung>.workflow.json (E-66). Die Dateien sind die
// Wahrheit – die App liest sie bei Bedarf neu, wer sie außerhalb ändert, sieht das in der App.
// So lassen sich Workflows auch per ZIP zwischen Rechnern mitnehmen.
import fs from "node:fs";
import path from "node:path";
import type { WorkflowDefinition } from "../../gemeinsam/typen.ts";
import { Fehler } from "../fehler.ts";
import { beispielWorkflow } from "./beispiel.ts";
import { pruefeDefinition } from "./pruefen.ts";

const endung = ".workflow.json";
const kennungMuster = /^[a-z0-9][a-z0-9-]{0,59}$/;

export interface GelesenerWorkflow {
  id: string;
  definition: WorkflowDefinition | null;
  fehler: string | null;
}

function datei(ordner: string, id: string): string {
  if (!kennungMuster.test(id)) throw new Fehler(400, `Ungültige Workflow-Kennung „${id}“.`);
  return path.join(ordner, `${id}${endung}`);
}

/** Legt den Ordner an, wenn es ihn noch nicht gibt – dann auch mit einem Beispiel zum Ausprobieren. */
export function richteOrdnerEin(ordner: string): void {
  if (fs.existsSync(ordner)) return;
  fs.mkdirSync(ordner, { recursive: true });
  fs.writeFileSync(datei(ordner, "tickets-einschaetzen"), JSON.stringify(beispielWorkflow, null, 2) + "\n", "utf8");
}

/** Alle Workflows, nach Name sortiert. Kaputte Dateien erscheinen mit Fehler, statt die Liste zu verhindern. */
export function listeWorkflows(ordner: string): GelesenerWorkflow[] {
  if (!fs.existsSync(ordner)) return [];
  return fs
    .readdirSync(ordner)
    .filter((name) => name.endsWith(endung) && kennungMuster.test(name.slice(0, -endung.length)))
    .map((name) => {
      const id = name.slice(0, -endung.length);
      try {
        return { id, definition: leseWorkflow(ordner, id), fehler: null };
      } catch (f) {
        return { id, definition: null, fehler: (f as Error).message };
      }
    })
    .sort((a, b) => (a.definition?.name ?? a.id).localeCompare(b.definition?.name ?? b.id, "de"));
}

export function gibtEs(ordner: string, id: string): boolean {
  return fs.existsSync(datei(ordner, id));
}

export function leseWorkflow(ordner: string, id: string): WorkflowDefinition {
  const pfad = datei(ordner, id);
  if (!fs.existsSync(pfad)) throw new Fehler(404, `Den Workflow ${id} gibt es nicht.`);
  let roh: unknown;
  try {
    roh = JSON.parse(fs.readFileSync(pfad, "utf8"));
  } catch (f) {
    throw new Fehler(400, `${id}${endung} ist kein gültiges JSON: ${(f as Error).message}`);
  }
  return pruefeDefinition(roh);
}

/** Prüft und speichert. Gibt die gespeicherte (vervollständigte) Definition zurück. */
export function speichereWorkflow(ordner: string, id: string, roh: unknown): WorkflowDefinition {
  const definition = pruefeDefinition(roh);
  fs.writeFileSync(datei(ordner, id), JSON.stringify(definition, null, 2) + "\n", "utf8");
  return definition;
}

export function loescheWorkflow(ordner: string, id: string): void {
  const pfad = datei(ordner, id);
  if (!fs.existsSync(pfad)) throw new Fehler(404, `Den Workflow ${id} gibt es nicht.`);
  fs.unlinkSync(pfad);
}

/** Kennung aus dem Namen: klein, ohne Umlaute, Bindestriche statt Leerzeichen; bei Bedarf mit Zähler. */
export function neueKennung(ordner: string, name: string): string {
  const basis =
    name
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50) || "workflow";
  let kennung = basis;
  for (let zaehler = 2; gibtEs(ordner, kennung); zaehler++) kennung = `${basis}-${zaehler}`;
  return kennung;
}

/** Neuer, fast leerer Workflow, den David danach im Editor ausbaut. */
export function legeNeuenAn(ordner: string, name: string): string {
  const kennung = neueKennung(ordner, name);
  speichereWorkflow(ordner, kennung, { name, start: { manuell: true }, schritte: [] });
  return kennung;
}
