// Alle Aufrufe an den Server an einer Stelle.
import type { Aufgabe, AufgabeMitVerlauf, McpServer, McpServerDaten, StatusAntwort, ToolRegel } from "../gemeinsam/typen.ts";

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
