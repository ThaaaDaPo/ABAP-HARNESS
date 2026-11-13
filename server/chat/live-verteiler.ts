// Verteilt Ereignisse live an alle offenen Browser-Fenster (Server-Sent Events).
// Jedes Fenster abonniert genau eine Aufgabe.
import type { Response } from "express";
import type { Ereignis } from "../../gemeinsam/typen.ts";

const abonnenten = new Map<string, Set<Response>>();

export function abonniere(aufgabeId: string, antwort: Response): void {
  antwort.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  antwort.write(": verbunden\n\n");

  const liste = abonnenten.get(aufgabeId) ?? new Set();
  liste.add(antwort);
  abonnenten.set(aufgabeId, liste);

  antwort.on("close", () => {
    liste.delete(antwort);
    if (liste.size === 0) abonnenten.delete(aufgabeId);
  });
}

export function verteile(aufgabeId: string, ereignis: Ereignis): void {
  for (const antwort of abonnenten.get(aufgabeId) ?? []) {
    antwort.write(`data: ${JSON.stringify(ereignis)}\n\n`);
  }
}
