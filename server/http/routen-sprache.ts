// HTTP-Schnittstelle der Seite „Sprechen“. Das Mikrofon kommt als rohe Float32-Daten (16 kHz),
// alles andere als JSON. Live-Ereignisse je Gespräch über Server-Sent Events.
import express, { Router } from "express";
import { Fehler } from "../fehler.ts";
import type { SprachDienst } from "../sprache/sprach-dienst.ts";

export function routenSprache(sprache: SprachDienst): Router {
  const router = Router();

  router.get("/", (_anfrage, antwort) => {
    antwort.json(sprache.status());
  });

  // Fehlende Modelle laden (erneut versuchen)
  router.post("/modelle/laden", (_anfrage, antwort) => {
    sprache.ladeModelle();
    antwort.json(sprache.status());
  });

  router.post("/gespraeche", async (_anfrage, antwort) => {
    antwort.status(201).json({ id: await sprache.neuesGespraech() });
  });

  // Schließt der Browser die Verbindung (Seite verlassen, Fenster zu), endet das Gespräch.
  router.get("/gespraeche/:id/live", (anfrage, antwort) => {
    const id = anfrage.params.id;
    const abmelden = sprache.abonniere(id, (ereignis) => antwort.write(`data: ${JSON.stringify(ereignis)}\n\n`));
    antwort.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
    antwort.write(": verbunden\n\n");
    antwort.on("close", () => {
      abmelden();
      void sprache.beende(id);
    });
  });

  router.post("/gespraeche/:id/audio", express.raw({ type: "application/octet-stream", limit: "4mb" }), (anfrage, antwort) => {
    const roh = anfrage.body;
    if (!Buffer.isBuffer(roh) || roh.length % 4 !== 0) throw new Fehler(400, "Audio muss aus Float32-Werten bestehen.");
    // Kopieren: Ein Float32Array braucht einen Speicheranfang, der durch 4 teilbar ist.
    const samples = new Float32Array(new Uint8Array(roh).buffer);
    sprache.gespraech(anfrage.params.id).nimmAudio(samples);
    antwort.status(204).end();
  });

  router.post("/gespraeche/:id/text", (anfrage, antwort) => {
    const text = String(anfrage.body?.text ?? "").trim();
    if (!text) throw new Fehler(400, "Bitte einen Text angeben.");
    sprache.gespraech(anfrage.params.id).nimmText(text);
    antwort.status(204).end();
  });

  router.post("/gespraeche/:id/unterbrechen", async (anfrage, antwort) => {
    await sprache.gespraech(anfrage.params.id).unterbreche();
    antwort.status(204).end();
  });

  router.post("/gespraeche/:id/stumm", (anfrage, antwort) => {
    sprache.gespraech(anfrage.params.id).stumm();
    antwort.status(204).end();
  });

  router.put("/gespraeche/:id/tempo", (anfrage, antwort) => {
    const tempo = Number(anfrage.body?.tempo);
    if (!(tempo >= 0.5 && tempo <= 2)) throw new Fehler(400, "Tempo muss zwischen 0,5 und 2 liegen.");
    sprache.gespraech(anfrage.params.id).tempo = tempo;
    antwort.status(204).end();
  });

  router.delete("/gespraeche/:id", async (anfrage, antwort) => {
    await sprache.beende(anfrage.params.id);
    antwort.status(204).end();
  });

  return router;
}
