// Der Beispiel-Workflow, wie er beim ersten Start entsteht, einmal ganz durch: echte Simulations-
// Laufzeit mit Drehbuch, echter Jira-Stellvertreter, Freigabe im Postfach. So sieht David es auch in
// der App ohne Copilot. npm test
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { richteStandardAgentenEin } from "../agenten/agenten-dienst.ts";
import { ChatDienst } from "../chat/chat-dienst.ts";
import { oeffneDatenbank } from "../datenbank/datenbank.ts";
import { legeServerAn } from "../datenbank/mcp-server.ts";
import { setzeRegel, standardTool } from "../datenbank/tool-regeln.ts";
import { holeSchritte } from "../datenbank/workflow-laeufe.ts";
import type { Einstellungen } from "../einstellungen.ts";
import { SimulationsLaufzeit } from "../laufzeit/simulation/simulation.ts";
import { McpAufrufer } from "../mcp/mcp-aufrufer.ts";
import { nodeMitTypeScript } from "../mcp/stellvertreter.ts";
import { PostfachDienst } from "../postfach/postfach-dienst.ts";
import { warteBis } from "../testhilfe.ts";
import { WorkflowDienst } from "./workflow-dienst.ts";
import { richteOrdnerEin } from "./workflow-ordner.ts";

const aufrufer = new McpAufrufer();
after(() => aufrufer.schliesseAlle());

test("Beispiel-Workflow läuft in der Simulation durch: Suche, KI-Einschätzung, Freigabe, Ergebnis", async () => {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "harness-beispiel-"));
  const db = oeffneDatenbank(ordner);
  legeServerAn(db, {
    schluessel: "jira",
    name: "Jira",
    befehl: process.execPath,
    argumente: [...nodeMitTypeScript, "mcp/stellvertreter-jira-confluence/server.ts"],
    umgebung: {},
    arbeitsordner: "",
  });
  setzeRegel(db, "standard", "jira", standardTool, "freigabe");
  const einstellungen = { agent: { name: "Test", auftrag: "" }, modell: "", workspaceOrdner: ordner, instructionsOrdner: ordner } as Einstellungen;
  richteStandardAgentenEin(db, einstellungen);

  const chat = new ChatDienst(db, new SimulationsLaufzeit(aufrufer), einstellungen);
  const postfach = new PostfachDienst(db, chat, aufrufer);
  const workflowOrdner = path.join(ordner, "workflows");
  richteOrdnerEin(workflowOrdner);
  const dienst = new WorkflowDienst(db, workflowOrdner, chat, aufrufer);
  assert.deepEqual(dienst.liste().map((w) => [w.id, w.fehler, w.warnungen]), [["tickets-einschaetzen", null, []]]);

  const nr = dienst.starteLauf("tickets-einschaetzen", {}, { ausloeser: "manuell" }).nr;
  // Die KI hält ABAP-124 (Simulation: immer) für umsetzbar – das Verschieben wartet auf die Freigabe.
  await warteBis(() => postfach.fuerWorkflows().some((e) => e.status === "offen"), 10_000);
  const [vorschlag] = postfach.fuerWorkflows();
  assert.deepEqual([vorschlag.tool, vorschlag.argumente, vorschlag.ohneKi], ["ticket_verschieben", { schluessel: "ABAP-124", status: "In Arbeit" }, true]);

  await postfach.freigeben(vorschlag.nr);
  const lauf = await dienst.warteAufEnde(nr);
  assert.equal(lauf.status, "erfolgreich", lauf.fehler ?? "");
  assert.equal(lauf.ergebnis, "Eingeschätzt:\n- ABAP-124: (Simulation) Kurze Begründung, ein bis zwei Sätze");
  assert.ok(lauf.verbrauch.aufrufe > 0, "der KI-Schritt hat (erfundenen) Verbrauch gemeldet");
  assert.deepEqual(
    holeSchritte(db, nr).map((s) => [s.schrittId, s.status]),
    [["suchen", "fertig"], ["keine", "fertig"], ["je_ticket", "fertig"], ["einschaetzen", "fertig"], ["umsetzbar", "fertig"], ["verschieben", "fertig"], ["merken", "fertig"]],
  );
});
