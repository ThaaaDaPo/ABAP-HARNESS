// HTTP-Schnittstelle für Instructions und Skills im Instructions-Ordner (E-30, E-58).
// Zugeordnet werden sie auf der Agenten-Seite; hier nur anzeigen, anlegen und bearbeiten.
import { Router } from "express";
import type { InstructionsUebersicht } from "../../gemeinsam/typen.ts";
import type { ChatDienst } from "../chat/chat-dienst.ts";
import { holeAlleAgenten } from "../datenbank/agenten.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import { Fehler } from "../fehler.ts";
import * as ordner from "../instructions/instructions-ordner.ts";

export function routenInstructions(db: Datenbank, chat: ChatDienst, instructionsOrdner: string): Router {
  const router = Router();

  function uebersicht(): InstructionsUebersicht {
    let gefunden: ReturnType<typeof ordner.durchsuche>;
    try {
      gefunden = ordner.durchsuche(instructionsOrdner);
    } catch (fehler) {
      return { ordner: instructionsOrdner, fehler: (fehler as Error).message, instructions: [], skills: [] };
    }
    const agenten = holeAlleAgenten(db);
    const namen = (liste: (a: (typeof agenten)[number]) => string[], pfad: string) =>
      agenten.filter((a) => liste(a).includes(pfad)).map((a) => a.name);
    return {
      ordner: instructionsOrdner,
      fehler: null,
      instructions: gefunden.instructions.map((i) => ({ ...i, agenten: namen((a) => a.instructions, i.pfad) })),
      skills: gefunden.skills.map((s) => ({ ...s, agenten: namen((a) => a.skills, s.pfad) })),
    };
  }

  router.get("/", (_anfrage, antwort) => {
    antwort.json(uebersicht());
  });

  // Inhalt einer Datei (Pfad relativ zum Ordner, z. B. "abap.instructions.md" oder "review/SKILL.md")
  router.get("/datei", (anfrage, antwort) => {
    const pfad = String(anfrage.query.pfad ?? "");
    antwort.json({ pfad, inhalt: ordner.liesDatei(instructionsOrdner, pfad) });
  });

  // Speichern wirkt ab der nächsten Nachricht: Sitzungen werden mit dem neuen Inhalt fortgesetzt.
  router.put("/datei", async (anfrage, antwort) => {
    const pfad = String(anfrage.body?.pfad ?? "");
    const inhalt = anfrage.body?.inhalt;
    if (typeof inhalt !== "string") throw new Fehler(400, "Inhalt fehlt.");
    ordner.schreibeDatei(instructionsOrdner, pfad, inhalt);
    await chat.konfigurationGeaendert();
    antwort.json(uebersicht());
  });

  // Neue Instruction-Datei bzw. neuer Skill-Ordner; die Antwort nennt den Pfad zum Öffnen.
  router.post("/neu", (anfrage, antwort) => {
    const name = String(anfrage.body?.name ?? "").trim();
    const pfad =
      anfrage.body?.art === "skill"
        ? `${ordner.legeSkillAn(instructionsOrdner, name)}/SKILL.md`
        : ordner.legeInstructionAn(instructionsOrdner, name);
    antwort.status(201).json({ pfad, uebersicht: uebersicht() });
  });

  return router;
}
