// Was jeder Schritt bekommt (SchrittKontext) und wie er einen Lauf beendet (die Fehlerarten).
// Die Schritte selbst stehen je Art in einer eigenen Datei daneben.
import type { ErgebnisFeld, PostfachArt, WorkflowSchritt } from "../../../gemeinsam/typen.ts";
import type { ChatDienst } from "../../chat/chat-dienst.ts";
import type { Datenbank } from "../../datenbank/datenbank.ts";
import type { LaufIntern, ProtokollEintrag } from "../../datenbank/workflow-laeufe.ts";
import type { McpAufrufer } from "../../mcp/mcp-aufrufer.ts";
import type { NutzerEntscheidung } from "../../postfach/entscheidungen.ts";
import type { Variablen } from "../ausdruecke.ts";
import type { ErgebnisAblage } from "../ergebnis-melden.ts";

/** Der Schritt ist fehlgeschlagen; der Lauf endet als „fehlgeschlagen“ und lässt sich erneut versuchen. */
export class SchrittFehler extends Error {}

/** Der Lauf wird abgebrochen (verworfen, von David abgebrochen, Credit-Limit). */
export class LaufAbbruch extends Error {}

/** Schritt „Beenden“: Der Lauf ist vorzeitig erfolgreich fertig. */
export class Beenden extends Error {
  readonly ergebnis: unknown;
  constructor(ergebnis: unknown) {
    super("Beendet");
    this.ergebnis = ergebnis;
  }
}

/** Was der Workflow-Dienst den Schritten zur Verfügung stellt. */
export interface AblaufUmgebung {
  db: Datenbank;
  aufrufer: McpAufrufer;
  chat: ChatDienst;
  /** Wartet, bis David über den Eintrag entschieden hat – im Chat oder im Postfach, je nach Lauf (E-68). */
  warteAufEntscheidung(lauf: LaufIntern, nr: number): Promise<NutzerEntscheidung>;
  /** Neuer Postfach-Eintrag des Laufs: im Chat anzeigen (falls aus einem Chat gestartet) und Übersicht melden. */
  meldePostfach(lauf: LaufIntern, nr: number, art: PostfachArt, toolName: string): void;
  /** Für einen KI-Schritt: Ablage, in die das Tool ergebnis_melden das Ergebnis legt. */
  bereiteErgebnisVor(aufgabeId: string, felder: ErgebnisFeld[]): ErgebnisAblage;
  /** Nach dem KI-Schritt: Ablage vergessen und die Sitzung freigeben (sie bleibt gespeichert). */
  raeumeAuf(aufgabeId: string): Promise<void>;
  /** Startet einen anderen Workflow als Teil dieses Laufs oder setzt einen unterbrochenen fort. Wartet bis zum Ende. */
  fuehreUnterlaufAus(lauf: LaufIntern, workflowId: string, eingaben: Record<string, unknown>, vorherigerLauf: number | null, beimStart: (nr: number) => void): Promise<LaufIntern>;
  /** Grund, falls der Lauf abgebrochen werden soll; sonst null. */
  abbruchGrund(laufNr: number): string | null;
  /** Etwas am Lauf hat sich geändert (Live-Anzeige). */
  geaendert(): void;
}

export interface SchrittKontext {
  lauf: LaufIntern;
  umgebung: AblaufUmgebung;
  variablen: Variablen;
  setze(name: string, wert: unknown): void;
  /** Stelle im Ablauf, z. B. "je_ticket[1]/einschaetzen" */
  schluessel: string;
  /** Protokolleintrag dieser Stelle aus einem früheren Versuch (Fortsetzen), sonst null */
  vorher: ProtokollEintrag | null;
  /** Ergänzt den Protokolleintrag (Eingabe, Aufgabe, Postfach-Nummer …) */
  vermerke(angaben: { eingabe?: unknown; aufgabeId?: string; postfachNr?: number; meldung?: string }): void;
  /** Führt Unterschritte aus (Bedingung, Schleife). `praefix` macht ihre Stelle eindeutig. */
  fuehreAus(schritte: WorkflowSchritt[], praefix: string, durchlauf: string): Promise<void>;
  /** Der Lauf wartet (auf David) bzw. arbeitet wieder – für Anzeige von Lauf und Schritt. */
  wartet(ja: boolean): void;
}

/** Führt einen Schritt aus und liefert sein Ergebnis (das in der Variablen landet, falls angegeben). */
export type SchrittAusfuehrung<S extends WorkflowSchritt = WorkflowSchritt> = (schritt: S, kontext: SchrittKontext) => Promise<unknown>;

/** Titel für Anzeige und Protokoll */
export function titelDes(schritt: WorkflowSchritt): string {
  if (schritt.titel) return schritt.titel;
  const namen: Record<WorkflowSchritt["art"], string> = {
    tool: schritt.art === "tool" ? `${schritt.server}-${schritt.tool}` : "Tool",
    ki: "KI-Schritt",
    wenn: "Wenn",
    fuer_jedes: "Für jedes",
    setzen: schritt.art === "setzen" ? `${schritt.name} setzen` : "Setzen",
    workflow: schritt.art === "workflow" ? `Workflow ${schritt.workflowId}` : "Workflow",
    beenden: "Beenden",
  };
  return namen[schritt.art];
}
