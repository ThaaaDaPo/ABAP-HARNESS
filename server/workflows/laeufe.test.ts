// Prüft Workflow-Läufe: feste Tool-Schritte (echter Jira-Stellvertreter), KI-Schritte (Test-Laufzeit
// statt Modell), Freigaben im Postfach und im Chat (E-68), Credit-Limit (E-69), Neustart mit
// Fortsetzen und den Start durch einen Agenten (E-71). Läuft ohne Copilot: npm test
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import type { WorkflowSchritt } from "../../gemeinsam/typen.ts";
import { aendereAgent, holeAgent } from "../datenbank/agenten.ts";
import { holeEreignisse } from "../datenbank/ereignisse.ts";
import { holeLauf, holeSchritte } from "../datenbank/workflow-laeufe.ts";
import { aufbauen, warteBis, type Verhalten } from "../testhilfe.ts";
import { WorkflowDienst } from "./workflow-dienst.ts";
import { speichereWorkflow } from "./workflow-ordner.ts";

function mitWorkflows(verhalten?: Verhalten, ordner?: string) {
  const umgebung = aufbauen(verhalten, ordner);
  const workflowOrdner = path.join(umgebung.ordner, "workflows");
  fs.mkdirSync(workflowOrdner, { recursive: true });
  const dienst = new WorkflowDienst(umgebung.db, workflowOrdner, umgebung.chat, umgebung.aufrufer);
  const lege = (id: string, schritte: WorkflowSchritt[], mehr: object = {}) =>
    speichereWorkflow(workflowOrdner, id, { name: `Workflow ${id}`, beschreibung: "Zum Testen", start: { manuell: true, durchAgent: true }, schritte, ...mehr });
  const laufStatus = (nr: number) => holeLauf(umgebung.db, nr)?.status;
  return { ...umgebung, dienst, lege, laufStatus };
}

const verschieben = (id: string, regel: "erlauben" | "melden" | "freigabe", status = "Review"): WorkflowSchritt => ({
  id,
  titel: "",
  art: "tool",
  server: "jira",
  tool: "ticket_verschieben",
  argumente: { schluessel: "ABAP-123", status },
  regel,
  ergebnis: id,
  beiFehler: "abbrechen",
});

/** Test-Agent: meldet über ergebnis_melden, wenn das Tool angeboten wird. */
const meldetErgebnis =
  (werte: object): Verhalten =>
  async (_text, sitzung) => {
    await sitzung.plattformTools.find((t) => t.name === "ergebnis_melden")?.fuehreAus(werte);
  };

test("Fester Ablauf: Tool-Schritt, Schleife, Bedingung, Variablen und Ergebnis – ohne KI", async () => {
  const { dienst, lege, db, gesendet } = mitWorkflows();
  lege("fest", [
    { id: "suchen", titel: "Suchen", art: "tool", server: "jira", tool: "tickets_suchen", argumente: { format: "json", status: "" }, regel: "erlauben", ergebnis: "tickets", beiFehler: "abbrechen" },
    {
      id: "je",
      titel: "",
      art: "fuer_jedes",
      liste: "{{tickets}}",
      als: "t",
      hoechstens: 10,
      schritte: [
        {
          id: "offen",
          titel: "",
          art: "wenn",
          bedingung: { links: "{{t.status}}", vergleich: "gleich", rechts: "Offen" },
          dann: [{ id: "merke_offen", titel: "", art: "setzen", name: "offen", wert: "{{offen}} {{t.schluessel}}" }],
          sonst: [],
        },
      ],
    },
  ], { ergebnis: "Offen:{{offen}}" });

  const lauf = await dienst.warteAufEnde(dienst.starteLauf("fest", {}, { ausloeser: "manuell" }).nr);
  assert.equal(lauf.status, "erfolgreich", lauf.fehler ?? "");
  assert.equal(lauf.ergebnis, "Offen: ABAP-124");
  const schritte = holeSchritte(db, lauf.nr);
  assert.deepEqual(schritte.map((s) => s.schrittId), ["suchen", "je", "offen", "offen", "merke_offen"]);
  assert.deepEqual(schritte.filter((s) => s.schrittId === "offen").map((s) => s.durchlauf), ["t 1/2", "t 2/2"]);
  assert.equal(gesendet.length, 0, "kein Modellaufruf");
});

