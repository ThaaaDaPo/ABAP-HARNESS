// Alle Aufrufe an den Server an einer Stelle.
import type { Aufgabe, AufgabeMitVerlauf, StatusAntwort } from "../gemeinsam/typen.ts";

async function anfrage<T>(pfad: string, optionen: RequestInit = {}): Promise<T> {
  const antwort = await fetch(`/api${pfad}`, {
    ...optionen,
    headers: { "Content-Type": "application/json", ...optionen.headers },
  });
  const inhalt = await antwort.json().catch(() => ({}));
  if (!antwort.ok) throw new Error(inhalt.meldung ?? `Fehler ${antwort.status}`);
  return inhalt as T;
}

export const holeStatus = () => anfrage<StatusAntwort>("/status");

export const holeAufgaben = () => anfrage<Aufgabe[]>("/aufgaben");

export const legeAufgabeAn = () => anfrage<Aufgabe>("/aufgaben", { method: "POST" });

export const holeAufgabe = (id: string) => anfrage<AufgabeMitVerlauf>(`/aufgaben/${id}`);

export const sendeNachricht = (id: string, text: string) =>
  anfrage(`/aufgaben/${id}/nachrichten`, { method: "POST", body: JSON.stringify({ text }) });

export const brecheAb = (id: string) => anfrage(`/aufgaben/${id}/abbrechen`, { method: "POST" });

/** Adresse für die Live-Ereignisse einer Aufgabe */
export const liveAdresse = (id: string) => `/api/aufgaben/${id}/live`;
