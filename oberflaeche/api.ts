// Alle Aufrufe an den Server an einer Stelle.
import type {
  Aufgabe,
  AufgabeMitVerlauf,
  McpServer,
  McpServerDaten,
  ModellInfo,
  ModellWahl,
  PostfachEintrag,
  StatusAntwort,
  ToolRegel,
} from "../gemeinsam/typen.ts";

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

export const holePostfachDerAufgabe = (id: string) => anfrage<PostfachEintrag[]>(`/aufgaben/${id}/postfach`);

export const loescheAufgabe = (id: string) => anfrage(`/aufgaben/${id}`, { method: "DELETE" });

export const holeModelle = () => anfrage<ModellInfo[]>("/modelle");

export const setzeModellWahl = (id: string, wahl: ModellWahl) =>
  anfrage<Aufgabe>(`/aufgaben/${id}/modell`, { method: "PUT", body: JSON.stringify(wahl) });

export const sendeNachricht = (id: string, text: string) =>
  anfrage(`/aufgaben/${id}/nachrichten`, { method: "POST", body: JSON.stringify({ text }) });

export const brecheAb = (id: string) => anfrage(`/aufgaben/${id}/abbrechen`, { method: "POST" });

/** Adresse für die Live-Ereignisse einer Aufgabe */
export const liveAdresse = (id: string) => `/api/aufgaben/${id}/live`;

// MCP-Server und Regeln. Jede Änderung liefert die vollständige, aktuelle Liste zurück.

export const holeMcpServer = () => anfrage<McpServer[]>("/mcp");

export const legeMcpServerAn = (daten: McpServerDaten) =>
  anfrage<McpServer[]>("/mcp", { method: "POST", body: JSON.stringify(daten) });

export const aendereMcpServer = (daten: McpServerDaten) =>
  anfrage<McpServer[]>(`/mcp/${daten.schluessel}`, { method: "PUT", body: JSON.stringify(daten) });

export const loescheMcpServer = (schluessel: string) => anfrage<McpServer[]>(`/mcp/${schluessel}`, { method: "DELETE" });

export const leseMcpTools = (schluessel: string) => anfrage<McpServer[]>(`/mcp/${schluessel}/tools-lesen`, { method: "POST" });

/** tool "*" = Standardregel des Servers; regel "standard" = eigene Regel des Tools entfernen */
export const setzeToolRegel = (schluessel: string, tool: string, regel: ToolRegel | "standard") =>
  anfrage<McpServer[]>(`/mcp/${schluessel}/regeln/${encodeURIComponent(tool)}`, {
    method: "PUT",
    body: JSON.stringify({ regel }),
  });

// Postfach. Jede Aktion liefert die vollständige, aktuelle Liste zurück.

export const holePostfach = () => anfrage<PostfachEintrag[]>("/postfach");

export const holeAnzahlOffen = () => anfrage<{ anzahl: number }>("/postfach/anzahl-offen");

export const freigeben = (nr: number) => anfrage<PostfachEintrag[]>(`/postfach/${nr}/freigeben`, { method: "POST" });

export const verwerfen = (nr: number) => anfrage<PostfachEintrag[]>(`/postfach/${nr}/verwerfen`, { method: "POST" });

export const zurKenntnis = (nr: number) => anfrage<PostfachEintrag[]>(`/postfach/${nr}/zur-kenntnis`, { method: "POST" });

export const antworten = (nr: number, text: string) =>
  anfrage<PostfachEintrag[]>(`/postfach/${nr}/antworten`, { method: "POST", body: JSON.stringify({ text }) });

/** Live-Hinweise: Aufgaben oder Postfach haben sich geändert */
export const uebersichtAdresse = "/api/uebersicht/live";