test("KI-Schritt: Ergebnis über ergebnis_melden, eigene Sitzung, nachfragen, wenn es fehlt", async () => {
  let aufrufe = 0;
  const { dienst, lege, gesendet, sitzungsStarts } = mitWorkflows(async (text, sitzung, melde) => {
    aufrufe++;
    // Beim ersten Mal „vergisst“ der Agent das Melden, auf die Nachfrage meldet er.
    if (text.startsWith("Du hast dein Ergebnis noch nicht")) await meldetErgebnis({ umsetzbar: "ja", begruendung: "passt" })(text, sitzung, melde);
    melde({ art: "agent_nachricht", text: "Fertig." });
  });
  lege("ki", [
    {
      id: "einschaetzen",
      titel: "",
      art: "ki",
      agentId: "standard",
      auftrag: "Schätze {{eingaben.ticket}} ein.",
      felder: [{ name: "umsetzbar", typ: "ja_nein", beschreibung: "" }, { name: "begruendung", typ: "text", beschreibung: "" }],
      ergebnis: "e",
    },
    { id: "frei", titel: "", art: "ki", agentId: "standard", auftrag: "Fasse zusammen: {{e.begruendung}}", felder: [], ergebnis: "text" },
  ], { eingaben: [{ name: "ticket", typ: "text", pflicht: true }], ergebnis: "{{e.umsetzbar}} / {{text}}" });

  const lauf = await dienst.warteAufEnde(dienst.starteLauf("ki", { ticket: "ABAP-1" }, { ausloeser: "manuell" }).nr);
  assert.equal(lauf.status, "erfolgreich", lauf.fehler ?? "");
  assert.equal(lauf.ergebnis, "true / Fertig.");
  assert.match(gesendet[0], /^Schätze ABAP-1 ein\.\n\nMelde dein Ergebnis zum Schluss mit dem Tool ergebnis_melden/);
  assert.equal(gesendet[2], "Fasse zusammen: passt");
  assert.equal(aufrufe, 3);
  // Jeder KI-Schritt hat seine eigene Sitzung; nur der mit Feldern bekommt ergebnis_melden.
  assert.ok(sitzungsStarts[0].plattformTools.some((t) => t.name === "ergebnis_melden"));
  assert.ok(!sitzungsStarts.at(-1)!.plattformTools.some((t) => t.name === "ergebnis_melden"));
});

test("Freigabe im Postfach: Lauf wartet, Freigeben führt aus; Verwerfen bricht ab; kein Änderungswunsch", async () => {
  const { dienst, lege, postfach, laufStatus } = mitWorkflows();
  lege("frei", [verschieben("schieben", "freigabe")]);

  const erster = dienst.starteLauf("frei", {}, { ausloeser: "manuell" }).nr;
  await warteBis(() => laufStatus(erster) === "wartet");
  const [eintrag] = postfach.fuerWorkflows();
  assert.deepEqual([eintrag.ohneKi, eintrag.workflowLauf, eintrag.art], [true, erster, "freigabe"]);
  assert.equal(postfach.anzahlOffen(), 1);
  assert.throws(() => postfach.antworten(eintrag.nr, "anders"), /nur freigeben oder verwerfen/);

  await postfach.freigeben(eintrag.nr);
  const fertig = await dienst.warteAufEnde(erster);
  assert.equal(fertig.status, "erfolgreich", fertig.fehler ?? "");
  assert.match(postfach.alle().find((e) => e.nr === eintrag.nr)?.ergebnis ?? "", /ABAP-123 von .* nach „Review“/);

  const zweiter = dienst.starteLauf("frei", {}, { ausloeser: "manuell" }).nr;
  await warteBis(() => laufStatus(zweiter) === "wartet");
  postfach.verwerfen(postfach.fuerWorkflows().find((e) => e.workflowLauf === zweiter)!.nr);
  const verworfen = await dienst.warteAufEnde(zweiter);
  assert.deepEqual([verworfen.status, verworfen.fehler], ["abgebrochen", `Vorschlag #${eintrag.nr + 1} wurde verworfen.`]);
});

