// Gemeinsamer Aufbau für Tests von Chat, Warteschlange und Postfach: frische Datenbank im
// Temp-Ordner, Jira-Stellvertreter eingetragen (Standardregel Freigabe) und eine Test-Laufzeit,
// die statt eines Modells ein vorgegebenes Verhalten abspielt.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after } from "node:test";
import type { ModellInfo } from "../gemeinsam/typen.ts";
import { richteStandardAgentenEin } from "./agenten/agenten-dienst.ts";
import { ChatDienst } from "./chat/chat-dienst.ts";
import { holeAufgabe } from "./datenbank/aufgaben.ts";
import { oeffneDatenbank } from "./datenbank/datenbank.ts";
import { holeServer, legeServerAn } from "./datenbank/mcp-server.ts";
import { setzeRegel, standardTool } from "./datenbank/tool-regeln.ts";
import type { Einstellungen } from "./einstellungen.ts";
import type { AgentenLaufzeit, EreignisEmpfaenger, SitzungsEinstellungen } from "./laufzeit/laufzeit.ts";
import { McpAufrufer } from "./mcp/mcp-aufrufer.ts";
import { PostfachDienst } from "./postfach/postfach-dienst.ts";

/**
 * Was der Test-Agent bei einer Nachricht tut. Bekommt Gateway und Plattform-Tools wie ein echter Agent
 * und kann Ereignisse melden (z. B. Verbrauch).
 */
export type Verhalten = (text: string, sitzung: SitzungsEinstellungen, melde: EreignisEmpfaenger) => Promise<void> | void;

const aufrufer = new McpAufrufer();
after(() => aufrufer.schliesseAlle());

export const testModelle: ModellInfo[] = [
  { id: "klein", name: "Klein", denkStufen: [], standardDenkStufe: null, kontextStandard: 1000, langerKontext: false, kontextLang: null, multiplikator: null },
  { id: "gross", name: "Groß", denkStufen: ["low", "high"], standardDenkStufe: "low", kontextStandard: 2000, langerKontext: true, kontextLang: 9000, multiplikator: null },
];

/**
 * `ordner`: dieselbe Datenbank noch einmal öffnen – so lässt sich ein Neustart der App nachstellen.
 */
export function aufbauen(verhalten: Verhalten = () => {}, ordner = fs.mkdtempSync(path.join(os.tmpdir(), "harness-test-"))) {
  const db = oeffneDatenbank(ordner);
  if (!holeServer(db, "jira")) legeServerAn(db, {
    schluessel: "jira",
    name: "Jira (Stellvertreter)",
    befehl: process.execPath,
    argumente: ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", "mcp/stellvertreter-jira-confluence/server.ts"],
    umgebung: {},
    arbeitsordner: "",
  });
  setzeRegel(db, "standard", "jira", standardTool, "freigabe");
  const einstellungen = {
    agent: { name: "Test", auftrag: "" },
    modell: "",
    workspaceOrdner: os.tmpdir(),
    instructionsOrdner: path.join(ordner, "instructions"),
  } as Einstellungen;
  fs.mkdirSync(einstellungen.instructionsOrdner, { recursive: true });
  // Wie beim Start der App: Standard-Agent mit allen eingetragenen Servern
  richteStandardAgentenEin(db, einstellungen);

  /** Jede Nachricht, die beim Agenten ankommt, in dieser Reihenfolge */
  const gesendet: string[] = [];
  /** Mit welchen Einstellungen Sitzungen gestartet oder fortgesetzt wurden */
  const sitzungsStarts: SitzungsEinstellungen[] = [];
  /** Gelöschte Sitzungen */
  const geloescht: string[] = [];
  /** Wie oft ein Lauf abgebrochen wurde */
  let abbrueche = 0;
  let zaehler = 0;

  const laufzeit: AgentenLaufzeit = {
    name: "simulation",
    starte: async (einstellungen, empfaenger) => sitzung(`sitzung-${++zaehler}`, einstellungen, empfaenger),
    setzeFort: async (id, einstellungen, empfaenger) => sitzung(id, einstellungen, empfaenger),
    loescheSitzung: async (id) => void geloescht.push(id),
    modelle: async () => testModelle,
    anmeldung: async () => ({ angemeldet: null, text: "Test" }),
    beenden: async () => {},
  };
  function sitzung(id: string, einstellungen: SitzungsEinstellungen, empfaenger: EreignisEmpfaenger) {
    sitzungsStarts.push(einstellungen);
    return {
      id,
      sende: async (text: string) => {
        gesendet.push(text);
        await verhalten(text, einstellungen, empfaenger);
      },
      abbrechen: async () => void abbrueche++,
      trennen: async () => {},
    };
  }

  const chat = new ChatDienst(db, laufzeit, einstellungen);
  const postfach = new PostfachDienst(db, chat, aufrufer);
  const status = (id: string) => holeAufgabe(db, id)?.status;
  return { db, ordner, einstellungen, chat, postfach, aufrufer, gesendet, sitzungsStarts, geloescht, status, abbrueche: () => abbrueche };
}

/** Wartet, bis die Bedingung erfüllt ist (die Läufe laufen im Hintergrund). Standard: höchstens 2 s. */
export async function warteBis(bedingung: () => boolean, hoechstensMs = 2000): Promise<void> {
  for (let i = 0; i < hoechstensMs / 10 && !bedingung(); i++) await new Promise((r) => setTimeout(r, 10));
  assert.ok(bedingung(), "Bedingung nicht erreicht");
}
