// Prüft Agenten im Chat: Agent wechseln, Standardmodell, Instructions und Skills in der Sitzung,
// Kopieren und Löschen, Verbrauch je Lauf und den Hinweis bei Abbruch. npm test
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { holeAgent, standardAgentId } from "../datenbank/agenten.ts";
import { holeAufgabe } from "../datenbank/aufgaben.ts";
import { holeEreignisse } from "../datenbank/ereignisse.ts";
import { regelFuer, setzeRegel } from "../datenbank/tool-regeln.ts";
import { summeDerAufgabe, verbrauchsUebersicht } from "../datenbank/verbrauch.ts";
import { aufbauen, warteBis } from "../testhilfe.ts";
import { kopiere, legeNeuenAn, loesche } from "./agenten-dienst.ts";

test("Agent im laufenden Chat wechseln: nächste Nachricht mit Auftrag, Servern und Modell des neuen Agenten", async () => {
  const { db, chat, sitzungsStarts, status } = aufbauen();
  const anderer = legeNeuenAn(db, {
    name: "Doku-Agent",
    auftrag: "Du schreibst Doku.",
    modellWahl: { modell: "gross", denkaufwand: "high", kontext: "standard" },
    mcpServer: [],
  });

  const { id } = await chat.neueAufgabe();
  chat.nimmNachrichtAn(id, "eins");
  await warteBis(() => status(id) === "bereit");
  assert.equal(sitzungsStarts[0].agentName, "Test");
  assert.deepEqual(sitzungsStarts[0].mcpServer.map((s) => s.schluessel), ["jira"]);

  chat.setzeAgent(id, anderer.id);
  chat.nimmNachrichtAn(id, "zwei");
  await warteBis(() => sitzungsStarts.length === 2 && status(id) === "bereit");
  const zweiter = sitzungsStarts[1];
  assert.equal(zweiter.agentName, "Doku-Agent");
  assert.equal(zweiter.auftrag, "Du schreibst Doku.");
  assert.deepEqual(zweiter.mcpServer, [], "der neue Agent hat keine Server");
  // Ohne eigene Wahl im Chat gilt das Standardmodell des Agenten
  assert.deepEqual([zweiter.modell, zweiter.denkaufwand], ["gross", "high"]);
  // Dieselbe Sitzung wird fortgesetzt, der Verlauf bleibt
  assert.equal(holeAufgabe(db, id)?.sitzungId, "sitzung-1");

  // Im Verlauf steht, welcher Agent geantwortet hat
  const agenten = holeEreignisse(db, id).flatMap((e) => (e.art === "agent" ? [e.name] : []));
  assert.deepEqual(agenten, ["Test", "Doku-Agent"]);
  assert.throws(() => chat.setzeAgent(id, "gibtsnicht"), /gibt es nicht/);
});

test("Die Modellwahl des Chats übersteuert das Standardmodell des Agenten", async () => {
  const { db, chat, sitzungsStarts, status } = aufbauen();
  const agent = legeNeuenAn(db, { modellWahl: { modell: "gross", denkaufwand: "high", kontext: "lang" } });
  const { id } = await chat.neueAufgabe(agent.id);
  await chat.setzeModellWahl(id, { modell: "klein", denkaufwand: "", kontext: "standard" });
  chat.nimmNachrichtAn(id, "hallo");
  await warteBis(() => status(id) === "bereit");
  assert.deepEqual([sitzungsStarts[0].modell, sitzungsStarts[0].kontext], ["klein", "standard"]);
});