test("KI-Schritt: Braucht ein Tool-Aufruf des Agenten Freigabe, wartet er im Postfach; Verwerfen bricht den Lauf ab", async () => {
  const ergebnisse: string[] = [];
  const { dienst, lege, postfach, laufStatus } = mitWorkflows(async (_text, { gateway }) => {
    // Regel des Agenten für jira-seite_anlegen: Freigabe (Testaufbau). Der Aufruf wartet auf David.
    const entscheidung = await gateway.vorAufruf({ server: "jira", tool: "seite_anlegen" }, { bereich: "ABAP", titel: "x", inhalt: "x" }, "a1");
    ergebnisse.push(entscheidung.ausfuehren ? "ausgeführt" : entscheidung.grund);
  });
  lege("doku", [{ id: "ki", titel: "Doku", art: "ki", agentId: "standard", auftrag: "Lege die Seite an", felder: [], ergebnis: "" }]);

  const erster = dienst.starteLauf("doku", {}, { ausloeser: "manuell" }).nr;
  await warteBis(() => laufStatus(erster) === "laeuft" && postfach.fuerWorkflows().length === 1);
  const [vorschlag] = postfach.fuerWorkflows();
  assert.deepEqual([vorschlag.ohneKi, vorschlag.workflowLauf], [false, erster], "Vorschlag eines Agenten – Änderungswunsch möglich");
  await postfach.freigeben(vorschlag.nr);
  assert.equal((await dienst.warteAufEnde(erster)).status, "erfolgreich");
  assert.deepEqual(ergebnisse, ["ausgeführt"]);

  const zweiter = dienst.starteLauf("doku", {}, { ausloeser: "manuell" }).nr;
  await warteBis(() => postfach.fuerWorkflows().some((e) => e.workflowLauf === zweiter));
  postfach.verwerfen(postfach.fuerWorkflows().find((e) => e.workflowLauf === zweiter)!.nr);
  const lauf = await dienst.warteAufEnde(zweiter);
  assert.equal(lauf.status, "abgebrochen");
  assert.match(lauf.fehler ?? "", /verworfen|abgebrochen/);
});

test("Lauf abbrechen: wartende Freigabe gilt als verworfen", async () => {
  const { dienst, lege, postfach, laufStatus } = mitWorkflows();
  lege("frei", [verschieben("schieben", "freigabe")]);
  const nr = dienst.starteLauf("frei", {}, { ausloeser: "manuell" }).nr;
  await warteBis(() => laufStatus(nr) === "wartet");
  dienst.abbrechen(nr);
  const lauf = await dienst.warteAufEnde(nr);
  assert.deepEqual([lauf.status, lauf.fehler], ["abgebrochen", "Von dir abgebrochen."]);
  assert.equal(postfach.alle()[0].status, "verworfen");
  assert.equal(postfach.anzahlOffen(), 0);
});

test("Credit-Limit: Überschreitet ein KI-Schritt das Limit, bricht der Lauf ab (E-69)", async () => {
  const { dienst, lege, abbrueche } = mitWorkflows((_text, _sitzung, melde) => {
    melde({ art: "verbrauch", modell: "x", eingabeTokens: 1, ausgabeTokens: 1, cacheTokens: 0, nanoAiu: 2e9, kostenfaktor: 1 });
  });
  lege("teuer", [{ id: "ki", titel: "", art: "ki", agentId: "standard", auftrag: "Mach", felder: [], ergebnis: "" }, verschieben("danach", "erlauben")], {
    creditLimit: 1,
  });
  const lauf = await dienst.warteAufEnde(dienst.starteLauf("teuer", {}, { ausloeser: "manuell" }).nr);
  assert.equal(lauf.status, "abgebrochen");
  assert.match(lauf.fehler ?? "", /Credit-Limit erreicht: 2\.00 von 1 AI-Credits/);
  assert.equal(abbrueche(), 1, "der laufende KI-Schritt wurde angehalten");
  assert.equal(lauf.verbrauch.nanoAiu, 2e9);
});

test("Neustart: Lauf ist unterbrochen, Fortsetzen wiederholt fertige Schritte nicht", async () => {
  const erster = mitWorkflows();
  erster.lege("zwei", [verschieben("eins", "erlauben", "Review"), verschieben("zwei", "freigabe", "Erledigt")]);
  const nr = erster.dienst.starteLauf("zwei", {}, { ausloeser: "manuell" }).nr;
  await warteBis(() => erster.laufStatus(nr) === "wartet");
  const vorher = holeSchritte(erster.db, nr).find((s) => s.schrittId === "eins")!;

  // Neue App-Instanz auf derselben Datenbank
  const zweiter = mitWorkflows(undefined, erster.ordner);
  zweiter.dienst.raeumeNachNeustartAuf();
  assert.equal(zweiter.laufStatus(nr), "unterbrochen");
  assert.equal(zweiter.postfach.alle()[0].status, "verworfen", "die alte Freigabe ist hinfällig");

  zweiter.dienst.fortsetzen(nr);
  await warteBis(() => zweiter.laufStatus(nr) === "wartet");
  assert.deepEqual(holeSchritte(zweiter.db, nr).find((s) => s.schrittId === "eins"), vorher, "Schritt eins wurde nicht wiederholt");
  await zweiter.postfach.freigeben(zweiter.postfach.fuerWorkflows().find((e) => e.status === "offen")!.nr);
  const lauf = await zweiter.dienst.warteAufEnde(nr);
  assert.equal(lauf.status, "erfolgreich", lauf.fehler ?? "");
  assert.throws(() => zweiter.dienst.fortsetzen(nr), /fortsetzen geht nur/);
});

