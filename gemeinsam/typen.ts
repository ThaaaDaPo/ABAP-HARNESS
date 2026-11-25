// Typen, die Server und Oberfläche gemeinsam nutzen.
// Hier stehen nur Typen, kein ausführbarer Code: Beide Seiten binden die Datei mit
// `import type` ein, dadurch verschwindet der Import beim Ausführen vollständig.

/**
 * Wo eine Aufgabe gerade steht:
 * - bereit:      wartet auf eine Nachricht von David
 * - eingereiht:  Arbeit liegt in der Warteschlange und kommt dran, sobald der laufende Schritt im Chat fertig ist
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
  /** Der Agent, der den Chat bearbeitet. Im laufenden Chat wechselbar (E-56). */
  agentId: string;
  /** Übersteuert das Standardmodell des Agenten (E-51). Leeres Modell = Standard des Agenten. */
  modellWahl: ModellWahl;
}

/** Welches Modell benutzt wird. Gilt ab der nächsten Nachricht. */
export interface ModellWahl {
  /** Leer = im Chat: Standardmodell des Agenten; beim Agenten: automatische Auswahl von Copilot */
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
  /** Welcher Agent den Lauf bearbeitet (zu Beginn jedes Laufs; angezeigt wird nur ein Wechsel). */
  | { art: "agent"; agentId: string; name: string }
  /**
   * Verbrauch eines einzelnen Modellaufrufs, wie die Laufzeit ihn meldet. Wird nicht als Ereignis
   * gespeichert, sondern in der Tabelle verbrauch; am Ende des Laufs folgt die Summe (lauf_verbrauch).
   */
  | ({ art: "verbrauch" } & ModellAufrufVerbrauch)
  /** Summe eines Laufs (eine Nachricht bis der Agent fertig ist) – klein unter der Antwort */
  | ({ art: "lauf_verbrauch" } & VerbrauchSumme)
  | { art: "tool_start"; aufrufId: string; toolName: string; argumente: unknown }
  | { art: "tool_ende"; aufrufId: string; erfolgreich: boolean; ergebnis: string }
  /** Ein Eintrag wurde ins Postfach gelegt (Freigabe nötig, Meldung oder Rückfrage). */
  | {
      art: "postfach";
      postfachNr: number;
      eintragsArt: PostfachArt;
      toolName: string;
      /** Der Tool-Aufruf, zu dem der Vorschlag gehört – im Chat zeigt die Karte ihn statt der Tool-Karte */
      aufrufId?: string;
    }
  /** David hat im Postfach gehandelt (freigegeben, verworfen, geantwortet …). */
  | { art: "postfach_aktion"; postfachNr: number; text: string; details?: string }
  /** Ein Lauf wurde abgebrochen (Knopf „Abbrechen“ oder Neustart der App mitten im Lauf). */
  | { art: "abbruch"; text: string }
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
  /** Was der Chat bisher verbraucht hat */
  verbrauch: VerbrauchSumme;
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
export type UebersichtsEreignis = { bereich: "aufgaben" } | { bereich: "postfach" } | { bereich: "adt" };

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

/** Ein eingetragener Server, wie die MCP-Seite ihn zeigt. Die Regeln stehen beim Agenten. */
export interface McpServer extends McpServerDaten {
  /** Zuletzt ausgelesene Tools. Leer, solange noch nie ausgelesen. */
  tools: McpTool[];
  toolsGelesenAm: string | null;
  /** Fehler beim letzten Auslesen */
  leseFehler: string | null;
  /** Namen der Agenten, die den Server benutzen dürfen */
  agenten: string[];
  /** Von der App mitgebracht (ADT): eigenes Formular statt Startbefehl, nicht löschbar */
  eingebaut: boolean;
}

/** Die Regeln eines Agenten für einen Server – für die Tabelle auf der Agenten-Seite. */
export interface ServerRegeln {
  schluessel: string;
  name: string;
  tools: McpTool[];
  /** Gilt für jedes Tool ohne eigene Regel, auch für Tools, die später neu dazukommen. */
  standardRegel: ToolRegel;
  /** Eigene Regeln je Tool-Name */
  regeln: Record<string, ToolRegel>;
}

// ---------------------------------------------------------------------------------------------
// Agenten (Schritt 4)
// ---------------------------------------------------------------------------------------------

/** Was auf der Agenten-Seite eingestellt wird. */
export interface AgentDaten {
  name: string;
  /** Systemprompt: wer der Agent ist und wie er arbeiten soll */
  auftrag: string;
  /** Standardmodell; ein Chat kann es übersteuern. Leeres Modell = automatische Auswahl */
  modellWahl: ModellWahl;
  /** Schlüssel der MCP-Server, die der Agent benutzen darf. Die Regeln je Tool stehen in tool_regeln. */
  mcpServer: string[];
  /** Zugeordnete Instructions (Pfad relativ zum Instructions-Ordner) */
  instructions: string[];
  /** Zugeordnete Skills (Ordner relativ zum Instructions-Ordner) */
  skills: string[];
}

export interface Agent extends AgentDaten {
  /** "standard" für den Agenten, der beim ersten Start entsteht; er lässt sich nicht löschen */
  id: string;
  erstelltAm: string;
}

// ---------------------------------------------------------------------------------------------
// Instructions und Skills (Schritt 4, E-30, E-58)
// ---------------------------------------------------------------------------------------------

/** Eine Datei *.instructions.md im Instructions-Ordner */
export interface InstructionInfo {
  /** Pfad relativ zum Instructions-Ordner, mit / getrennt – dient als Kennung */
  pfad: string;
  /** Angaben aus dem Kopf der Datei (Frontmatter), soweit vorhanden */
  beschreibung: string;
  applyTo: string;
  /** Namen der Agenten, denen die Datei zugeordnet ist */
  agenten: string[];
}

/** Ein Skill: ein Ordner mit SKILL.md */
export interface SkillInfo {
  /** Ordner relativ zum Instructions-Ordner – dient als Kennung */
  pfad: string;
  /** Name aus dem Frontmatter, sonst der Ordnername. Unter diesem Namen kennt Copilot den Skill. */
  name: string;
  beschreibung: string;
  /** Weitere Dateien im Skill-Ordner (nur zur Anzeige) */
  dateien: string[];
  agenten: string[];
}

/** Antwort von GET /api/instructions */
export interface InstructionsUebersicht {
  ordner: string;
  /** Gesetzt, wenn der Ordner fehlt oder nicht lesbar ist */
  fehler: string | null;
  instructions: InstructionInfo[];
  skills: SkillInfo[];
}

// ---------------------------------------------------------------------------------------------
// Verbrauch (Schritt 4, V-14 ohne Limit – E-60)
// ---------------------------------------------------------------------------------------------

/** Ein Modellaufruf, wie Copilot ihn im Ereignis assistant.usage meldet. */
export interface ModellAufrufVerbrauch {
  modell: string;
  eingabeTokens: number;
  ausgabeTokens: number;
  /** Aus dem Prompt-Cache gelesene Tokens (in den Eingabe-Tokens enthalten oder nicht – laut SDK getrennt gemeldet) */
  cacheTokens: number;
  /** Kosten in Nano-AI-Units (copilotUsage.totalNanoAiu). Null, wenn Copilot nichts meldet. */
  nanoAiu: number | null;
  /** Kostenfaktor des Modells (cost), falls gemeldet */
  kostenfaktor: number | null;
}

export interface VerbrauchSumme {
  /** Anzahl Modellaufrufe */
  aufrufe: number;
  eingabeTokens: number;
  ausgabeTokens: number;
  cacheTokens: number;
  nanoAiu: number;
  /** Aufrufe ohne Kostenangabe – dann ist nanoAiu nur eine Untergrenze */
  ohneKosten: number;
}

/** Antwort von GET /api/verbrauch */
export interface VerbrauchUebersicht {
  gesamt: VerbrauchSumme;
  jeAgent: ({ name: string } & VerbrauchSumme)[];
  jeModell: ({ name: string } & VerbrauchSumme)[];
  /** Monat als "2026-11" */
  jeMonat: ({ name: string } & VerbrauchSumme)[];
}

// ---------------------------------------------------------------------------------------------
// Einrichtung (Schritt 4) – nur prüfen und anzeigen (E-60)
// ---------------------------------------------------------------------------------------------

export interface Pruefung {
  titel: string;
  /** true = in Ordnung, false = Fehler, null = nur Hinweis */
  ok: boolean | null;
  text: string;
  /** Was zu tun ist, wenn etwas nicht stimmt */
  hinweis?: string;
}

/** Antwort von GET /api/einrichtung */
export interface EinrichtungsBericht {
  pruefungen: Pruefung[];
  /** Die Einstellungen, wie die App sie gerade benutzt (nur zur Anzeige) */
  einstellungen: { name: string; wert: string }[];
}

/** Antwort von GET /api/status */
export interface StatusAntwort {
  modus: "simulation" | "copilot";
  workspaceOrdner: string;
}

// ---------------------------------------------------------------------------------------------
// ADT (Phase 3): ABAP entwickeln über den ADT-MCP. Anmeldung ausschließlich per SSO (E-63).
// ---------------------------------------------------------------------------------------------

/** Was David in der App für den ADT-MCP einstellt. Benutzer und Passwort gibt es bewusst nicht. */
export interface AdtKonfiguration {
  /** "simulation": eingebautes Übungssystem ohne SAP (Privatrechner). "sap": echtes System. */
  gegenstelle: "simulation" | "sap";
  /** Adresse, die Edge für die SSO-Anmeldung öffnet. ADT benutzt davon Protokoll, Host und Port. */
  url: string;
  mandant: string;
  sprache: string;
  /** Nur hier darf der Agent anlegen, speichern und aktivieren (E-28, V-11). Start: $TMP */
  pakete: string[];
  /** Woran die Anmeldung erkannt wird. * am Ende = beliebige Fortsetzung, z. B. SAP_SESSIONID_* */
  cookieNamen: string[];
  /** Leer = an den üblichen Stellen suchen */
  edgePfad: string;
  /** ATC-Prüfvariante. Leer = Standardvariante des Systems */
  atcVariante: string;
}

/** Stand der SSO-Anmeldung, wie die App ihn hält (das Cookie selbst verlässt die App nur zum ADT-MCP). */
export interface AdtAnmeldung {
  zustand: "abgemeldet" | "laeuft" | "angemeldet" | "fehler";
  text: string;
  /** Seit wann angemeldet (ISO) */
  seit: string | null;
}

/** Antwort von GET /api/adt */
export interface AdtUebersicht {
  konfiguration: AdtKonfiguration;
  anmeldung: AdtAnmeldung;
}

/** Was der ADT-MCP von der App bekommt (GET /api/adt/intern/konfiguration) */
export interface AdtLaufzeitKonfiguration extends AdtKonfiguration {
  /** Hier checkt der ADT-MCP Quelltexte aus (Unterordner abap/) */
  workspaceOrdner: string;
  /** Zustand des Übungssystems (nur gegenstelle "simulation") */
  simulationsDatei: string;
}
