// Typen, die Server und Oberfläche gemeinsam nutzen.
// Hier stehen nur Typen, kein ausführbarer Code: Beide Seiten binden die Datei mit
// `import type` ein, dadurch verschwindet der Import beim Ausführen vollständig.

/** Läuft der Agent gerade oder wartet er auf eine Nachricht? */
export type AufgabenStatus = "bereit" | "arbeitet";

/** Eine Aufgabe ist ein Gespräch mit einem Agenten (später auch zeitgesteuert oder aus einem Workflow). */
export interface Aufgabe {
  id: string;
  titel: string;
  status: AufgabenStatus;
  erstelltAm: string;
}

/** Alles, was während einer Aufgabe passiert. */
export type Ereignis =
  | { art: "nutzer_nachricht"; text: string }
  | { art: "agent_nachricht"; text: string }
  /** Ein Stück Text, während der Agent noch schreibt. Wird nur live gezeigt, nicht gespeichert. */
  | { art: "agent_schreibt"; textTeil: string }
  | { art: "tool_start"; aufrufId: string; toolName: string; argumente: unknown }
  | { art: "tool_ende"; aufrufId: string; erfolgreich: boolean; ergebnis: string }
  /** Das Tool-Gateway hat einen Eintrag ins Postfach gelegt (Freigabe nötig oder Meldung). */
  | { art: "postfach"; postfachNr: number; eintragsArt: PostfachArt; toolName: string }
  /** Statuswechsel der Aufgabe. Wird nur live gezeigt, nicht gespeichert. */
  | { art: "status"; status: AufgabenStatus }
  | { art: "fehler"; meldung: string };

/** Ein Ereignis, wie es in der Datenbank liegt. */
export type GespeichertesEreignis = Ereignis & { nr: number; zeitpunkt: string };

/** Antwort von GET /api/aufgaben/:id */
export interface AufgabeMitVerlauf {
  aufgabe: Aufgabe;
  ereignisse: GespeichertesEreignis[];
}

// ---------------------------------------------------------------------------------------------
// MCP-Server und Tool-Gateway
// ---------------------------------------------------------------------------------------------

/**
 * Was das Tool-Gateway mit einem Aufruf macht:
 * - erlauben:   wird ausgeführt
 * - melden:     wird ausgeführt, im Postfach erscheint eine Meldung
 * - freigabe:   wird NICHT ausgeführt, sondern als Vorschlag ins Postfach gelegt
 * - verbieten:  wird dem Agenten gar nicht angeboten und abgelehnt
 */
export type ToolRegel = "erlauben" | "melden" | "freigabe" | "verbieten";

export type PostfachArt = "freigabe" | "meldung";

/** Ein Tool, wie der MCP-Server es beim Auslesen beschreibt. */
export interface McpTool {
  name: string;
  beschreibung: string;
  /** Der Server sagt, das Tool ändert nichts (MCP-Angabe readOnlyHint). Nur ein Hinweis. */
  nurLesend: boolean;
}

/** Ein eingetragener MCP-Server (Start als Unterprozess über stdio). */
export interface McpServerDaten {
  /** Kurzname, z. B. "jira". Copilot nennt die Tools dann "jira-ticket_lesen". */
  schluessel: string;
  /** Anzeigename */
  name: string;
  befehl: string;
  argumente: string[];
  umgebung: Record<string, string>;
  /** Leer = Projektordner */
  arbeitsordner: string;
}

export interface McpServer extends McpServerDaten {
  /** Zuletzt ausgelesene Tools. Leer, solange noch nie ausgelesen. */
  tools: McpTool[];
  toolsGelesenAm: string | null;
  /** Fehler beim letzten Auslesen */
  leseFehler: string | null;
  /** Gilt für jedes Tool ohne eigene Regel, auch für Tools, die später neu dazukommen. */
  standardRegel: ToolRegel;
  /** Eigene Regeln je Tool-Name */
  regeln: Record<string, ToolRegel>;
}

/** Antwort von GET /api/status */
export interface StatusAntwort {
  modus: "simulation" | "copilot";
  modell: string;
  agentName: string;
  workspaceOrdner: string;
}