test("Zugeordnete Instructions hängen am Auftrag, nicht zugeordnete Skills sind abgeschaltet", async () => {
  const { db, chat, einstellungen, sitzungsStarts, status } = aufbauen();
  const ordner = einstellungen.instructionsOrdner;
  fs.writeFileSync(path.join(ordner, "abap.instructions.md"), "---\napplyTo: \"**\"\n---\nImmer Inline-Deklarationen.\n");
  fs.writeFileSync(path.join(ordner, "andere.instructions.md"), "Nicht zugeordnet.\n");
  for (const skill of ["review", "export"]) {
    fs.mkdirSync(path.join(ordner, "skills", skill), { recursive: true });
    fs.writeFileSync(path.join(ordner, "skills", skill, "SKILL.md"), `---\nname: ${skill}-skill\n---\n`);
  }
  const agent = legeNeuenAn(db, { auftrag: "Auftrag.", instructions: ["abap.instructions.md"], skills: ["skills/review"] });

  const { id } = await chat.neueAufgabe(agent.id);
  chat.nimmNachrichtAn(id, "hallo");
  await warteBis(() => status(id) === "bereit");
  const { auftrag, skillOrdner, abgeschalteteSkills } = sitzungsStarts[0];
  assert.match(auftrag, /^Auftrag\.\n\n# Instructions[\s\S]*## abap\.instructions\.md\n\nImmer Inline-Deklarationen\.$/);
  assert.doesNotMatch(auftrag, /Nicht zugeordnet|applyTo/);
  assert.deepEqual(skillOrdner, [path.join(ordner, "skills")]);
  assert.deepEqual(abgeschalteteSkills, ["export-skill"]);
});

test("Kopieren übernimmt Einstellungen und Regeln; Löschen gibt die Chats an den Standard-Agenten", async () => {
  const { db, chat } = aufbauen();
  const vorlage = legeNeuenAn(db, { name: "Reviewer", auftrag: "Prüfe." });
  setzeRegel(db, vorlage.id, "jira", "ticket_lesen", "erlauben");

  const kopie = kopiere(db, vorlage.id);
  assert.equal(kopie.name, "Reviewer (Kopie)");
  assert.equal(kopie.auftrag, "Prüfe.");
  assert.equal(regelFuer(db, kopie.id, "jira", "ticket_lesen"), "erlauben");
  // Neuer Agent ohne eigene Regeln: Freigabe nötig
  assert.equal(regelFuer(db, kopie.id, "jira", "seite_anlegen"), "freigabe");

  const { id } = await chat.neueAufgabe(kopie.id);
  loesche(db, kopie.id);
  assert.equal(holeAgent(db, kopie.id), null);
  assert.equal(holeAufgabe(db, id)?.agentId, standardAgentId);
  assert.throws(() => loesche(db, standardAgentId), /lässt sich nicht löschen/);
});

test("Verbrauch: je Modellaufruf gespeichert, Summe je Lauf im Verlauf, Übersicht je Agent und Modell", async () => {
  const { db, chat, status } = aufbauen((_text, _sitzung, melde) => {
    melde({ art: "verbrauch", modell: "gross", eingabeTokens: 1000, ausgabeTokens: 100, cacheTokens: 500, nanoAiu: 2_000_000, kostenfaktor: 1 });
    melde({ art: "verbrauch", modell: "klein", eingabeTokens: 200, ausgabeTokens: 10, cacheTokens: 0, nanoAiu: null, kostenfaktor: null });
  });
  const { id } = await chat.neueAufgabe();
  chat.nimmNachrichtAn(id, "hallo");
  await warteBis(() => status(id) === "bereit");

  const laeufe = holeEreignisse(db, id).filter((e) => e.art === "lauf_verbrauch");
  assert.equal(laeufe.length, 1);
  assert.deepEqual(summeDerAufgabe(db, id), { aufrufe: 2, eingabeTokens: 1200, ausgabeTokens: 110, cacheTokens: 500, nanoAiu: 2_000_000, ohneKosten: 1 });
  assert.equal(holeEreignisse(db, id).some((e) => e.art === "verbrauch"), false, "Einzelaufrufe stehen nicht im Verlauf");

  const uebersicht = verbrauchsUebersicht(db);
  assert.deepEqual(uebersicht.jeAgent.map((a) => [a.name, a.aufrufe]), [["Test", 2]]);
  assert.deepEqual(uebersicht.jeModell.map((m) => [m.name, m.eingabeTokens]), [["gross", 1000], ["klein", 200]]);
  // Verbraucht bleibt verbraucht, auch wenn der Chat gelöscht wird
  await chat.loescheAufgabe(id);
  assert.equal(verbrauchsUebersicht(db).gesamt.aufrufe, 2);
});

test("Abbrechen hinterlässt einen Hinweis im Verlauf", async () => {
  let loslassen = () => {};
  const { db, chat, gesendet, status } = aufbauen(() => new Promise<void>((r) => (loslassen = r)));
  const { id } = await chat.neueAufgabe();
  chat.nimmNachrichtAn(id, "lang");
  await warteBis(() => gesendet.length === 1);
  await chat.brecheAb(id);
  loslassen();
  await warteBis(() => status(id) === "bereit");
  assert.deepEqual(
    holeEreignisse(db, id).flatMap((e) => (e.art === "abbruch" ? [e.text] : [])),
    ["Von dir abgebrochen."],
  );
});
