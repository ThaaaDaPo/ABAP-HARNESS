// Prüft Freigaben, Rückfragen, Wiederaufnahme und Warteschlange.
// Im Chat wartet der Agent mitten im Tool-Aufruf auf David (E-54); ohne David (Workflow) wird der
// Vorschlag abgelegt und der Agent arbeitet weiter (E-44, E-45).
// Statt eines Modells läuft eine kleine Test-Laufzeit; Aufrufe ohne wartenden Agenten gehen an den
// echten Jira-Stellvertreter-Prozess. Läuft ohne Copilot: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import type { ChatDienst } from "../chat/chat-dienst.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import { holeEintrag } from "../datenbank/postfach.ts";
import { setzeRegel } from "../datenbank/tool-regeln.ts";
import * as warteschlange from "../datenbank/warteschlange.ts";
import { aufbauen, warteBis, type Verhalten } from "../testhilfe.ts";

const seite = { server: "jira", tool: "seite_anlegen" };

/** Wie Copilot: fragt das Gateway, prüft die zweite Sperre, „führt aus“ und meldet das Ergebnis. */
const seiteAnlegen =
  (merke: string[] = []): Verhalten =>
  async (text, { gateway }) => {
    if (!/seite/i.test(text)) return;
    const entscheidung = await gateway.vorAufruf(seite, { bereich: "ABAP", titel: "Doku", inhalt: "x" }, "aufruf-1");
    if (!entscheidung.ausfuehren) {
      merke.push(entscheidung.grund);
      return;
    }
    assert.equal(gateway.darfAusfuehren(seite), true);
    assert.equal(gateway.darfAusfuehren(seite), false, "eine Freigabe gilt für genau einen Aufruf");
    gateway.nachAufruf(seite, {}, "Seite angelegt.", "aufruf-1");
    merke.push("ausgeführt");
  };

// ---------------------------------------------------------------------------------------------
// Im Chat: Der Agent wartet auf David (E-54)
// ---------------------------------------------------------------------------------------------

test("Chat: Der Aufruf wartet, nach dem Freigeben läuft das Tool und der Agent hat das Ergebnis", async () => {
  const merke: string[] = [];
  const { chat, postfach, gesendet, status } = aufbauen(seiteAnlegen(merke));
  const { id } = await chat.neueAufgabe();
  chat.nimmNachrichtAn(id, "Lege die Seite an");
  await warteBis(() => status(id) === "wartet");
  assert.deepEqual(merke, [], "das Tool ist noch nicht gelaufen und nicht fehlgeschlagen");

  await postfach.freigeben(1);
  await warteBis(() => status(id) === "bereit");
  assert.deepEqual(merke, ["ausgeführt"]);
  assert.deepEqual([postfach.fuerAufgabe(id)[0].status, postfach.fuerAufgabe(id)[0].ergebnis], ["freigegeben", "Seite angelegt."]);
  assert.equal(gesendet.length, 1, "keine zusätzliche Nachricht an den Agenten");
});

test("Chat: Eine Nachricht, während der Agent wartet, ist der Änderungswunsch", async () => {
  const merke: string[] = [];
  const { chat, postfach, gesendet, status } = aufbauen(seiteAnlegen(merke));
  const { id } = await chat.neueAufgabe();
  chat.nimmNachrichtAn(id, "Lege die Seite an");
  await warteBis(() => status(id) === "wartet");

  chat.nimmNachrichtAn(id, "Bitte auf Englisch");
  await warteBis(() => status(id) === "bereit");
  assert.match(merke[0], /nicht freigegeben und wünscht Änderungen:\nBitte auf Englisch/);
  assert.deepEqual([postfach.fuerAufgabe(id)[0].status, postfach.fuerAufgabe(id)[0].antwort], ["aenderung_angefordert", "Bitte auf Englisch"]);
  assert.equal(gesendet.length, 1, "geht an den wartenden Aufruf, nicht als neue Nachricht");
});