test("Agent startet einen Workflow im Chat: Freigabe erscheint im Chat, das Ergebnis kommt zurück (E-68, E-71)", async () => {
  let ergebnis = "";
  const { db, chat, dienst, lege, postfach, status } = mitWorkflows(async (text, sitzung) => {
    if (text !== "starte") return;
    ergebnis = await sitzung.plattformTools.find((t) => t.name === "workflow_starten")!.fuehreAus({ workflow: "frei" });
  });
  lege("frei", [verschieben("schieben", "freigabe")], { ergebnis: "verschoben: {{schieben}}" });
  aendereAgent(db, "standard", { ...holeAgent(db, "standard")!, workflows: ["frei"] });

  const { id } = await chat.neueAufgabe();
  chat.nimmNachrichtAn(id, "starte");
  await warteBis(() => postfach.fuerAufgabe(id).length === 1 && status(id) === "wartet");
  assert.deepEqual(postfach.fuerWorkflows(), [], "nicht im Postfach, sondern im Chat");
  assert.equal(postfach.anzahlOffen(), 0);
  const arten = holeEreignisse(db, id).map((e) => e.art);
  assert.ok(arten.includes("workflow_lauf") && arten.includes("postfach"), arten.join(", "));
  assert.throws(() => chat.nimmNachrichtAn(id, "bitte anders"), /fester Workflow-Schritt wartet/);

  await postfach.freigeben(postfach.fuerAufgabe(id)[0].nr);
  await warteBis(() => status(id) === "bereit");
  assert.match(ergebnis, /^Lauf #\d+ von Workflow „Workflow frei“ ist erfolgreich fertig\.\nErgebnis:\nverschoben: ABAP-123 von/);
  assert.equal(dienst.liste()[0].agenten[0], "Test");
});

test("warten: false – der Agent bekommt im Chat eine Nachricht, wenn der Lauf fertig ist", async () => {
  let antwort = "";
  const { db, chat, lege, gesendet, status } = mitWorkflows(async (text, sitzung) => {
    if (text === "starte") antwort = await sitzung.plattformTools.find((t) => t.name === "workflow_starten")!.fuehreAus({ workflow: "kurz", warten: false });
  });
  lege("kurz", [{ id: "s", titel: "", art: "setzen", name: "x", wert: "42" }], { ergebnis: "{{x}}" });
  aendereAgent(db, "standard", { ...holeAgent(db, "standard")!, workflows: ["kurz"] });

  const { id } = await chat.neueAufgabe();
  chat.nimmNachrichtAn(id, "starte");
  await warteBis(() => gesendet.length === 2 && status(id) === "bereit");
  assert.match(antwort, /^Lauf #\d+ ist gestartet\. Wenn er fertig ist, bekommst du eine Nachricht\./);
  assert.match(gesendet[1], /^\[Hinweis der App: Lauf #\d+ von Workflow „Workflow kurz“ ist erfolgreich fertig\.\nErgebnis:\n42\]$/);
});

test("Startwege: nur, was angehakt ist; Agenten nur mit Zuordnung", async () => {
  const { db, dienst, lege, sitzungsStarts, chat, status } = mitWorkflows();
  lege("nur-agent", [], { start: { manuell: false, durchAgent: true } });
  assert.throws(() => dienst.starteLauf("nur-agent", {}, { ausloeser: "manuell" }), /nicht für den manuellen Start/);

  // Ohne Zuordnung bekommt der Agent kein workflow_starten
  const { id } = await chat.neueAufgabe();
  chat.nimmNachrichtAn(id, "hallo");
  await warteBis(() => status(id) === "bereit");
  assert.ok(!sitzungsStarts[0].plattformTools.some((t) => t.name === "workflow_starten"));
  assert.equal(holeAgent(db, "standard")!.workflows.length, 0);
});

test("Workflow ruft Workflow: Ergebnis des Unterlaufs landet in der Variablen", async () => {
  const { dienst, lege } = mitWorkflows();
  lege("innen", [{ id: "s", titel: "", art: "setzen", name: "x", wert: "{{eingaben.wert}}!" }], {
    eingaben: [{ name: "wert", typ: "text" }],
    ergebnis: "{{x}}",
  });
  lege("aussen", [{ id: "rufe", titel: "", art: "workflow", workflowId: "innen", eingaben: { wert: "hallo" }, ergebnis: "r" }], { ergebnis: "{{r}}" });
  const lauf = await dienst.warteAufEnde(dienst.starteLauf("aussen", {}, { ausloeser: "manuell" }).nr);
  assert.deepEqual([lauf.status, lauf.ergebnis], ["erfolgreich", "hallo!"]);
});
