// HTTP-Schnittstelle für Workflows (Dateien im Workflow-Ordner) und ihre Läufe.
import { Router } from "express";
import type { LaufMitSchritten } from "../../gemeinsam/typen.ts";
import type { ChatDienst } from "../chat/chat-dienst.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import { holeEintraegeDesLaufs } from "../datenbank/postfach.ts";
import * as laeufe from "../datenbank/workflow-laeufe.ts";
import { Fehler } from "../fehler.ts";
import type { WorkflowDienst } from "../workflows/workflow-dienst.ts";
import * as ordner from "../workflows/workflow-ordner.ts";

const nummer = (roh: string) => {
  const nr = Number(roh);
  if (!Number.isInteger(nr)) throw new Fehler(400, "Ungültige Nummer");
  return nr;
};

export function routenWorkflows(dienst: WorkflowDienst, workflowOrdner: string, chat: ChatDienst): Router {
  const router = Router();

  // Alle Workflows mit Warnungen, zugeordneten Agenten und letztem Lauf
  router.get("/", (_anfrage, antwort) => {
    antwort.json({ ordner: workflowOrdner, workflows: dienst.liste() });
  });

  // Neuer Workflow aus einem Namen; die Kennung entsteht daraus
  router.post("/", (anfrage, antwort) => {
    const name = String(anfrage.body?.name ?? "").trim();
    if (!name) throw new Fehler(400, "Bitte einen Namen angeben.");
    antwort.status(201).json({ id: ordner.legeNeuenAn(workflowOrdner, name) });
  });

  router.get("/:id", (anfrage, antwort) => {
    antwort.json(ordner.leseWorkflow(workflowOrdner, anfrage.params.id));
  });

  // Speichern prüft den Aufbau; ein laufender Lauf arbeitet mit dem Stand, mit dem er gestartet ist.
  router.put("/:id", async (anfrage, antwort) => {
    if (!ordner.gibtEs(workflowOrdner, anfrage.params.id)) throw new Fehler(404, `Den Workflow ${anfrage.params.id} gibt es nicht.`);
    const definition = ordner.speichereWorkflow(workflowOrdner, anfrage.params.id, anfrage.body);
    // Beschreibung und Eingaben stehen in der Tool-Beschreibung der Agenten – Sitzungen neu aufbauen.
    await chat.konfigurationGeaendert();
    antwort.json(definition);
  });

  router.delete("/:id", async (anfrage, antwort) => {
    ordner.loescheWorkflow(workflowOrdner, anfrage.params.id);
    await chat.konfigurationGeaendert();
    antwort.json({ geloescht: true });
  });

  // Manuell starten. Antwort: der neue Lauf
  router.post("/:id/starten", (anfrage, antwort) => {
    const lauf = dienst.starteLauf(anfrage.params.id, anfrage.body?.eingaben ?? {}, { ausloeser: "manuell" });
    antwort.status(201).json(laeufe.oeffentlich(lauf));
  });

  router.get("/:id/laeufe", (anfrage, antwort) => {
    antwort.json(laeufe.holeLaeufe(dienst.db, anfrage.params.id).map(laeufe.oeffentlich));
  });

  return router;
}

export function routenLaeufe(dienst: WorkflowDienst, db: Datenbank): Router {
  const router = Router();

  // Die letzten Läufe aller Workflows
  router.get("/", (_anfrage, antwort) => {
    antwort.json(laeufe.holeLaeufe(db).map(laeufe.oeffentlich));
  });

  router.get("/:nr", (anfrage, antwort) => {
    const lauf = laeufe.holeLauf(db, nummer(anfrage.params.nr));
    if (!lauf) throw new Fehler(404, "Lauf nicht gefunden");
    const ergebnis: LaufMitSchritten = {
      lauf: laeufe.oeffentlich(lauf),
      schritte: laeufe.holeSchritte(db, lauf.nr).map(({ schluessel: _s, ...schritt }) => schritt),
      postfach: holeEintraegeDesLaufs(db, lauf.nr),
    };
    antwort.json(ergebnis);
  });

  router.post("/:nr/abbrechen", (anfrage, antwort) => {
    dienst.abbrechen(nummer(anfrage.params.nr));
    antwort.json({ abgebrochen: true });
  });

  router.post("/:nr/fortsetzen", (anfrage, antwort) => {
    antwort.json(laeufe.oeffentlich(dienst.fortsetzen(nummer(anfrage.params.nr))));
  });

  return router;
}
