// HTTP-Schnittstelle für MCP-Server und die Regeln des Tool-Gateways.
// Jede Änderung meldet der Chat-Dienst weiter, damit offene Sitzungen die neuen Server bekommen.
import { Router } from "express";
import type { ChatDienst } from "../chat/chat-dienst.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import { loescheServer } from "../datenbank/mcp-server.ts";
import { istRegel } from "../datenbank/tool-regeln.ts";
import { Fehler } from "../fehler.ts";
import { standardAgentId } from "../gateway/gateway.ts";
import * as mcp from "../mcp/mcp-dienst.ts";

export function routenMcp(db: Datenbank, chat: ChatDienst): Router {
  const router = Router();
  const alleServer = () => mcp.holeServerMitRegeln(db, standardAgentId);

  // Nach jeder Änderung bekommt die Oberfläche die vollständige, aktuelle Liste zurück.
  async function fertig(antwort: { json: (daten: unknown) => void }) {
    await chat.konfigurationGeaendert();
    antwort.json(alleServer());
  }

  router.get("/", (_anfrage, antwort) => {
    antwort.json(alleServer());
  });

  // Server eintragen und gleich seine Tools auslesen
  router.post("/", async (anfrage, antwort) => {
    const daten = mcp.pruefeEingabe(anfrage.body);
    mcp.legeAn(db, daten);
    await mcp.leseTools(db, daten.schluessel);
    await fertig(antwort);
  });

  // Name und Startbefehl ändern (der Schlüssel bleibt)
  router.put("/:schluessel", async (anfrage, antwort) => {
    mcp.aendere(db, mcp.pruefeEingabe({ ...anfrage.body, schluessel: anfrage.params.schluessel }));
    await fertig(antwort);
  });

  router.delete("/:schluessel", async (anfrage, antwort) => {
    loescheServer(db, anfrage.params.schluessel);
    await fertig(antwort);
  });

  // Tools neu auslesen (startet den Server kurz)
  router.post("/:schluessel/tools-lesen", async (anfrage, antwort) => {
    await mcp.leseTools(db, anfrage.params.schluessel);
    await fertig(antwort);
  });

  // Regel für ein Tool setzen. Tool "*" = Standardregel des Servers, Regel "standard" = eigene Regel entfernen.
  router.put("/:schluessel/regeln/:tool", async (anfrage, antwort) => {
    const regel = anfrage.body?.regel;
    if (!istRegel(regel) && regel !== "standard") throw new Fehler(400, `Unbekannte Regel ${regel}`);
    mcp.setzeRegel(db, standardAgentId, anfrage.params.schluessel, anfrage.params.tool, regel);
    await fertig(antwort);
  });

  return router;
}
