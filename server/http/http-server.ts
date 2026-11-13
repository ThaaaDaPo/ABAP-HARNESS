// Baut den HTTP-Server: Schnittstelle unter /api, darunter die Oberfläche.
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer as erstelleViteServer } from "vite";
import type { StatusAntwort } from "../../gemeinsam/typen.ts";
import { Fehler, type ChatDienst } from "../chat/chat-dienst.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import { projektOrdner, type Einstellungen } from "../einstellungen.ts";
import { routenAufgaben } from "./routen-aufgaben.ts";

export async function erstelleHttpServer(einstellungen: Einstellungen, db: Datenbank, chat: ChatDienst) {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/status", (_anfrage, antwort) => {
    const status: StatusAntwort = {
      modus: einstellungen.modus,
      modell: einstellungen.modell || "automatisch",
      agentName: einstellungen.agent.name,
      workspaceOrdner: einstellungen.workspaceOrdner,
    };
    antwort.json(status);
  });

  app.use("/api/aufgaben", routenAufgaben(db, chat));

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
