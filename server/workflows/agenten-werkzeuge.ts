// Tools für Agenten, denen Workflows zugeordnet sind (Agenten-Seite, nur mit „Start durch Agent“):
// - workflow_starten: startet einen Workflow. Standard: wartet bis zum Ende und liefert das Ergebnis.
//   Mit warten: false kehrt es sofort zurück; im Chat bekommt der Agent eine Nachricht, sobald der
//   Lauf fertig ist (E-71).
// - workflow_stand: wo ein Lauf gerade steht, bzw. sein Ergebnis.
import type { WorkflowDefinition } from "../../gemeinsam/typen.ts";
import type { AufgabeIntern } from "../datenbank/aufgaben.ts";
import { holeLauf } from "../datenbank/workflow-laeufe.ts";
import type { PlattformTool } from "../postfach/plattform-tools.ts";
import { beschreibeLauf, type WorkflowDienst } from "./workflow-dienst.ts";

/** Wie die Workflows in der Tool-Beschreibung erscheinen – danach entscheidet der Agent. */
function verzeichnis(workflows: { id: string; definition: WorkflowDefinition }[]): string {
  return workflows
    .map(({ id, definition }) => {
      const eingaben = definition.eingaben
        .map((e) => `${e.name} (${e.typ}${e.pflicht ? ", Pflicht" : ""}${e.standard ? `, Standard ${e.standard}` : ""})${e.beschreibung ? `: ${e.beschreibung}` : ""}`)
        .join("; ");
      return `- ${id} – ${definition.name}: ${definition.beschreibung}${eingaben ? `\n  Eingaben: ${eingaben}` : ""}`;
    })
    .join("\n");
}

export function workflowWerkzeuge(dienst: WorkflowDienst, aufgabe: AufgabeIntern, workflows: { id: string; definition: WorkflowDefinition }[]): PlattformTool[] {
  const imChat = aufgabe.herkunft === "chat";
  return [
    {
      name: "workflow_starten",
      beschreibung:
        "Startet einen festen Workflow der Plattform. Ein Workflow läuft Schritt für Schritt genau so ab, wie der Nutzer ihn " +
        "festgelegt hat – nimm ihn, wenn er zur Aufgabe passt, statt die Schritte selbst zu machen. Freigaben darin entscheidet der Nutzer. " +
        `Verfügbare Workflows:\n${verzeichnis(workflows)}`,
      parameter: {
        type: "object",
        properties: {
          workflow: { type: "string", enum: workflows.map((w) => w.id), description: "Kennung des Workflows" },
          eingaben: { type: "object", description: "Eingaben des Workflows als Name → Wert" },
          warten: {
            type: "boolean",
            description:
              "true (Standard): warten, bis der Workflow fertig ist, und das Ergebnis bekommen. false: sofort zurückkehren" +
              (imChat ? "; du bekommst eine Nachricht, wenn er fertig ist." : "; den Stand liefert workflow_stand."),
          },
        },
        required: ["workflow"],
      },
      async fuehreAus(argumente) {
        const id = String(argumente?.workflow ?? "");
        if (!workflows.some((w) => w.id === id)) return `Fehler: Den Workflow „${id}“ darfst du nicht starten. Möglich: ${workflows.map((w) => w.id).join(", ")}.`;
        const warten = argumente?.warten !== false;
        let nr: number;
        try {
          const eingaben = argumente?.eingaben && typeof argumente.eingaben === "object" ? argumente.eingaben : {};
          nr = dienst.starteLauf(id, eingaben, { ausloeser: "agent", aufruferAufgabeId: aufgabe.id, benachrichtigen: !warten && imChat }).nr;
        } catch (fehler) {
          return `Fehler: ${(fehler as Error).message}`;
        }
        if (!warten) {
          return `Lauf #${nr} ist gestartet. ${imChat ? "Wenn er fertig ist, bekommst du eine Nachricht. " : ""}Den Stand liefert workflow_stand mit lauf ${nr}.`;
        }
        return beschreibeLauf(await dienst.warteAufEnde(nr));
      },
    },
    {
      name: "workflow_stand",
      beschreibung: "Sagt, wo ein Workflow-Lauf gerade steht (laufender Schritt) bzw. was herausgekommen ist.",
      parameter: {
        type: "object",
        properties: { lauf: { type: "number", description: "Nummer des Laufs, wie workflow_starten sie geliefert hat" } },
        required: ["lauf"],
      },
      fuehreAus(argumente) {
        const lauf = holeLauf(dienst.db, Number(argumente?.lauf));
        return lauf ? beschreibeLauf(lauf) : `Fehler: Lauf #${argumente?.lauf} gibt es nicht.`;
      },
    },
  ];
}
