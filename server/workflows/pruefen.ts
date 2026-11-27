// Prüft eine Workflow-Datei bzw. was der Editor schickt, und füllt fehlende Angaben mit Standardwerten.
// Fehler im Aufbau (z. B. doppelte Schritt-Kennung, ungültiger Platzhalter) verhindern das Speichern.
// Verweise auf Agenten, Server, Tools und andere Workflows werden nur als Warnung gemeldet – die
// können sich ändern, ohne dass jemand die Datei anfasst.
import type {
  Bedingung,
  ErgebnisFeld,
  SchrittRegel,
  Vergleich,
  WertTyp,
  WorkflowDefinition,
  WorkflowEingabe,
  WorkflowSchritt,
  WorkflowStart,
  Zeitplan,
} from "../../gemeinsam/typen.ts";
import { holeAgent } from "../datenbank/agenten.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import { holeServer } from "../datenbank/mcp-server.ts";
import { Fehler } from "../fehler.ts";
import { AusdruckFehler, benutzteVariablen, wandle } from "./ausdruecke.ts";

/** Startwert für das Credit-Limit je Lauf (E-69) */
export const standardCreditLimit = 500;
/** Obergrenze für „Für jedes“, auch wenn mehr eingetragen ist – ein Tippfehler soll nicht tausend KI-Schritte kosten. */
export const maxDurchlaeufe = 100;

const namensMuster = /^[A-Za-z_][A-Za-z0-9_]*$/;
const wertTypen: WertTyp[] = ["text", "zahl", "ja_nein", "liste"];
const vergleiche: Vergleich[] = ["gleich", "ungleich", "enthaelt", "groesser", "kleiner", "leer", "nicht_leer", "wahr", "falsch"];
const regeln: SchrittRegel[] = ["erlauben", "melden", "freigabe"];

const text = (wert: unknown) => (typeof wert === "string" ? wert : wert === undefined || wert === null ? "" : String(wert));
const liste = (wert: unknown): unknown[] => (Array.isArray(wert) ? wert : []);
const textTabelle = (wert: unknown): Record<string, string> =>
  Object.fromEntries(Object.entries(wert && typeof wert === "object" ? wert : {}).map(([k, v]) => [k, text(v)]));

function fehler(meldung: string): never {
  throw new Fehler(400, meldung);
}

function pruefeName(name: string, wo: string): void {
  if (!namensMuster.test(name)) fehler(`${wo}: „${name}“ ist kein gültiger Name (Buchstaben, Ziffern, _; nicht mit Ziffer beginnen).`);
  if (name === "eingaben") fehler(`${wo}: Der Name „eingaben“ ist für die Eingaben des Workflows reserviert.`);
}

function pruefePlatzhalter(wert: string, wo: string): void {
  try {
    benutzteVariablen(wert);
  } catch (f) {
    fehler(`${wo}: ${(f as AusdruckFehler).message}`);
  }
}

function zeitplan(roh: any): Zeitplan | null {
  if (!roh) return null;
  if (roh.art === "intervall") {
    const minuten = Math.round(Number(roh.minuten));
    if (!(minuten >= 1)) fehler("Zeitplan: Das Intervall muss mindestens 1 Minute sein.");
    return { art: "intervall", minuten };
  }
  const uhrzeit = text(roh.uhrzeit).trim();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(uhrzeit)) fehler(`Zeitplan: „${uhrzeit}“ ist keine Uhrzeit (z. B. 07:30).`);
  const wochentage = [...new Set(liste(roh.wochentage).map(Number))].filter((t) => t >= 0 && t <= 6).sort();
  if (wochentage.length === 0) fehler("Zeitplan: Bitte mindestens einen Wochentag anhaken.");
  return { art: "uhrzeit", uhrzeit, wochentage };
}

function start(roh: any): WorkflowStart {
  const ergebnis = { manuell: roh?.manuell !== false, durchAgent: roh?.durchAgent === true, zeitplan: zeitplan(roh?.zeitplan) };
  if (!ergebnis.manuell && !ergebnis.durchAgent && !ergebnis.zeitplan) fehler("Start: Bitte mindestens einen Weg anhaken.");
  return ergebnis;
}

function wertTyp(roh: unknown, wo: string): WertTyp {
  const typ = text(roh) || "text";
  if (!wertTypen.includes(typ as WertTyp)) fehler(`${wo}: unbekannter Typ „${typ}“.`);
  return typ as WertTyp;
}

function eingaben(roh: unknown): WorkflowEingabe[] {
  const namen = new Set<string>();
  return liste(roh).map((e: any) => {
    const eingabe: WorkflowEingabe = {
      name: text(e?.name).trim(),
      beschreibung: text(e?.beschreibung),
      typ: wertTyp(e?.typ, `Eingabe ${text(e?.name)}`),
      pflicht: e?.pflicht === true,
      standard: text(e?.standard),
    };
    pruefeName(eingabe.name, "Eingabe");
    if (namen.has(eingabe.name)) fehler(`Die Eingabe ${eingabe.name} gibt es zweimal.`);
    namen.add(eingabe.name);
    if (eingabe.standard) {
      try {
        wandle(eingabe.standard, eingabe.typ, `Standardwert von ${eingabe.name}`);
      } catch (f) {
        fehler((f as Error).message);
      }
    }
    return eingabe;
  });
}

