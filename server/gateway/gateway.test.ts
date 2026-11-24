// Prüft das Tool-Gateway mit einer frischen Datenbank in einem Temp-Ordner. Läuft ohne Copilot: npm test
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { Ereignis } from "../../gemeinsam/typen.ts";
import { oeffneDatenbank } from "../datenbank/datenbank.ts";
import { legeServerAn, speichereTools } from "../datenbank/mcp-server.ts";
import { setzeRegel, standardTool } from "../datenbank/tool-regeln.ts";
import { ToolGateway } from "./gateway.ts";

/** Frische Datenbank mit einem Server "jira" und einer leeren Aufgabe. */
function aufbauen() {
  const db = oeffneDatenbank(fs.mkdtempSync(path.join(os.tmpdir(), "harness-gateway-")));
  db.prepare(`INSERT INTO aufgaben (id, titel, status, erstellt_am) VALUES ('a1', 'Test', 'bereit', '')`).run();
  legeServerAn(db, { schluessel: "jira", name: "Jira", befehl: "node", argumente: [], umgebung: {}, arbeitsordner: "" });
  speichereTools(db, "jira", [
    { name: "ticket_lesen", beschreibung: "", nurLesend: true },
    { name: "ticket_loeschen", beschreibung: "", nurLesend: false },
  ]);
  const gemeldet: Ereignis[] = [];
  const gateway = new ToolGateway({ db, agentId: "standard", aufgabeId: "a1", melde: (e) => gemeldet.push(e) });
  // SQLite liefert Zeilen ohne Prototyp; für den Vergleich in normale Objekte kopieren
  const postfach = () => db.prepare(`SELECT art, tool, argumente, ergebnis FROM postfach ORDER BY nr`).all().map((z) => ({ ...z }));
  return { db, gateway, gemeldet, postfach };
}

test("Laufzeit-Namen werden in Server und Tool zerlegt", () => {
  const { gateway } = aufbauen();
  assert.deepEqual(gateway.zerlege("jira-ticket_lesen"), { server: "jira", tool: "ticket_lesen" });
  // Tool-Namen dürfen selbst Bindestriche enthalten
  assert.deepEqual(gateway.zerlege("jira-seite-anlegen"), { server: "jira", tool: "seite-anlegen" });
  // Eingebaute Werkzeuge und fremde Server gehören nicht zum Gateway
  assert.equal(gateway.zerlege("view"), null);
  assert.equal(gateway.zerlege("github-search_code"), null);
});

test("Ohne Einstellung gilt Freigabe, eigene Regeln gehen vor der Standardregel", () => {
  const { db, gateway } = aufbauen();
  const lesen = { server: "jira", tool: "ticket_lesen" };
  assert.equal(gateway.regel(lesen), "freigabe");
  setzeRegel(db, "standard", "jira", standardTool, "melden");
  assert.equal(gateway.regel(lesen), "melden");
  setzeRegel(db, "standard", "jira", "ticket_lesen", "erlauben");
  assert.equal(gateway.regel(lesen), "erlauben");
  // Regeln gelten je Agent
  setzeRegel(db, "anderer", "jira", "ticket_lesen", "verbieten");
  assert.equal(gateway.regel(lesen), "erlauben");
});

test("Nicht eingetragene Server sind gesperrt", () => {
  const { gateway } = aufbauen();
  assert.equal(gateway.regel({ server: "fremd", tool: "x" }), "verbieten");
  assert.equal(gateway.darfAusfuehren({ server: "fremd", tool: "x" }), false);
});

test("Erlauben: wird ausgeführt, nichts im Postfach", async () => {
  const { db, gateway, postfach } = aufbauen();
  setzeRegel(db, "standard", "jira", "ticket_lesen", "erlauben");
  const adresse = { server: "jira", tool: "ticket_lesen" };
  assert.deepEqual(await gateway.vorAufruf(adresse, {}), { ausfuehren: true });
  gateway.nachAufruf(adresse, {}, "Ergebnis");
  assert.equal(postfach().length, 0);
});

test("Freigabe ohne wartenden Nutzer: wird nicht ausgeführt, Vorschlag liegt im Postfach, Agent bekommt die Nummer", async () => {
  const { gateway, gemeldet, postfach } = aufbauen();
  const entscheidung = await gateway.vorAufruf({ server: "jira", tool: "ticket_lesen" }, { schluessel: "ABAP-1" });
  assert.equal(entscheidung.ausfuehren, false);
  assert.match((entscheidung as { grund: string }).grund, /Vorschlag #1/);
  assert.deepEqual(postfach(), [{ art: "freigabe", tool: "ticket_lesen", argumente: '{"schluessel":"ABAP-1"}', ergebnis: null }]);
  assert.deepEqual(gemeldet, [{ art: "postfach", postfachNr: 1, eintragsArt: "freigabe", toolName: "jira-ticket_lesen" }]);
  // Die zweite Sperre lässt den Aufruf auch nicht durch
  assert.equal(gateway.darfAusfuehren({ server: "jira", tool: "ticket_lesen" }), false);
});

test("Melden: wird ausgeführt, danach Meldung mit Ergebnis im Postfach", async () => {
  const { db, gateway, postfach } = aufbauen();
  setzeRegel(db, "standard", "jira", "ticket_lesen", "melden");
  const adresse = { server: "jira", tool: "ticket_lesen" };
  assert.deepEqual(await gateway.vorAufruf(adresse, {}), { ausfuehren: true });
  assert.equal(postfach().length, 0);
  gateway.nachAufruf(adresse, {}, "ABAP-1 gelesen");
  assert.deepEqual(postfach(), [{ art: "meldung", tool: "ticket_lesen", argumente: "{}", ergebnis: "ABAP-1 gelesen" }]);
});

test("Verbieten: abgelehnt, nichts im Postfach, und das Tool wird gar nicht erst angeboten", async () => {
  const { db, gateway, postfach } = aufbauen();
  setzeRegel(db, "standard", "jira", standardTool, "erlauben");
  setzeRegel(db, "standard", "jira", "ticket_loeschen", "verbieten");
  const entscheidung = await gateway.vorAufruf({ server: "jira", tool: "ticket_loeschen" }, {});
  assert.equal(entscheidung.ausfuehren, false);
  assert.match((entscheidung as { grund: string }).grund, /gesperrt/);
  assert.equal(postfach().length, 0);

  const server = [{ schluessel: "jira", tools: [{ name: "ticket_lesen" }, { name: "ticket_loeschen" }] }];
  assert.deepEqual(gateway.verboteneTools(server), [{ server: "jira", tool: "ticket_loeschen" }]);
});
