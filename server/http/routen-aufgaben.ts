// HTTP-Schnittstelle für Aufgaben (Chats).
import { Router } from "express";
import type { AufgabeMitVerlauf } from "../../gemeinsam/typen.ts";
import type { ChatDienst } from "../chat/chat-dienst.ts";
import type { PostfachDienst } from "../postfach/postfach-dienst.ts";
import { abonniere } from "../chat/live-verteiler.ts";
import * as aufgaben from "../datenbank/aufgaben.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import { holeEreignisse } from "../datenbank/ereignisse.ts";
import { summeDerAufgabe } from "../datenbank/verbrauch.ts";

export function routenAufgaben(db: Datenbank, chat: ChatDienst, postfach: PostfachDienst): Router {
  const router = Router();

  // Alle Chats, neueste zuerst. Aufgaben von Workflows zeigt die Lauf-Ansicht.
  router.get("/", (_anfrage, antwort) => {
    antwort.json(aufgaben.holeChats(db).map(aufgaben.oeffentlich));
  });

  // Neue Aufgabe anlegen (leere Chats werden dabei weggeräumt). Ohne Angabe: Standard-Agent.
  router.post("/", async (anfrage, antwort) => {
    const agentId = anfrage.body?.agentId ? String(anfrage.body.agentId) : undefined;
    antwort.status(201).json(aufgaben.oeffentlich(await chat.neueAufgabe(agentId)));
  });

  // Chat löschen, mit Verlauf und Postfach-Einträgen
  router.delete("/:id", async (anfrage, antwort) => {
    await chat.loescheAufgabe(anfrage.params.id);
    antwort.json({ geloescht: true });
  });

  // Modell, Thinking Effort und Kontext des Chats
  router.put("/:id/modell", async (anfrage, antwort) => {
    const roh = anfrage.body ?? {};
    const wahl = {
      modell: String(roh.modell ?? ""),
      denkaufwand: String(roh.denkaufwand ?? ""),
      kontext: roh.kontext === "lang" ? ("lang" as const) : ("standard" as const),
    };
    antwort.json(aufgaben.oeffentlich(await chat.setzeModellWahl(anfrage.params.id, wahl)));
  });

  // Agent des Chats wechseln (E-56) – gilt ab der nächsten Nachricht
  router.put("/:id/agent", (anfrage, antwort) => {
    antwort.json(aufgaben.oeffentlich(chat.setzeAgent(anfrage.params.id, String(anfrage.body?.agentId ?? ""))));
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
      postfach: postfach.fuerAufgabe(aufgabe.id),
      verbrauch: summeDerAufgabe(db, aufgabe.id),
    };
    antwort.json(ergebnis);
  });

  // Was der Chat bisher verbraucht hat (zum Neuladen nach einem Lauf)
  router.get("/:id/verbrauch", (anfrage, antwort) => {
    antwort.json(summeDerAufgabe(db, anfrage.params.id));
  });

  // Vorschläge und Rückfragen des Chats (zum Neuladen nach Änderungen)
  router.get("/:id/postfach", (anfrage, antwort) => {
    antwort.json(postfach.fuerAufgabe(anfrage.params.id));
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
