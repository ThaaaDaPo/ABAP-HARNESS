// HTTP-Schnittstelle für Aufgaben (Chats).
import { Router } from "express";
import type { AufgabeMitVerlauf } from "../../gemeinsam/typen.ts";
import type { ChatDienst } from "../chat/chat-dienst.ts";
import { abonniere } from "../chat/live-verteiler.ts";
import * as aufgaben from "../datenbank/aufgaben.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import { holeEreignisse } from "../datenbank/ereignisse.ts";

export function routenAufgaben(db: Datenbank, chat: ChatDienst): Router {
  const router = Router();

  // Alle Aufgaben, neueste zuerst
  router.get("/", (_anfrage, antwort) => {
    antwort.json(aufgaben.holeAlleAufgaben(db).map(aufgaben.oeffentlich));
  });

  // Neue Aufgabe anlegen
  router.post("/", (_anfrage, antwort) => {
    antwort.status(201).json(aufgaben.oeffentlich(chat.neueAufgabe()));
  });

  // Eine Aufgabe mit ihrem bisherigen Verlauf
  router.get("/:id", (anfrage, antwort) => {
    const aufgabe = aufgaben.holeAufgabe(db, anfrage.params.id);
    if (!aufgabe) {
      antwort.status(404).json({ meldung: "Aufgabe nicht gefunden" });
      return;
    }
    const ergebnis: AufgabeMitVerlauf = {
      aufgabe: aufgaben.oeffentlich(aufgabe),
      ereignisse: holeEreignisse(db, aufgabe.id),
    };
    antwort.json(ergebnis);
  });

  // Nachricht an den Agenten
  router.post("/:id/nachrichten", (anfrage, antwort) => {
    const text = String(anfrage.body?.text ?? "").trim();
    if (!text) {
      antwort.status(400).json({ meldung: "Die Nachricht ist leer" });
      return;
    }
    chat.nimmNachrichtAn(anfrage.params.id, text);
    antwort.status(202).json({ angenommen: true });
  });

  // Agent anhalten
  router.post("/:id/abbrechen", async (anfrage, antwort) => {
    await chat.brecheAb(anfrage.params.id);
    antwort.json({ abgebrochen: true });
  });

  // Live-Ereignisse (Server-Sent Events)
  router.get("/:id/live", (anfrage, antwort) => {
    abonniere(anfrage.params.id, antwort);
  });

  return router;
}
