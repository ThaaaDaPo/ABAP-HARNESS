// Alle Aufrufe an den Server an einer Stelle.
import type {
  AdtAenderung,
  AdtKonfiguration,
  AdtUebersicht,
  Agent,
  AgentDaten,
  Aufgabe,
  AufgabeMitVerlauf,
  EinrichtungsBericht,
  InstructionsUebersicht,
  McpServer,
  McpServerDaten,
  ModellInfo,
  ModellWahl,
  PostfachEintrag,
  ServerRegeln,
  StatusAntwort,
  ToolRegel,
  VerbrauchSumme,
  VerbrauchUebersicht,
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

export const legeAufgabeAn = (agentId?: string) => anfrage<Aufgabe>("/aufgaben", { method: "POST", body: JSON.stringify({ agentId }) });

export const holeAufgabe = (id: string) => anfrage<AufgabeMitVerlauf>(`/aufgaben/${id}`);

export const holePostfachDerAufgabe = (id: string) => anfrage<PostfachEintrag[]>(`/aufgaben/${id}/postfach`);

export const loescheAufgabe = (id: string) => anfrage(`/aufgaben/${id}`, { method: "DELETE" });

export const holeModelle = () => anfrage<ModellInfo[]>("/modelle");

export const setzeModellWahl = (id: string, wahl: ModellWahl) =>
  anfrage<Aufgabe>(`/aufgaben/${id}/modell`, { method: "PUT", body: JSON.stringify(wahl) });

export const setzeAgentDesChats = (id: string, agentId: string) =>
  anfrage<Aufgabe>(`/aufgaben/${id}/agent`, { method: "PUT", body: JSON.stringify({ agentId }) });

export const holeVerbrauchDesChats = (id: string) => anfrage<VerbrauchSumme>(`/aufgaben/${id}/verbrauch`);

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

// ADT-MCP: Konfiguration und SSO-Anmeldung

export const holeAdt = () => anfrage<AdtUebersicht>("/adt");

export const speichereAdt = (konfiguration: AdtKonfiguration) =>
  anfrage<AdtUebersicht>("/adt", { method: "PUT", body: JSON.stringify(konfiguration) });

/** Öffnet Edge und wartet, bis die SSO-Anmeldung da ist (bis 3 Minuten) */
export const adtAnmelden = () => anfrage<AdtUebersicht>("/adt/anmelden", { method: "POST" });

export const adtAbmelden = () => anfrage<AdtUebersicht>("/adt/abmelden", { method: "POST" });

export const adtVerbindungTesten = () => anfrage<{ text: string; uebersicht: AdtUebersicht }>("/adt/verbindung-testen", { method: "POST" });

/** Änderungssatz des ADT-MCP für den Vergleich im Chat */
export const holeAenderung = (id: string) => anfrage<AdtAenderung>(`/adt/aenderungen/${id}`);

export const nimmAenderungZurueck = (id: string, aufgabeId: string) =>
  anfrage<AdtAenderung>(`/adt/aenderungen/${id}/zuruecknehmen`, { method: "POST", body: JSON.stringify({ aufgabeId }) });

// Agenten und ihre Regeln je Tool

export const holeAgenten = () => anfrage<Agent[]>("/agenten");

export const legeAgentAn = () => anfrage<Agent>("/agenten", { method: "POST" });

export const speichereAgent = (id: string, daten: AgentDaten) => anfrage<Agent>(`/agenten/${id}`, { method: "PUT", body: JSON.stringify(daten) });

export const kopiereAgent = (id: string) => anfrage<Agent>(`/agenten/${id}/kopieren`, { method: "POST" });

export const loescheAgent = (id: string) => anfrage(`/agenten/${id}`, { method: "DELETE" });

export const holeRegelnDesAgenten = (id: string) => anfrage<ServerRegeln[]>(`/agenten/${id}/regeln`);

/** tool "*" = Standardregel des Servers; regel "standard" = eigene Regel des Tools entfernen */
export const setzeToolRegel = (agentId: string, server: string, tool: string, regel: ToolRegel | "standard") =>
  anfrage<ServerRegeln[]>(`/agenten/${agentId}/regeln/${server}/${encodeURIComponent(tool)}`, {
    method: "PUT",
    body: JSON.stringify({ regel }),
  });

// Instructions und Skills

export const holeInstructions = () => anfrage<InstructionsUebersicht>("/instructions");

export const holeInstructionDatei = (pfad: string) =>
  anfrage<{ pfad: string; inhalt: string }>(`/instructions/datei?pfad=${encodeURIComponent(pfad)}`);

export const speichereInstructionDatei = (pfad: string, inhalt: string) =>
  anfrage<InstructionsUebersicht>("/instructions/datei", { method: "PUT", body: JSON.stringify({ pfad, inhalt }) });

export const legeInstructionAn = (art: "instruction" | "skill", name: string) =>
  anfrage<{ pfad: string; uebersicht: InstructionsUebersicht }>("/instructions/neu", { method: "POST", body: JSON.stringify({ art, name }) });

// Verbrauch und Einrichtung

export const holeVerbrauch = () => anfrage<VerbrauchUebersicht>("/verbrauch");

/** mcpStarten: die MCP-Server dabei wirklich starten (kann dauern) */
export const pruefeEinrichtung = (mcpStarten: boolean) => anfrage<EinrichtungsBericht>(`/einrichtung${mcpStarten ? "?mcp=starten" : ""}`);

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
