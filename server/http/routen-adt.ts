// HTTP-Schnittstelle für den ADT-MCP.
// - Für die Oberfläche: Konfiguration ansehen und ändern, per SSO anmelden, Verbindung testen.
// - Intern für die ADT-MCP-Prozesse: Konfiguration und SSO-Cookie. Nur mit dem Schlüssel aus der
//   Zugangsdatei (adt-einrichten.ts) – das Cookie bekommt sonst niemand, auch keine Webseite im Browser.
import path from "node:path";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { AdtLaufzeitKonfiguration, AdtUebersicht } from "../../gemeinsam/typen.ts";
import { adtOrdner } from "../adt/adt-einrichten.ts";
import { ladeKonfiguration, pruefeKonfiguration, speichereKonfiguration } from "../adt/adt-konfiguration.ts";
import type { SsoAnmeldung } from "../adt/sso-anmeldung.ts";
import { testeVerbindung } from "../adt/verbindung-testen.ts";
import type { ChatDienst } from "../chat/chat-dienst.ts";
import { meldeUebersicht } from "../chat/live-verteiler.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import type { Einstellungen } from "../einstellungen.ts";
import { Fehler } from "../fehler.ts";

/** Muss zu mcp/adt/app-zugang.ts passen */
const schluesselKopf = "x-harness-schluessel";

export function routenAdt(db: Datenbank, einstellungen: Einstellungen, chat: ChatDienst, sso: SsoAnmeldung, schluessel: string): Router {
  const router = Router();
  const uebersicht = (): AdtUebersicht => ({ konfiguration: ladeKonfiguration(db), anmeldung: sso.anmeldung() });

  router.get("/", (_anfrage, antwort) => {
    antwort.json(uebersicht());
  });

  // Gilt für neue Sitzungen; laufende werden vor ihrem nächsten Lauf neu aufgebaut.
  router.put("/", async (anfrage, antwort) => {
    const vorher = ladeKonfiguration(db);
    const neu = pruefeKonfiguration(anfrage.body);
    speichereKonfiguration(db, neu);
    // Anderes System: Das alte Cookie gilt dort nicht.
    if (neu.url !== vorher.url || neu.mandant !== vorher.mandant || neu.gegenstelle !== vorher.gegenstelle) {
      sso.abmelden("Adresse oder Mandant geändert – neu anmelden.");
    }
    await chat.konfigurationGeaendert();
    meldeUebersicht({ bereich: "adt" });
    antwort.json(uebersicht());
  });

  // Öffnet Edge und wartet, bis die Anmeldung da ist (bis 3 Minuten).
  router.post("/anmelden", async (_anfrage, antwort) => {
    if (ladeKonfiguration(db).gegenstelle === "simulation") throw new Fehler(400, "Das Übungssystem braucht keine Anmeldung.");
    await sso.anmelden();
    antwort.json(uebersicht());
  });

  router.post("/abmelden", (_anfrage, antwort) => {
    sso.abmelden();
    antwort.json(uebersicht());
  });

  router.post("/verbindung-testen", async (_anfrage, antwort) => {
    antwort.json({ text: await testeVerbindung(ladeKonfiguration(db), sso), uebersicht: uebersicht() });
  });

  // --- Intern, nur für die ADT-MCP-Prozesse ---

  const nurMitSchluessel = (anfrage: Request, _antwort: Response, weiter: NextFunction) => {
    if (anfrage.get(schluesselKopf) !== schluessel) throw new Fehler(403, "Kein Zugang.");
    weiter();
  };

  router.get("/intern/konfiguration", nurMitSchluessel, (_anfrage, antwort) => {
    const konfiguration: AdtLaufzeitKonfiguration = {
      ...ladeKonfiguration(db),
      workspaceOrdner: einstellungen.workspaceOrdner,
      simulationsDatei: path.join(adtOrdner(einstellungen), "uebungssystem.json"),
    };
    antwort.json(konfiguration);
  });

  // Wartet ggf. auf die Anmeldung in Edge – der Tool-Aufruf des Agenten wartet so lange mit.
  router.post("/intern/cookie", nurMitSchluessel, async (anfrage, antwort) => {
    const abgelaufen = typeof anfrage.body?.abgelaufen === "string" ? anfrage.body.abgelaufen : null;
    antwort.json({ cookie: await sso.cookie(abgelaufen) });
  });

  return router;
}
