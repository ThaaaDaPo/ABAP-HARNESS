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

/** Antwort von GET /api/status */
export interface StatusAntwort {
  modus: "simulation" | "copilot";
  modell: string;
  agentName: string;
  workspaceOrdner: string;
}
