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

/** Eine Aufgabe ist ein Gespräch mit einem Agenten: ein Chat oder ein KI-Schritt eines Workflows. */
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
  /** Der Agent hat aus dem Chat einen Workflow gestartet – im Chat steht dann eine Karte mit dem Stand. */
  | { art: "workflow_lauf"; laufNr: number; workflowName: string }
  /** David hat eine Änderung des ADT-MCP im Chat rückgängig gemacht bzw. das neue Objekt gelöscht. */
  | { art: "adt_zurueckgenommen"; aenderungId: string; text: string }
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
  /** Gehört zu diesem Workflow-Lauf (fester Schritt oder KI-Schritt). Null bei Chats. */
  workflowLauf: number | null;
  /** Fester Tool-Schritt eines Workflows: keine KI dahinter, also nur freigeben oder verwerfen. */
  ohneKi: boolean;
}

/** Live-Hinweis an alle Fenster: Aufgaben oder Postfach haben sich geändert, bitte neu laden. */
export type UebersichtsEreignis = { bereich: "aufgaben" } | { bereich: "postfach" } | { bereich: "adt" } | { bereich: "workflows" };

/** Ein Tool, wie der MCP-Server es beim Auslesen beschreibt. */
export interface McpTool {
  name: string;
  beschreibung: string;
  /** Der Server sagt, das Tool ändert nichts (MCP-Angabe readOnlyHint). Nur ein Hinweis. */
  nurLesend: boolean;
  /** Parameter laut inputSchema, falls der Server sie beim Auslesen genannt hat (für den Workflow-Editor). */
  parameter?: ToolParameter[];
}

