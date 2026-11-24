// Gemeinsamer Aufbau für Tests von Chat, Warteschlange und Postfach: frische Datenbank im
// Temp-Ordner, Jira-Stellvertreter eingetragen (Standardregel Freigabe) und eine Test-Laufzeit,
// die statt eines Modells ein vorgegebenes Verhalten abspielt.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after } from "node:test";
import type { ModellInfo } from "../gemeinsam/typen.ts";
import { ChatDienst } from "./chat/chat-dienst.ts";
import { holeAufgabe } from "./datenbank/aufgaben.ts";
import { oeffneDatenbank } from "./datenbank/datenbank.ts";
import { legeServerAn } from "./datenbank/mcp-server.ts";
import { setzeRegel, standardTool } from "./datenbank/tool-regeln.ts";
import type { Einstellungen } from "./einstellungen.ts";
import type { AgentenLaufzeit, SitzungsEinstellungen } from "./laufzeit/laufzeit.ts";
import { McpAufrufer } from "./mcp/mcp-aufrufer.ts";
import { PostfachDienst } from "./postfach/postfach-dienst.ts";

/** Was der Test-Agent bei einer Nachricht tut. Bekommt Gateway und Plattform-Tools wie ein echter Agent. */
export type Verhalten = (text: string, sitzung: SitzungsEinstellungen) => Promise<void> | void;

const aufrufer = new McpAufrufer();
after(() => aufrufer.schliesseAlle());

export const testModelle: ModellInfo[] = [
  { id: "klein", name: "Klein", denkStufen: [], standardDenkStufe: null, kontextFenster: 1000, langerKontext: false, multiplikator: null },
  { id: "gross", name: "Groß", denkStufen: ["low", "high"], standardDenkStufe: "low", kontextFenster: 2000, langerKontext: true, multiplikator: null },
];

export function aufbauen(verhalten: Verhalten = () => {}) {
  const db = oeffneDatenbank(fs.mkdtempSync(path.join(os.tmpdir(), "harness-test-")));
  legeServerAn(db, {
    schluessel: "jira",
    name: "Jira (Stellvertreter)",
    befehl: process.execPath,
    argumente: ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", "mcp/stellvertreter-jira-confluence/server.ts"],
    umgebung: {},
    arbeitsordner: "",
  });
  setzeRegel(db, "standard", "jira", standardTool, "freigabe");

  /** Jede Nachricht, die beim Agenten ankommt, in dieser Reihenfolge */
  const gesendet: string[] = [];
  /** Mit welchen Einstellungen Sitzungen gestartet oder fortgesetzt wurden */
  const sitzungsStarts: SitzungsEinstellungen[] = [];
  /** Gelöschte Sitzungen */
  const geloescht: string[] = [];
  let zaehler = 0;

  const laufzeit: AgentenLaufzeit = {
    name: "simulation",
    starte: async (einstellungen) => sitzung(`sitzung-${++zaehler}`, einstellungen),
    setzeFort: async (id, einstellungen) => sitzung(id, einstellungen),
    loescheSitzung: async (id) => void geloescht.push(id),
    modelle: async () => testModelle,
    beenden: async () => {},
  };
  function sitzung(id: string, einstellungen: SitzungsEinstellungen) {
    sitzungsStarts.push(einstellungen);
    return {
      id,
      sende: async (text: string) => {
        gesendet.push(text);
        await verhalten(text, einstellungen);
      },
      abbrechen: async () => {},
      trennen: async () => {},
    };
  }

  const einstellungen = { agent: { name: "Test", auftrag: "" }, modell: "", workspaceOrdner: os.tmpdir() } as Einstellungen;
  const chat = new ChatDienst(db, laufzeit, einstellungen);
  const postfach = new PostfachDienst(db, chat, aufrufer);
  const status = (id: string) => holeAufgabe(db, id)?.status;
  return { db, chat, postfach, gesendet, sitzungsStarts, geloescht, status };
}

/** Wartet, bis die Bedingung erfüllt ist (die Läufe laufen im Hintergrund). */
export async function warteBis(bedingung: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !bedingung(); i++) await new Promise((r) => setTimeout(r, 10));
  assert.ok(bedingung(), "Bedingung nicht erreicht");
}
