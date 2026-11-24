// Typen, die Server und Oberfläche gemeinsam nutzen.
// Hier stehen nur Typen, kein ausführbarer Code: Beide Seiten binden die Datei mit
// `import type` ein, dadurch verschwindet der Import beim Ausführen vollständig.

/**
 * Wo eine Aufgabe gerade steht:
 * - bereit:      wartet auf eine Nachricht von David
 * - eingereiht:  Arbeit liegt in der Warteschlange, der Agent ist noch mit etwas anderem beschäftigt
 * - arbeitet:    der Agent arbeitet daran
 * - wartet:      wartet auf das Postfach (Freigabe oder Antwort auf eine Rückfrage)
 * - erledigt:    abgeschlossen, z. B. nach der Freigabe zum Abschluss
 * - abgebrochen: im Postfach verworfen
 */
export type AufgabenStatus = "bereit" | "eingereiht" | "arbeitet" | "wartet" | "erledigt" | "abgebrochen";

/** Eine Aufgabe ist ein Gespräch mit einem Agenten (später auch zeitgesteuert oder aus einem Workflow). */
export interface Aufgabe {
  id: string;
  titel: string;
  status: AufgabenStatus;
  erstelltAm: string;
  modellWahl: ModellWahl;
}

/** Welches Modell ein Chat benutzt. Gilt ab der nächsten Nachricht. */
export interface ModellWahl {
  /** Leer = Standard aus einstellungen.json (dort leer = automatische Auswahl) */
  modell: string;
  /** Thinking Effort, z. B. "high". Leer = Standard des Modells */
  denkaufwand: string;
  /** "lang" nur bei Modellen mit langem Kontext */
  kontext: "standard" | "lang";
}

/** Ein Modell, wie die Laufzeit es anbietet (bei Copilot aus listModels). */
export interface ModellInfo {
  id: string;
  name: string;
  /** Mögliche Stufen für den Thinking Effort. Leer = nicht einstellbar */
  denkStufen: string[];
  standardDenkStufe: string | null;
  /** Größe des Context Windows in Tokens (Standard), falls bekannt */
  kontextStandard: number | null;
  /** Das Modell bietet zusätzlich einen langen Kontext an */
  langerKontext: boolean;
  /** Größe des langen Context Windows in Tokens, falls bekannt */
  kontextLang: number | null;
  /** Kostenfaktor gegenüber dem Basismodell, falls bekannt */
  multiplikator: number | null;
}

/** Alles, was während einer Aufgabe passiert. */
export type Ereignis =
  | { art: "nutzer_nachricht"; text: string }
  | { art: "agent_nachricht"; text: string }
  /** Ein Stück Text, während der Agent noch schreibt. Wird nur live gezeigt, nicht gespeichert. */
  | { art: "agent_schreibt"; textTeil: string }
  /** Welches Modell geantwortet hat (Copilot meldet das nach jedem Modellaufruf). */
  | { art: "modell"; modell: string }
  | { art: "tool_start"; aufrufId: string; toolName: string; argumente: unknown }
  | { art: "tool_ende"; aufrufId: string; erfolgreich: boolean; ergebnis: string }
  /** Ein Eintrag wurde ins Postfach gelegt (Freigabe nötig, Meldung oder Rückfrage). */
  | { art: "postfach"; postfachNr: number; eintragsArt: PostfachArt; toolName: string }
  /** David hat im Postfach gehandelt (freigegeben, verworfen, geantwortet …). */
  | { art: "postfach_aktion"; postfachNr: number; text: string; details?: string }
  /** Statuswechsel der Aufgabe. Wird nur live gezeigt, nicht gespeichert. */
  | { art: "status"; status: AufgabenStatus }
  | { art: "fehler"; meldung: string };

/** Ein Ereignis, wie es in der Datenbank liegt. */
export type GespeichertesEreignis = Ereignis & { nr: number; zeitpunkt: string };

/** Antwort von GET /api/aufgaben/:id */
export interface AufgabeMitVerlauf {
  aufgabe: Aufgabe;
  ereignisse: GespeichertesEreignis[];
  /** Vorschläge und Rückfragen des Chats – im Chat freigegeben bzw. beantwortet (E-52) */
  postfach: PostfachEintrag[];
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

export type PostfachArt = "freigabe" | "meldung" | "rueckfrage";

/**
 * - offen:                 wartet auf David
 * - fehlgeschlagen:        freigegeben, aber die Ausführung ging schief; kann erneut freigegeben werden
 * - freigegeben:           von der Plattform ausgeführt
 * - verworfen:             nicht ausgeführt, Aufgabe abgebrochen
 * - aenderung_angefordert: nicht ausgeführt, der Agent überarbeitet
 * - beantwortet:           Rückfrage oder Meldung beantwortet
 * - zur_kenntnis:          Meldung gelesen
 */
export type PostfachStatus =
  | "offen"
  | "fehlgeschlagen"
  | "freigegeben"
  | "verworfen"
  | "aenderung_angefordert"
  | "beantwortet"
  | "zur_kenntnis";

/** Ein Postfach-Eintrag, wie die Oberfläche ihn bekommt. */
export interface PostfachEintrag {
  nr: number;
  aufgabeId: string;
  aufgabeTitel: string;
  art: PostfachArt;
  /** Bei Rückfragen leer */
  server: string;
  tool: string;
  /** Bei Rückfragen { frage } */
  argumente: unknown;
  /** Meldung: was das Tool geliefert hat. Freigabe: Ergebnis der Ausführung. */
  ergebnis: string | null;
  /** Davids Antwort oder Änderungswunsch */
  antwort: string | null;
  status: PostfachStatus;
  /**
   * Nur bei Freigaben: Der Agent braucht das Ergebnis und hat die Aufgabe pausiert (E-45).
   * Sonst ist es eine Freigabe zum Abschluss (E-44): nach dem Freigeben ist die Aufgabe erledigt.
   */
  weiterNachFreigabe: boolean;
  erstelltAm: string;
  erledigtAm: string | null;
}

/** Live-Hinweis an alle Fenster: Aufgaben oder Postfach haben sich geändert, bitte neu laden. */
export type UebersichtsEreignis = { bereich: "aufgaben" } | { bereich: "postfach" };

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