test("Chat: Verwerfen lehnt ab, hält den Lauf an und bricht die Aufgabe ab", async () => {
  const merke: string[] = [];
  const { chat, postfach, status, abbrueche } = aufbauen(seiteAnlegen(merke));
  const { id } = await chat.neueAufgabe();
  chat.nimmNachrichtAn(id, "Lege die Seite an");
  await warteBis(() => status(id) === "wartet");

  postfach.verwerfen(1);
  await warteBis(() => status(id) === "abgebrochen");
  assert.match(merke[0], /verworfen/);
  assert.equal(abbrueche(), 1);
});

test("Chat: Rückfrage wartet auf die Antwort im Eingabefeld und liefert sie als Ergebnis", async () => {
  let ergebnis = "";
  const { chat, postfach, gesendet, status } = aufbauen(async (text, sitzung) => {
    if (text !== "Mach was") return;
    const werkzeug = sitzung.plattformTools.find((t) => t.name === "rueckfrage_stellen")!;
    ergebnis = await werkzeug.fuehreAus({ frage: "Welches Paket?" });
  });
  const { id } = await chat.neueAufgabe();
  chat.nimmNachrichtAn(id, "Mach was");
  await warteBis(() => status(id) === "wartet");

  chat.nimmNachrichtAn(id, "$TMP");
  await warteBis(() => status(id) === "bereit");
  assert.equal(ergebnis, "Antwort des Nutzers:\n$TMP");
  assert.deepEqual([postfach.fuerAufgabe(id)[0].status, postfach.fuerAufgabe(id)[0].antwort], ["beantwortet", "$TMP"]);
  assert.equal(gesendet.length, 1);
});

test("Chat: Im Chat gibt es kein auf_freigabe_warten – der Aufruf wartet selbst", async () => {
  let namen: string[] = [];
  const { chat, status } = aufbauen((_text, sitzung) => void (namen = sitzung.plattformTools.map((t) => t.name)));
  const { id } = await chat.neueAufgabe();
  chat.nimmNachrichtAn(id, "hallo");
  await warteBis(() => status(id) === "bereit");
  assert.deepEqual(namen, ["rueckfrage_stellen"]);
});

test("Chat: Während der Agent in einem Chat wartet, läuft ein anderer; die Freigabe geht sofort weiter", async () => {
  const merke: string[] = [];
  let loslassen = () => {};
  const { chat, postfach, gesendet, status } = aufbauen(async (text, sitzung, melde) => {
    if (text === "lang") return new Promise<void>((r) => (loslassen = r));
    await seiteAnlegen(merke)(text, sitzung, melde);
  });
  const a = (await chat.neueAufgabe()).id;
  chat.nimmNachrichtAn(a, "Lege die Seite an");
  await warteBis(() => status(a) === "wartet");

  const b = (await chat.neueAufgabe()).id;
  chat.nimmNachrichtAn(b, "lang");
  await warteBis(() => status(b) === "arbeitet" && gesendet.length === 2);

  // A wird freigegeben, während B noch arbeitet: Jeder Chat läuft für sich (E-57), A wartet nicht auf B.
  await postfach.freigeben(1);
  await warteBis(() => status(a) === "bereit");
  assert.deepEqual(merke, ["ausgeführt"]);
  assert.equal(status(b), "arbeitet");

  loslassen();
  await warteBis(() => status(b) === "bereit");
  assert.deepEqual(gesendet, ["Lege die Seite an", "lang"]);
});

