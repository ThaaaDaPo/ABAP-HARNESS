// HTTP-Schnittstelle für das Postfach. Jede Aktion liefert die vollständige, aktuelle Liste zurück.
import { Router, type Response } from "express";
import { Fehler } from "../fehler.ts";
import type { PostfachDienst } from "../postfach/postfach-dienst.ts";

export function routenPostfach(dienst: PostfachDienst): Router {
  const router = Router();
  const liste = (antwort: Response) => antwort.json(dienst.alle());
  const nummer = (roh: string) => {
    const nr = Number(roh);
    if (!Number.isInteger(nr)) throw new Fehler(400, "Ungültige Nummer");
    return nr;
  };

  router.get("/", (_anfrage, antwort) => liste(antwort));

  // Für den Zähler in der Navigation
  router.get("/anzahl-offen", (_anfrage, antwort) => {
    antwort.json({ anzahl: dienst.anzahlOffen() });
  });

  // Freigeben führt den Aufruf aus und kann daher etwas dauern (z. B. SAP-Cookie holen).
  router.post("/:nr/freigeben", async (anfrage, antwort) => {
    await dienst.freigeben(nummer(anfrage.params.nr));
    liste(antwort);
  });

  router.post("/:nr/verwerfen", (anfrage, antwort) => {
    dienst.verwerfen(nummer(anfrage.params.nr));
    liste(antwort);
  });

  router.post("/:nr/zur-kenntnis", (anfrage, antwort) => {
    dienst.zurKenntnis(nummer(anfrage.params.nr));
    liste(antwort);
  });

  // Antwort, Änderungswunsch oder Rückmeldung – geht an den Agenten
  router.post("/:nr/antworten", (anfrage, antwort) => {
    const text = String(anfrage.body?.text ?? "").trim();
    if (!text) throw new Fehler(400, "Die Antwort ist leer");
    dienst.antworten(nummer(anfrage.params.nr), text);
    liste(antwort);
  });

  return router;
}