function felder(roh: unknown, wo: string): ErgebnisFeld[] {
  const namen = new Set<string>();
  return liste(roh).map((f: any) => {
    const feld = { name: text(f?.name).trim(), typ: wertTyp(f?.typ, wo), beschreibung: text(f?.beschreibung) };
    pruefeName(feld.name, `${wo}, Ergebnisfeld`);
    if (namen.has(feld.name)) fehler(`${wo}: Das Ergebnisfeld ${feld.name} gibt es zweimal.`);
    namen.add(feld.name);
    return feld;
  });
}

function bedingung(roh: any, wo: string): Bedingung {
  const vergleich = (text(roh?.vergleich) || "gleich") as Vergleich;
  if (!vergleiche.includes(vergleich)) fehler(`${wo}: unbekannter Vergleich „${vergleich}“.`);
  const ergebnis = { links: text(roh?.links), vergleich, rechts: text(roh?.rechts) };
  pruefePlatzhalter(ergebnis.links, wo);
  pruefePlatzhalter(ergebnis.rechts, wo);
  return ergebnis;
}

/** Variablenname, in den ein Schritt sein Ergebnis legt. Leer erlaubt. */
function ergebnisName(roh: unknown, wo: string): string {
  const name = text(roh).trim();
  if (name) pruefeName(name, `${wo}, Ergebnis speichern in`);
  return name;
}

function schritte(roh: unknown, ids: Set<string>): WorkflowSchritt[] {
  return liste(roh).map((s) => schritt(s, ids));
}

function schritt(roh: any, ids: Set<string>): WorkflowSchritt {
  const id = text(roh?.id).trim();
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) fehler(`Ein Schritt hat keine gültige Kennung („${id}“).`);
  if (ids.has(id)) fehler(`Die Schritt-Kennung ${id} gibt es zweimal.`);
  ids.add(id);
  const titel = text(roh?.titel).trim();
  const wo = `Schritt „${titel || id}“`;
  const basis = { id, titel };

  switch (roh?.art) {
    case "tool": {
      const regel = (text(roh.regel) || "freigabe") as SchrittRegel;
      if (!regeln.includes(regel)) fehler(`${wo}: unbekannte Regel „${regel}“.`);
      const argumente = textTabelle(roh.argumente);
      for (const [name, wert] of Object.entries(argumente)) pruefePlatzhalter(wert, `${wo}, Argument ${name}`);
      if (!text(roh.server) || !text(roh.tool)) fehler(`${wo}: Bitte Server und Tool wählen.`);
      return {
        ...basis,
        art: "tool",
        server: text(roh.server),
        tool: text(roh.tool),
        argumente,
        regel,
        ergebnis: ergebnisName(roh.ergebnis, wo),
        beiFehler: roh.beiFehler === "weiter" ? "weiter" : "abbrechen",
      };
    }
    case "ki": {
      const auftrag = text(roh.auftrag);
      if (!auftrag.trim()) fehler(`${wo}: Der Auftrag an den Agenten fehlt.`);
      pruefePlatzhalter(auftrag, wo);
      return { ...basis, art: "ki", agentId: text(roh.agentId) || "standard", auftrag, felder: felder(roh.felder, wo), ergebnis: ergebnisName(roh.ergebnis, wo) };
    }
    case "wenn":
      return { ...basis, art: "wenn", bedingung: bedingung(roh.bedingung, wo), dann: schritte(roh.dann, ids), sonst: schritte(roh.sonst, ids) };
    case "fuer_jedes": {
      const als = text(roh.als).trim() || "eintrag";
      pruefeName(als, `${wo}, Name je Eintrag`);
      pruefePlatzhalter(text(roh.liste), wo);
      const hoechstens = Math.min(maxDurchlaeufe, Math.max(1, Math.round(Number(roh.hoechstens) || 20)));
      return { ...basis, art: "fuer_jedes", liste: text(roh.liste), als, hoechstens, schritte: schritte(roh.schritte, ids) };
    }
    case "setzen": {
      const name = text(roh.name).trim();
      pruefeName(name, `${wo}, Variable`);
      pruefePlatzhalter(text(roh.wert), wo);
      return { ...basis, art: "setzen", name, wert: text(roh.wert) };
    }
    case "workflow": {
      const eingabenDesAufrufs = textTabelle(roh.eingaben);
      for (const [name, wert] of Object.entries(eingabenDesAufrufs)) pruefePlatzhalter(wert, `${wo}, Eingabe ${name}`);
      if (!text(roh.workflowId)) fehler(`${wo}: Bitte den Workflow wählen.`);
      return { ...basis, art: "workflow", workflowId: text(roh.workflowId), eingaben: eingabenDesAufrufs, ergebnis: ergebnisName(roh.ergebnis, wo) };
    }
    case "beenden":
      pruefePlatzhalter(text(roh.ergebnis), wo);
      return { ...basis, art: "beenden", ergebnis: text(roh.ergebnis) };
    default:
      fehler(`${wo}: unbekannte Art „${text(roh?.art)}“.`);
  }
}

