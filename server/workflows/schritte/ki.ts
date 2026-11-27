// KI-Schritt: Ein Agent bearbeitet einen Auftrag in einer eigenen, frischen Sitzung – er sieht nichts
// von anderen KI-Schritten (ein Reviewer bestätigt so nicht einfach den Entwickler). Es gelten seine
// Regeln je Tool; braucht ein Aufruf eine Freigabe, wartet er darauf im Postfach bzw. im Chat (E-68).
// Mit Ergebnisfeldern muss er sein Ergebnis über ergebnis_melden liefern; sonst zählt seine Antwort.
import type { KiSchrittDaten } from "../../../gemeinsam/typen.ts";
import { holeAgent } from "../../datenbank/agenten.ts";
import { legeAufgabeAn } from "../../datenbank/aufgaben.ts";
import { holeEintraegeDerAufgabe } from "../../datenbank/postfach.ts";
import { setzeEinAlsText } from "../ausdruecke.ts";
import { ergebnisHinweis, ergebnisToolName, type ErgebnisAblage } from "../ergebnis-melden.ts";
import { LaufAbbruch, SchrittFehler, titelDes, type SchrittKontext } from "./gemeinsam.ts";

export async function kiSchritt(schritt: KiSchrittDaten, k: SchrittKontext): Promise<unknown> {
  const { db } = k.umgebung;
  const agent = holeAgent(db, schritt.agentId);
  if (!agent) throw new SchrittFehler(`Den Agenten ${schritt.agentId} gibt es nicht (mehr).`);

  const auftrag = setzeEinAlsText(schritt.auftrag, k.variablen);
  const aufgabe = legeAufgabeAn(db, `${k.lauf.workflowName} · ${titelDes(schritt)}`, agent.id, k.lauf.nr);
  k.vermerke({ eingabe: { agent: agent.name, auftrag }, aufgabeId: aufgabe.id });
  const ablage = k.umgebung.bereiteErgebnisVor(aufgabe.id, schritt.felder);

  try {
    return await arbeite(schritt, k, aufgabe.id, auftrag, ablage);
  } finally {
    await k.umgebung.raeumeAuf(aufgabe.id);
  }
}

async function arbeite(schritt: KiSchrittDaten, k: SchrittKontext, aufgabeId: string, auftrag: string, ablage: ErgebnisAblage): Promise<unknown> {
  const { chat } = k.umgebung;
  const mitFeldern = schritt.felder.length > 0;
  let antwort = await chat.arbeiteAn(aufgabeId, mitFeldern ? `${auftrag}\n\n${ergebnisHinweis(schritt.felder)}` : auftrag);
  pruefeAbbruch(k, aufgabeId, antwort.abgebrochen);

  if (mitFeldern && !ablage.wert && !antwort.fehler) {
    // Einmal nachfragen – Modelle vergessen das Tool manchmal am Ende.
    antwort = await chat.arbeiteAn(
      aufgabeId,
      `Du hast dein Ergebnis noch nicht mit ${ergebnisToolName} gemeldet. Hole das jetzt nach – nur dieser Aufruf, kein weiterer Text.`,
    );
    pruefeAbbruch(k, aufgabeId, antwort.abgebrochen);
  }
  if (antwort.fehler) throw new SchrittFehler(`Der Agent ist mit einem Fehler ausgestiegen: ${antwort.fehler}`);
  if (!mitFeldern) return antwort.text;
  if (!ablage.wert) throw new SchrittFehler(`Der Agent hat kein gültiges Ergebnis über ${ergebnisToolName} gemeldet.`);
  return ablage.wert;
}

/** Verworfen (Vorschlag oder Rückfrage), abgebrochen oder Limit erreicht: Der Lauf endet. */
function pruefeAbbruch(k: SchrittKontext, aufgabeId: string, abgebrochen: boolean): void {
  const grund = k.umgebung.abbruchGrund(k.lauf.nr);
  if (grund) throw new LaufAbbruch(grund);
  const verworfen = holeEintraegeDerAufgabe(k.umgebung.db, aufgabeId).find((e) => e.status === "verworfen" && e.aufgabeId === aufgabeId);
  if (verworfen) throw new LaufAbbruch(`Eintrag #${verworfen.nr} wurde verworfen.`);
  if (abgebrochen) throw new LaufAbbruch("Der KI-Schritt wurde abgebrochen.");
}
