// Verteilt Ereignisse live an alle offenen Browser-Fenster (Server-Sent Events).
// Ein Kanal ist entweder eine Aufgabe (ihr Verlauf) oder die Übersicht (Hinweis „Aufgaben oder
// Postfach haben sich geändert“ für Chat-Liste, Postfach-Seite und Zähler in der Navigation).
import type { Response } from "express";
import type { Ereignis, UebersichtsEreignis } from "../../gemeinsam/typen.ts";

const abonnenten = new Map<string, Set<Response>>();

/** Name des Kanals für die Übersicht. Kann mit keiner Aufgaben-Id verwechselt werden (das sind UUIDs). */
export const uebersichtKanal = "uebersicht";

export function abonniere(kanal: string, antwort: Response): void {
  antwort.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  antwort.write(": verbunden\n\n");

  const liste = abonnenten.get(kanal) ?? new Set();
  liste.add(antwort);
  abonnenten.set(kanal, liste);

  antwort.on("close", () => {
    liste.delete(antwort);
    if (liste.size === 0) abonnenten.delete(kanal);
  });
}

function schicke(kanal: string, daten: unknown): void {
  for (const antwort of abonnenten.get(kanal) ?? []) {
    antwort.write(`data: ${JSON.stringify(daten)}\n\n`);
  }
}

export function verteile(aufgabeId: string, ereignis: Ereignis): void {
  schicke(aufgabeId, ereignis);
}

export function meldeUebersicht(ereignis: UebersichtsEreignis): void {
  schicke(uebersichtKanal, ereignis);
}
