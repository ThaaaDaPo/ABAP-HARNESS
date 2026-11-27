// Baut den HTTP-Server: Schnittstelle unter /api, darunter die Oberfläche.
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer as erstelleViteServer } from "vite";
import type { StatusAntwort } from "../../gemeinsam/typen.ts";
import type { ChatDienst } from "../chat/chat-dienst.ts";
import { abonniere, uebersichtKanal } from "../chat/live-verteiler.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import { projektOrdner, type Einstellungen } from "../einstellungen.ts";
import { Fehler } from "../fehler.ts";
import { verbrauchsUebersicht } from "../datenbank/verbrauch.ts";
import { pruefeEinrichtung } from "../einrichtung/pruefungen.ts";
import type { AgentenLaufzeit } from "../laufzeit/laufzeit.ts";
import type { AenderungenDienst } from "../adt/aenderungen-dienst.ts";
import type { SsoAnmeldung } from "../adt/sso-anmeldung.ts";
import { routenAdt } from "./routen-adt.ts";
import { routenAgenten } from "./routen-agenten.ts";
import { routenAufgaben } from "./routen-aufgaben.ts";
import { routenInstructions } from "./routen-instructions.ts";
import { routenMcp } from "./routen-mcp.ts";
import { routenPostfach } from "./routen-postfach.ts";
import type { PostfachDienst } from "../postfach/postfach-dienst.ts";

export async function erstelleHttpServer(
  einstellungen: Einstellungen,
  db: Datenbank,
  laufzeit: AgentenLaufzeit,
  chat: ChatDienst,
  postfach: PostfachDienst,
  adt: { sso: SsoAnmeldung; schluessel: string; aenderungen: AenderungenDienst },
) {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/status", (_anfrage, antwort) => {
    const status: StatusAntwort = { modus: einstellungen.modus, workspaceOrdner: einstellungen.workspaceOrdner };
    antwort.json(status);
  });

  // Modelle zur Auswahl im Chat. Bei Copilot startet das den Client, falls er noch nicht läuft.
  app.get("/api/modelle", async (_anfrage, antwort) => {
    antwort.json(await chat.modelle());
  });

  app.use("/api/aufgaben", routenAufgaben(db, chat, postfach));
  app.use("/api/agenten", routenAgenten(db, chat));
  app.use("/api/instructions", routenInstructions(db, chat, einstellungen.instructionsOrdner));
  app.use("/api/mcp", routenMcp(db, chat));
  app.use("/api/adt", routenAdt(db, einstellungen, chat, adt.sso, adt.schluessel, adt.aenderungen));
  app.use("/api/postfach", routenPostfach(postfach));

  app.get("/api/verbrauch", (_anfrage, antwort) => {
    antwort.json(verbrauchsUebersicht(db));
  });

  // Einrichtung prüfen. ?mcp=starten startet die MCP-Server dabei wirklich (kann dauern).
  app.get("/api/einrichtung", async (anfrage, antwort) => {
    antwort.json(await pruefeEinrichtung(einstellungen, db, laufzeit, adt.sso, anfrage.query.mcp === "starten"));
  });

  // Live-Hinweise für alle Fenster: Aufgaben oder Postfach haben sich geändert
  app.get("/api/uebersicht/live", (_anfrage, antwort) => abonniere(uebersichtKanal, antwort));

  // Fehler aus den Routen als lesbare JSON-Antwort zurückgeben
  app.use("/api", (fehler: unknown, _anfrage: Request, antwort: Response, _weiter: NextFunction) => {
    const status = fehler instanceof Fehler ? fehler.status : 500;
    const meldung = fehler instanceof Error ? fehler.message : String(fehler);
    if (status === 500) console.error(fehler);
    antwort.status(status).json({ meldung });
  });

  // Die Oberfläche liefert Vite aus. So braucht es keinen eigenen Bau-Schritt und nur einen Startbefehl.
  const oberflaecheOrdner = path.join(projektOrdner, "oberflaeche");
  const vite = await erstelleViteServer({
    root: oberflaecheOrdner,
    configFile: path.join(oberflaecheOrdner, "vite.config.ts"),
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);

  return { app, vite };
}
