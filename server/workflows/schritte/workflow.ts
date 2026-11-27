// Schritt „Workflow“: startet einen anderen Workflow als Teil dieses Laufs und wartet auf sein Ergebnis.
// Der Unterlauf hat ein eigenes Protokoll und ein eigenes Credit-Limit. Wird dieser Lauf nach einer
// Unterbrechung fortgesetzt, wird auch der Unterlauf fortgesetzt statt neu gestartet.
import type { WorkflowSchritt } from "../../../gemeinsam/typen.ts";
import { setzeEin } from "../ausdruecke.ts";
import { LaufAbbruch, SchrittFehler, type SchrittKontext } from "./gemeinsam.ts";

export async function workflowSchritt(schritt: Extract<WorkflowSchritt, { art: "workflow" }>, k: SchrittKontext): Promise<unknown> {
  const eingaben = Object.fromEntries(
    Object.entries(schritt.eingaben)
      .map(([name, text]) => [name, setzeEin(text, k.variablen)] as const)
      .filter(([, wert]) => wert !== "" && wert !== undefined),
  );
  const vorherigerLauf = (k.vorher?.eingabe as { lauf?: number } | null)?.lauf ?? null;
  const unterlauf = await k.umgebung.fuehreUnterlaufAus(k.lauf, schritt.workflowId, eingaben, vorherigerLauf, (nr) =>
    k.vermerke({ eingabe: { workflow: schritt.workflowId, eingaben, lauf: nr } }),
  );
  if (unterlauf.status === "erfolgreich") return unterlauf.ergebnis;
  const text = `Workflow ${schritt.workflowId} (Lauf #${unterlauf.nr}): ${unterlauf.fehler ?? unterlauf.status}`;
  if (unterlauf.status === "abgebrochen") throw new LaufAbbruch(text);
  throw new SchrittFehler(text);
}
