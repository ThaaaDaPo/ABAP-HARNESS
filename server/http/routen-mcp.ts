// HTTP-Schnittstelle für MCP-Server. Die Regeln je Tool stehen beim Agenten (routen-agenten.ts).
// Jede Änderung meldet der Chat-Dienst weiter, damit offene Sitzungen die neuen Server bekommen.
import { Router } from "express";
import type { ChatDienst } from "../chat/chat-dienst.ts";
import { entferneServerUeberall } from "../datenbank/agenten.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import { holeServer, loescheServer } from "../datenbank/mcp-server.ts";
import { Fehler } from "../fehler.ts";
import * as mcp from "../mcp/mcp-dienst.ts";

export function routenMcp(db: Datenbank, chat: ChatDienst): Router {
  const router = Router();
  const alleServer = () => mcp.holeServerUebersicht(db);

  // Nach jeder Änderung bekommt die Oberfläche die vollständige, aktuelle Liste zurück.
  async function fertig(antwort: { json: (daten: unknown) => void }) {
    await chat.konfigurationGeaendert();
    antwort.json(alleServer());
  }

  router.get("/", (_anfrage, antwort) => {
    antwort.json(alleServer());
  });

  // Server eintragen und gleich seine Tools auslesen. Benutzen darf ihn ein Agent erst, wenn er ihm
  // auf der Agenten-Seite zugeordnet ist.
  router.post("/", async (anfrage, antwort) => {
    const daten = mcp.pruefeEingabe(anfrage.body);
    mcp.legeAn(db, daten);
    await mcp.leseTools(db, daten.schluessel);
    await fertig(antwort);
  });

  // Den eingebauten ADT-MCP setzt die App selbst; eingestellt wird er unter /api/adt.
  const nichtEingebaut = (schluessel: string) => {
    if (holeServer(db, schluessel)?.eingebaut) throw new Fehler(409, "Der eingebaute Server lässt sich nicht ändern oder löschen – eingestellt wird er im eigenen Formular.");
  };

  // Name und Startbefehl ändern (der Schlüssel bleibt)
  router.put("/:schluessel", async (anfrage, antwort) => {
    nichtEingebaut(anfrage.params.schluessel);
    mcp.aendere(db, mcp.pruefeEingabe({ ...anfrage.body, schluessel: anfrage.params.schluessel }));
    await fertig(antwort);
  });

  router.delete("/:schluessel", async (anfrage, antwort) => {
    nichtEingebaut(anfrage.params.schluessel);
    loescheServer(db, anfrage.params.schluessel);
    entferneServerUeberall(db, anfrage.params.schluessel);
    await fertig(antwort);
  });

  // Tools neu auslesen (startet den Server kurz)
  router.post("/:schluessel/tools-lesen", async (anfrage, antwort) => {
    await mcp.leseTools(db, anfrage.params.schluessel);
    await fertig(antwort);
  });

  return router;
}
