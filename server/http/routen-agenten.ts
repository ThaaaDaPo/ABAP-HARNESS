// HTTP-Schnittstelle für Agenten und ihre Regeln je Tool.
// Jede Änderung meldet der Chat-Dienst weiter: Sitzungen ohne Lauf werden mit der neuen
// Konfiguration fortgesetzt, laufende vor ihrem nächsten Lauf.
import { Router } from "express";
import * as dienst from "../agenten/agenten-dienst.ts";
import type { ChatDienst } from "../chat/chat-dienst.ts";
import * as agenten from "../datenbank/agenten.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import { istRegel } from "../datenbank/tool-regeln.ts";
import { Fehler } from "../fehler.ts";
import * as mcp from "../mcp/mcp-dienst.ts";

export function routenAgenten(db: Datenbank, chat: ChatDienst): Router {
  const router = Router();

  router.get("/", (_anfrage, antwort) => {
    antwort.json(agenten.holeAlleAgenten(db));
  });

  // Neuer Agent mit Standardwerten (alle Server, überall Freigabe); bearbeitet wird danach.
  router.post("/", (_anfrage, antwort) => {
    antwort.status(201).json(dienst.legeNeuenAn(db));
  });

  router.put("/:id", async (anfrage, antwort) => {
    dienst.holeVorhandenen(db, anfrage.params.id);
    const daten = dienst.pruefeEingabe(db, anfrage.body);
    await chat.pruefeModellWahl(daten.modellWahl);
    agenten.aendereAgent(db, anfrage.params.id, daten);
    await chat.konfigurationGeaendert();
    antwort.json(agenten.holeAgent(db, anfrage.params.id));
  });

  router.post("/:id/kopieren", (anfrage, antwort) => {
    antwort.status(201).json(dienst.kopiere(db, anfrage.params.id));
  });

  // Seine Chats übernimmt der Standard-Agent
  router.delete("/:id", async (anfrage, antwort) => {
    if (chat.agentArbeitet(anfrage.params.id)) throw new Fehler(409, "Der Agent arbeitet gerade in einem Chat. Bitte warten oder dort abbrechen.");
    dienst.loesche(db, anfrage.params.id);
    await chat.konfigurationGeaendert();
    antwort.json({ geloescht: true });
  });

  // Alle Server mit den Regeln dieses Agenten
  router.get("/:id/regeln", (anfrage, antwort) => {
    dienst.holeVorhandenen(db, anfrage.params.id);
    antwort.json(dienst.regelnDesAgenten(db, anfrage.params.id));
  });

  // Regel für ein Tool setzen. Tool "*" = Standardregel des Servers, Regel "standard" = eigene Regel entfernen.
  // Wirkt sofort, auch für Agenten, die gerade arbeiten (das Gateway liest bei jedem Aufruf neu).
  router.put("/:id/regeln/:server/:tool", async (anfrage, antwort) => {
    const { id, server, tool } = anfrage.params;
    dienst.holeVorhandenen(db, id);
    const regel = anfrage.body?.regel;
    if (!istRegel(regel) && regel !== "standard") throw new Fehler(400, `Unbekannte Regel ${regel}`);
    mcp.setzeRegel(db, id, server, tool, regel);
    // Verbieten bzw. Erlauben ändert, welche Tools angeboten werden – das braucht eine neue Sitzung.
    await chat.konfigurationGeaendert();
    antwort.json(dienst.regelnDesAgenten(db, id));
  });

  return router;
}