test("Chat nach einem Neustart: Freigeben führt den Aufruf selbst aus und setzt den Agenten fort", async () => {
  const erster = aufbauen(seiteAnlegen());
  const { id } = await erster.chat.neueAufgabe();
  erster.chat.nimmNachrichtAn(id, "Lege die Seite an");
  await warteBis(() => erster.status(id) === "wartet");

  // Neue App-Instanz auf derselben Datenbank: Niemand wartet mehr auf den Vorschlag
  const zweiter = aufbauen(() => {}, erster.ordner);
  await zweiter.postfach.freigeben(1);
  await warteBis(() => zweiter.gesendet.length === 1 && zweiter.status(id) === "bereit");
  assert.match(zweiter.gesendet[0], /Vorschlag #1 \(jira-seite_anlegen\) wurde freigegeben und ausgeführt. Ergebnis:\nSeite \d+ „Doku“/);
});

// ---------------------------------------------------------------------------------------------
// Ohne David (Workflow, ab Phase 4): Vorschlag ablegen, weiterarbeiten (E-44, E-45, E-47)
// ---------------------------------------------------------------------------------------------

/** Legt eine Aufgabe als Workflow an (bis Phase 4 gibt es dafür noch keinen eigenen Weg). */
async function neuerWorkflow(chat: ChatDienst, db: Datenbank): Promise<string> {
  const { id } = await chat.neueAufgabe();
  db.prepare(`UPDATE aufgaben SET herkunft = 'workflow' WHERE id = ?`).run(id);
  return id;
}

test("Workflow: Freigabe zum Abschluss – Plattform führt aus, ohne KI; Aufgabe erledigt", async () => {
  const { db, chat, postfach, gesendet, status } = aufbauen(seiteAnlegen());
  const id = await neuerWorkflow(chat, db);
  chat.nimmNachrichtAn(id, "Lege die Seite an");
  await warteBis(() => status(id) === "wartet");
  assert.deepEqual(postfach.fuerWorkflows().map((e) => e.nr), [1]);

  await postfach.freigeben(1);
  const eintrag = postfach.alle()[0];
  assert.equal(eintrag.status, "freigegeben");
  assert.match(eintrag.ergebnis ?? "", /Seite \d+ „Doku“ im Bereich ABAP angelegt/);
  assert.equal(status(id), "erledigt");
  assert.equal(gesendet.length, 1, "Der Agent wurde nach der Freigabe nicht noch einmal gefragt");
  await assert.rejects(postfach.freigeben(1), /schon erledigt/);
});

test("Workflow: Verwerfen – nicht ausgeführt, Aufgabe abgebrochen, ohne KI", async () => {
  const { db, chat, postfach, gesendet, status } = aufbauen(seiteAnlegen());
  const id = await neuerWorkflow(chat, db);
  chat.nimmNachrichtAn(id, "Lege die Seite an");
  await warteBis(() => status(id) === "wartet");

  postfach.verwerfen(1);
  assert.equal(postfach.alle()[0].status, "verworfen");
  assert.equal(status(id), "abgebrochen");
  assert.equal(gesendet.length, 1);
});

test("Workflow: Änderungen anfordern – Agent macht in derselben Aufgabe weiter und legt neu vor", async () => {
  const { db, chat, postfach, gesendet, status } = aufbauen(seiteAnlegen());
  const id = await neuerWorkflow(chat, db);
  chat.nimmNachrichtAn(id, "Lege die Seite an");
  await warteBis(() => status(id) === "wartet");

  postfach.antworten(1, "Bitte mit Beispiel");
  await warteBis(() => gesendet.length === 2 && status(id) === "wartet");
  assert.match(gesendet[1], /Änderungswunsch zu Vorschlag #1.*NICHT ausgeführt.*Bitte mit Beispiel/s);
  assert.equal(postfach.alle().find((e) => e.nr === 1)?.status, "aenderung_angefordert");
  assert.equal(postfach.alle().find((e) => e.nr === 2)?.status, "offen", "neuer Vorschlag liegt vor");
});

test("Workflow: Freigabe zum Weitermachen – pausiert und geht nach allen Freigaben mit den Ergebnissen weiter", async () => {
  const { db, chat, postfach, gesendet, status } = aufbauen(async (text, sitzung) => {
    if (!text.includes("Seiten")) return;
    await sitzung.gateway.vorAufruf(seite, { bereich: "ABAP", titel: "Eins", inhalt: "x" });
    await sitzung.gateway.vorAufruf(seite, { bereich: "ABAP", titel: "Zwei", inhalt: "x" });
    const werkzeug = sitzung.plattformTools.find((t) => t.name === "auf_freigabe_warten")!;
    assert.match(await werkzeug.fuehreAus({ vorschlag: 1 }), /pausiert, bis Vorschlag #1/);
    assert.match(await werkzeug.fuehreAus({}), /pausiert, bis Vorschlag #2/);
  });
  const id = await neuerWorkflow(chat, db);
  chat.nimmNachrichtAn(id, "Lege zwei Seiten an und verlinke sie");
  await warteBis(() => status(id) === "wartet");
  assert.equal(holeEintrag(db, 1)?.weiterNachFreigabe, true);

  await postfach.freigeben(1);
  assert.equal(status(id), "wartet");
  await postfach.freigeben(2);
  await warteBis(() => gesendet.length === 2);
  assert.match(gesendet[1], /Vorschlag #1 .*„Eins“.*Vorschlag #2 .*„Zwei“/s);
  await warteBis(() => status(id) === "bereit");
});

test("Workflow: Rückfrage – Agent hört auf, die Antwort im Postfach setzt ihn fort", async () => {
  const { db, chat, postfach, gesendet, status } = aufbauen(async (text, sitzung) => {
    if (text === "Mach was") await sitzung.plattformTools.find((t) => t.name === "rueckfrage_stellen")!.fuehreAus({ frage: "Welches Paket?" });
  });
  const id = await neuerWorkflow(chat, db);
  chat.nimmNachrichtAn(id, "Mach was");
  await warteBis(() => status(id) === "wartet");

  postfach.antworten(1, "$TMP");
  await warteBis(() => gesendet.length === 2 && status(id) === "bereit");
  assert.equal(gesendet[1], "Antwort auf deine Rückfrage #1:\n$TMP");
});

test("Freigabe wird abgelehnt, wenn das Tool inzwischen verboten ist", async () => {
  const { db, chat, postfach, status } = aufbauen(seiteAnlegen());
  const { id } = await chat.neueAufgabe();
  chat.nimmNachrichtAn(id, "Lege die Seite an");
  await warteBis(() => status(id) === "wartet");
  setzeRegel(db, "standard", "jira", "seite_anlegen", "verbieten");
  await assert.rejects(postfach.freigeben(1), /inzwischen verboten/);
  assert.equal(postfach.alle()[0].status, "offen");
});

test("Parallel: Chats laufen gleichzeitig, im selben Chat geht es der Reihe nach", async () => {
  const offen: (() => void)[] = [];
  const { db, chat, gesendet, status } = aufbauen(async (text) => {
    if (text.startsWith("lang")) await new Promise<void>((r) => offen.push(r));
  });
  // Zwei Chats desselben Agenten
  const a = (await chat.neueAufgabe()).id;
  chat.nimmNachrichtAn(a, "lang A");
  const b = (await chat.neueAufgabe()).id;
  chat.nimmNachrichtAn(b, "lang B");
  await warteBis(() => gesendet.length === 2);
  assert.deepEqual([status(a), status(b)], ["arbeitet", "arbeitet"]);
  assert.throws(() => chat.nimmNachrichtAn(a, "noch was"), /noch beschäftigt/);

  // Eine Fortsetzung für einen laufenden Chat wartet, bis sein Lauf fertig ist
  chat.setzeFortAusPostfach(a, "Fortsetzung");
  assert.equal(warteschlange.stehtAn(db, a), true);
  offen.shift()!();
  await warteBis(() => gesendet.length === 3);
  assert.equal(gesendet[2], "Fortsetzung");
  await warteBis(() => status(a) === "bereit");

  offen.shift()!();
  await warteBis(() => status(b) === "bereit");
});

test("Chat-Einträge gehören nicht ins Postfach, Meldungen aus Chats gelten als gesehen", async () => {
  const { db, chat, postfach, status } = aufbauen((_text, { gateway }) => {
    gateway.nachAufruf({ server: "jira", tool: "ticket_verschieben" }, {}, "verschoben");
  });
  setzeRegel(db, "standard", "jira", "ticket_verschieben", "melden");
  const { id } = await chat.neueAufgabe();
  chat.nimmNachrichtAn(id, "los");
  await warteBis(() => status(id) === "bereit");

  assert.deepEqual(postfach.fuerWorkflows(), []);
  assert.equal(postfach.anzahlOffen(), 0);
  assert.deepEqual(postfach.fuerAufgabe(id).map((e) => [e.art, e.status]), [["meldung", "zur_kenntnis"]]);
});