export interface ToolParameter {
  name: string;
  /** JSON-Schema-Typ, z. B. "string", "number", "array". Leer, wenn unbekannt */
  typ: string;
  beschreibung: string;
  pflicht: boolean;
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
  /** Workflows, die der Agent starten darf (Kennung = Dateiname ohne .workflow.json). Nur mit „Start durch Agent“. */
  workflows: string[];
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

/**
 * Ein Änderungssatz des ADT-MCP: was ein Speichern (oder Anlegen) im System geändert hat. Liegt im
 * Workspace unter abap/.adt/aenderungen/<id>.json. Die App zeigt daraus den Vergleich nebeneinander
 * und macht die Änderung auf Wunsch rückgängig (E-31).
 */
export interface AdtAenderung {
  /** z. B. 20261127-143205-a1b2 */
  id: string;
  zeit: string;
  /** gespeichert: Rückgängig schreibt den alten Stand zurück. angelegt: Rückgängig löscht das Objekt. */
  art: "gespeichert" | "angelegt";
  objekt: { name: string; art: string; paket: string };
  /** Je geändertem Quelltext-Teil (bei Klassen z. B. Hauptteil und Testklassen) */
  teile: { teil: string; beschreibung: string; datei: string; vorher: string; nachher: string }[];
  /** Gesetzt, sobald die Änderung zurückgenommen ist */
  zurueckgenommen?: { zeit: string; text: string };
}

// ---------------------------------------------------------------------------------------------
// Workflows (Phase 4): fester Ablauf mit Tool-Schritten, KI-Schritten, Bedingungen und Schleifen.
// Gespeichert als JSON-Datei im Workflow-Ordner – die Datei ist die Wahrheit, wie bei den Instructions.
// ---------------------------------------------------------------------------------------------

/** Typ einer Eingabe des Workflows oder eines Ergebnisfelds eines KI-Schritts. */
export type WertTyp = "text" | "zahl" | "ja_nein" | "liste";

/** Was beim Start mitgegeben wird. In Schritten erreichbar als {{eingaben.<name>}}. */
export interface WorkflowEingabe {
  name: string;
  beschreibung: string;
  typ: WertTyp;
  pflicht: boolean;
  /** Als Text, wie im Formular. Gilt, wenn nichts mitgegeben wird – bei zeitgesteuerten Läufen immer. */
  standard: string;
}

/**
 * uhrzeit: an den angehakten Wochentagen (0 = Sonntag … 6 = Samstag, wie in JavaScript) zur Uhrzeit.
 * intervall: alle N Minuten, gezählt ab dem Start der App.
 * Verpasste Zeitpunkte (Rechner aus, App beendet) werden verworfen, nicht nachgeholt (E-70).
 */
export type Zeitplan = { art: "uhrzeit"; uhrzeit: string; wochentage: number[] } | { art: "intervall"; minuten: number };

/** Wie ein Workflow gestartet werden darf – mehrere Wege gleichzeitig möglich (E-66). */
export interface WorkflowStart {
  manuell: boolean;
  /** Ein Agent darf ihn als Tool starten, wenn er ihm zugeordnet ist (Agenten-Seite). */
  durchAgent: boolean;
  zeitplan: Zeitplan | null;
}

/** Ein Feld im Ergebnis eines KI-Schritts. Der Agent meldet es über das Tool ergebnis_melden. */
export interface ErgebnisFeld {
  name: string;
  typ: WertTyp;
  beschreibung: string;
}

export type Vergleich = "gleich" | "ungleich" | "enthaelt" | "groesser" | "kleiner" | "leer" | "nicht_leer" | "wahr" | "falsch";

export interface Bedingung {
  /** Text mit Platzhaltern, z. B. {{einschaetzung.umsetzbar}} */
  links: string;
  vergleich: Vergleich;
  /** Bei leer, nicht_leer, wahr und falsch ohne Bedeutung */
  rechts: string;
}

/** Wie ein fester Tool-Schritt ausgeführt wird. David legt das je Schritt fest (E-67). */
export type SchrittRegel = "erlauben" | "melden" | "freigabe";

interface SchrittBasis {
  /** Eindeutig im Workflow; daran hängt das Protokoll eines Laufs */
  id: string;
  /** Kurzer Name für die Anzeige. Leer = Art des Schritts */
  titel: string;
}

export type ToolSchrittDaten = SchrittBasis & {
  art: "tool";
  server: string;
  tool: string;
  /** Je Parameter ein Text mit Platzhaltern. Steht dort nur ein Platzhalter, bleibt der Typ erhalten (Liste, Zahl …). */
  argumente: Record<string, string>;
  regel: SchrittRegel;
  /** Name der Variablen für das Ergebnis. Leer = nicht speichern */
  ergebnis: string;
  /** weiter: Das Ergebnis ist dann { fehler: "…" } und der Lauf geht weiter */
  beiFehler: "abbrechen" | "weiter";
};

export type KiSchrittDaten = SchrittBasis & {
  art: "ki";
  agentId: string;
  auftrag: string;
  /** Leer: Ergebnis ist die Antwort als Text. Sonst ein Objekt mit genau diesen Feldern. */
  felder: ErgebnisFeld[];
  ergebnis: string;
};

export type WorkflowSchritt =
  | ToolSchrittDaten
  | KiSchrittDaten
  | (SchrittBasis & { art: "wenn"; bedingung: Bedingung; dann: WorkflowSchritt[]; sonst: WorkflowSchritt[] })
  | (SchrittBasis & { art: "fuer_jedes"; liste: string; als: string; hoechstens: number; schritte: WorkflowSchritt[] })
  | (SchrittBasis & { art: "setzen"; name: string; wert: string })
  | (SchrittBasis & { art: "workflow"; workflowId: string; eingaben: Record<string, string>; ergebnis: string })
  | (SchrittBasis & { art: "beenden"; ergebnis: string });

export type SchrittArt = WorkflowSchritt["art"];

/** Inhalt einer Workflow-Datei */
export interface WorkflowDefinition {
  name: string;
  /** Wofür der Workflow da ist. Bekommt der Agent zu lesen, wenn er ihn starten darf. */
  beschreibung: string;
  start: WorkflowStart;
  eingaben: WorkflowEingabe[];
  schritte: WorkflowSchritt[];
  /** Was der Aufrufer am Ende bekommt (Text mit Platzhaltern). Leer = nichts Besonderes. */
  ergebnis: string;
  /** Höchstverbrauch eines Laufs in AI-Credits (E-69, Startwert 500). Wird er überschritten, bricht der Lauf ab. */
  creditLimit: number;
}

/** Ein Workflow in der Liste */
export interface WorkflowInfo {
  /** Dateiname ohne .workflow.json */
  id: string;
  /** Null, wenn die Datei nicht lesbar ist – dann steht der Grund in fehler */
  definition: WorkflowDefinition | null;
  fehler: string | null;
  /** Hinweise, z. B. ein Agent oder Tool, das es nicht mehr gibt */
  warnungen: string[];
  /** Agenten, die ihn starten dürfen */
  agenten: string[];
  letzterLauf: { nr: number; status: LaufStatus; gestartetAm: string } | null;
}

/**
 * laeuft:        arbeitet gerade
 * wartet:        wartet auf eine Freigabe oder Antwort (im Postfach oder im Chat)
 * erfolgreich, fehlgeschlagen, abgebrochen: fertig
 * unterbrochen:  die App wurde beendet; lässt sich fortsetzen (fertige Schritte werden nicht wiederholt)
 */
export type LaufStatus = "laeuft" | "wartet" | "erfolgreich" | "fehlgeschlagen" | "abgebrochen" | "unterbrochen";

export type LaufAusloeser = "manuell" | "agent" | "zeitplan" | "workflow";

export interface WorkflowLauf {
  nr: number;
  workflowId: string;
  workflowName: string;
  ausloeser: LaufAusloeser;
  status: LaufStatus;
  eingaben: Record<string, unknown>;
  /** Woran der Lauf gerade ist (Titel des Schritts) */
  aktuellerSchritt: string;
  ergebnis: unknown;
  fehler: string | null;
  gestartetAm: string;
  beendetAm: string | null;
  /** Aus diesem Chat gestartet: Freigaben erscheinen dort (E-68) */
  chatAufgabeId: string | null;
  elternLauf: number | null;
  creditLimit: number;
  verbrauch: VerbrauchSumme;
}

export type SchrittStatus = "laeuft" | "wartet" | "fertig" | "fehler" | "abgebrochen";

/** Eine Ausführung eines Schritts – in Schleifen gibt es je Durchlauf eine. */
export interface LaufSchritt {
  nr: number;
  schrittId: string;
  art: SchrittArt;
  titel: string;
  /** Wo in Schleifen, z. B. "ticket 2/5". Leer außerhalb von Schleifen */
  durchlauf: string;
  /** Verschachtelungstiefe (für die Einrückung in der Anzeige) */
  tiefe: number;
  status: SchrittStatus;
  eingabe: unknown;
  ergebnis: unknown;
  /** Fehler oder Hinweis */
  meldung: string | null;
  /** KI-Schritt: die Aufgabe mit dem Verlauf des Agenten */
  aufgabeId: string | null;
  postfachNr: number | null;
  gestartetAm: string;
  beendetAm: string | null;
}

/** Antwort von GET /api/workflow-laeufe/:nr */
export interface LaufMitSchritten {
  lauf: WorkflowLauf;
  schritte: LaufSchritt[];
  /** Freigaben, Rückfragen und Meldungen des Laufs */
  postfach: PostfachEintrag[];
}