/** Prüft den Aufbau und gibt die vollständige Definition zurück. Wirft Fehler(400) mit verständlichem Text. */
export function pruefeDefinition(roh: any): WorkflowDefinition {
  const name = text(roh?.name).trim();
  if (!name) fehler("Bitte einen Namen angeben.");
  const limit = roh?.creditLimit === undefined || roh?.creditLimit === null || roh?.creditLimit === "" ? standardCreditLimit : Number(roh.creditLimit);
  if (!(limit > 0)) fehler("Das Credit-Limit muss größer als 0 sein.");
  const definition: WorkflowDefinition = {
    name,
    beschreibung: text(roh?.beschreibung),
    start: start(roh?.start),
    eingaben: eingaben(roh?.eingaben),
    schritte: schritte(roh?.schritte, new Set()),
    ergebnis: text(roh?.ergebnis),
    creditLimit: limit,
  };
  pruefePlatzhalter(definition.ergebnis, "Ergebnis des Workflows");
  if (definition.start.durchAgent && !definition.beschreibung.trim()) {
    fehler("Start durch Agent: Bitte beschreiben, wofür der Workflow da ist – danach entscheidet der Agent, ob er ihn startet.");
  }
  return definition;
}

/** Alle Schritte, auch die in Bedingungen und Schleifen */
export function alleSchritte(liste: WorkflowSchritt[]): WorkflowSchritt[] {
  return liste.flatMap((s) => [
    s,
    ...(s.art === "wenn" ? [...alleSchritte(s.dann), ...alleSchritte(s.sonst)] : s.art === "fuer_jedes" ? alleSchritte(s.schritte) : []),
  ]);
}

/** Hinweise auf Dinge, die es (nicht mehr) gibt. Verhindern das Speichern nicht. */
export function warnungen(definition: WorkflowDefinition, db: Datenbank, workflowIds: string[]): string[] {
  const hinweise: string[] = [];
  for (const s of alleSchritte(definition.schritte)) {
    const wo = `Schritt „${s.titel || s.id}“`;
    if (s.art === "tool") {
      const server = holeServer(db, s.server);
      if (!server) hinweise.push(`${wo}: Den MCP-Server ${s.server} gibt es nicht.`);
      else if (server.tools.length > 0 && !server.tools.some((t) => t.name === s.tool)) hinweise.push(`${wo}: Das Tool ${s.server}-${s.tool} gibt es nicht.`);
    }
    if (s.art === "ki" && !holeAgent(db, s.agentId)) hinweise.push(`${wo}: Den Agenten ${s.agentId} gibt es nicht.`);
    if (s.art === "workflow" && !workflowIds.includes(s.workflowId)) hinweise.push(`${wo}: Den Workflow ${s.workflowId} gibt es nicht.`);
  }
  return hinweise;
}

/**
 * Macht aus den mitgegebenen Werten die Eingaben des Laufs: Standardwerte für Fehlendes, passender Typ,
 * Pflichtangaben vorhanden. Unbekannte Namen sind ein Fehler – meist ein Tippfehler.
 */
export function pruefeEingaben(definition: WorkflowDefinition, roh: Record<string, unknown> = {}): Record<string, unknown> {
  const bekannt = new Set(definition.eingaben.map((e) => e.name));
  const unbekannt = Object.keys(roh).filter((n) => !bekannt.has(n));
  if (unbekannt.length > 0) fehler(`Unbekannte Eingaben: ${unbekannt.join(", ")}`);

  const werte: Record<string, unknown> = {};
  for (const eingabe of definition.eingaben) {
    const mitgegeben = roh[eingabe.name];
    const leer = mitgegeben === undefined || mitgegeben === null || mitgegeben === "";
    const wert = leer ? eingabe.standard : mitgegeben;
    if (wert === "" || wert === undefined) {
      if (eingabe.pflicht) fehler(`Die Eingabe ${eingabe.name} fehlt.`);
      werte[eingabe.name] = eingabe.typ === "liste" ? [] : eingabe.typ === "ja_nein" ? false : eingabe.typ === "zahl" ? null : "";
      continue;
    }
    try {
      werte[eingabe.name] = wandle(wert, eingabe.typ, `Die Eingabe ${eingabe.name}`);
    } catch (f) {
      fehler((f as Error).message);
    }
  }
  return werte;
}
