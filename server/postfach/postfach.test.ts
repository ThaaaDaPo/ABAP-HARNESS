// Prüft Postfach-Aktionen, Wiederaufnahme und Warteschlange (E-44 bis E-47).
// Statt eines Modells läuft eine kleine Test-Laufzeit; freigegebene Aufrufe gehen an den echten
// Jira-Stellvertreter-Prozess. Läuft ohne Copilot: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { holeEintrag } from "../datenbank/postfach.ts";
import { setzeRegel } from "../datenbank/tool-regeln.ts";
import { aufbauen, warteBis, type Verhalten } from "../testhilfe.ts";

/** Der Agent will eine Confluence-Seite anlegen; das Gateway legt den Vorschlag ab. */
const seiteVorschlagen: Verhalten = (text, { gateway }) => {
  if (/seite/i.test(text)) gateway.vorAufruf({ server: "jira", tool: "seite_anlegen" }, { bereich: "ABAP", titel: "Doku", inhalt: "x" });
};

test("Freigabe zum Abschluss: Plattform führt aus, ohne KI; Aufgabe erledigt", async () => {
  const { chat, postfach, gesendet, status } = aufbauen(seiteVorschlagen);
  const { id } = await chat.neueAufgabe();
  chat.nimmNachrichtAn(id, "Lege die Seite an");
  await warteBis(() => status(id) === "wartet");

  await postfach.freigeben(1);
  const eintrag = postfach.alle()[0];
  assert.equal(eintrag.status, "freigegeben");
  assert.match(eintrag.ergebnis ?? "", /Seite \d+ „Doku“ im Bereich ABAP angelegt/);
  assert.equal(status(id), "erledigt");
  assert.equal(gesendet.length, 1, "Der Agent wurde nach der Freigabe nicht noch einmal gefragt");
  await assert.rejects(postfach.freigeben(1), /schon erledigt/);
});

test("Verwerfen: nicht ausgeführt, Aufgabe abgebrochen, ohne KI", async () => {
  const { chat, postfach, gesendet, status } = aufbauen(seiteVorschlagen);
  const { id } = await chat.neueAufgabe();
  chat.nimmNachrichtAn(id, "Lege die Seite an");
  await warteBis(() => status(id) === "wartet");

  postfach.verwerfen(1);
  assert.equal(postfach.alle()[0].status, "verworfen");
  assert.equal(status(id), "abgebrochen");
  assert.equal(gesendet.length, 1);
});

test("Änderungen anfordern: Agent macht in derselben Aufgabe weiter und legt neu vor", async () => {
  const { chat, postfach, gesendet, status } = aufbauen(seiteVorschlagen);
  const { id } = await chat.neueAufgabe();
  chat.nimmNachrichtAn(id, "Lege die Seite an");
  await warteBis(() => status(id) === "wartet");

  postfach.antworten(1, "Bitte mit Beispiel");
  await warteBis(() => gesendet.length === 2 && status(id) === "wartet");
  assert.match(gesendet[1], /Änderungswunsch zu Vorschlag #1.*NICHT ausgeführt.*Bitte mit Beispiel/s);
  assert.equal(postfach.alle().find((e) => e.nr === 1)?.status, "aenderung_angefordert");
  assert.equal(postfach.alle().find((e) => e.nr === 2)?.status, "offen", "neuer Vorschlag liegt vor");
});

test("Freigabe zum Weitermachen: Aufgabe pausiert und geht nach der Freigabe mit dem Ergebnis weiter", async () => {
  const { db, chat, postfach, gesendet, status } = aufbauen((text, sitzung) => {
    if (!text.includes("Seiten")) return;
    // Zwei Vorschläge, und der Agent braucht beide Ergebnisse
    sitzung.gateway.vorAufruf({ server: "jira", tool: "seite_anlegen" }, { bereich: "ABAP", titel: "Eins", inhalt: "x" });
    sitzung.gateway.vorAufruf({ server: "jira", tool: "seite_anlegen" }, { bereich: "ABAP", titel: "Zwei", inhalt: "x" });
    const werkzeug = (name: string) => sitzung.plattformTools.find((t) => t.name === name)!;
    assert.match(werkzeug("auf_freigabe_warten").fuehreAus({ vorschlag: 1 }), /pausiert, bis Vorschlag #1/);
    assert.match(werkzeug("auf_freigabe_warten").fuehreAus({}), /pausiert, bis Vorschlag #2/);
  });
  const { id } = await chat.neueAufgabe();
  chat.nimmNachrichtAn(id, "Lege zwei Seiten an und verlinke sie");
  await warteBis(() => status(id) === "wartet");
  assert.equal(holeEintrag(db, 1)?.weiterNachFreigabe, true);

  // Erst nach der zweiten Freigabe geht es weiter – mit beiden Ergebnissen in einer Nachricht
  await postfach.freigeben(1);
  assert.equal(status(id), "wartet");
  await postfach.freigeben(2);
  await warteBis(() => gesendet.length === 2);
  assert.match(gesendet[1], /Vorschlag #1 .*„Eins“.*Vorschlag #2 .*„Zwei“/s);
  await warteBis(() => status(id) === "bereit");
});

test("Rückfrage: landet im Postfach, Antwort setzt den Agenten fort", async () => {
  const { chat, postfach, gesendet, status } = aufbauen((text, sitzung) => {
    if (text === "Mach was") sitzung.plattformTools.find((t) => t.name === "rueckfrage_stellen")!.fuehreAus({ frage: "Welches Paket?" });
  });
  const { id } = await chat.neueAufgabe();
  chat.nimmNachrichtAn(id, "Mach was");
  await warteBis(() => status(id) === "wartet");
  const eintrag = postfach.alle()[0];
  assert.deepEqual([eintrag.art, eintrag.argumente], ["rueckfrage", { frage: "Welches Paket?" }]);

  postfach.antworten(1, "$TMP");
  await warteBis(() => gesendet.length === 2 && status(id) === "bereit");
  assert.equal(gesendet[1], "Antwort auf deine Rückfrage #1:\n$TMP");
});

test("Warteschlange: Der Agent arbeitet nacheinander, nicht gleichzeitig", async () => {
  let loslassen = () => {};
  const { chat, gesendet, status } = aufbauen(async (text) => {
    if (text === "lang") await new Promise<void>((r) => (loslassen = r));
  });
  // Nacheinander anlegen: „Neuer Chat“ räumt leere Chats weg
  const a = (await chat.neueAufgabe()).id;
  chat.nimmNachrichtAn(a, "lang");
  const b = (await chat.neueAufgabe()).id;
  chat.nimmNachrichtAn(b, "kurz");
  await warteBis(() => gesendet.length === 1);
  assert.equal(status(a), "arbeitet");
  assert.equal(status(b), "eingereiht");
  assert.deepEqual(gesendet, ["lang"]);
  assert.throws(() => chat.nimmNachrichtAn(b, "noch was"), /noch beschäftigt/);

  loslassen();
  await warteBis(() => status(b) === "bereit");
  assert.deepEqual(gesendet, ["lang", "kurz"]);
});

test("Freigabe wird abgelehnt, wenn das Tool inzwischen verboten ist", async () => {
  const { db, chat, postfach, status } = aufbauen(seiteVorschlagen);
  const { id } = await chat.neueAufgabe();
  chat.nimmNachrichtAn(id, "Lege die Seite an");
  await warteBis(() => status(id) === "wartet");
  setzeRegel(db, "standard", "jira", "seite_anlegen", "verbieten");
  await assert.rejects(postfach.freigeben(1), /inzwischen verboten/);
  assert.equal(postfach.alle()[0].status, "offen");
});

test("Im Chat: Die nächste Nachricht beantwortet eine offene Rückfrage", async () => {
  const { chat, postfach, gesendet, status } = aufbauen((text, sitzung) => {
    if (text === "Mach was") sitzung.plattformTools.find((t) => t.name === "rueckfrage_stellen")!.fuehreAus({ frage: "Welches Paket?" });
  });
  const { id } = await chat.neueAufgabe();
  chat.nimmNachrichtAn(id, "Mach was");
  await warteBis(() => status(id) === "wartet");

  chat.nimmNachrichtAn(id, "$TMP");
  await warteBis(() => gesendet.length === 2 && status(id) === "bereit");
  assert.equal(gesendet[1], "Antwort auf deine Rückfrage #1:\n$TMP");
  assert.deepEqual([postfach.fuerAufgabe(id)[0].status, postfach.fuerAufgabe(id)[0].antwort], ["beantwortet", "$TMP"]);
});

test("Chat-Einträge gehören nicht ins Postfach, Meldungen aus Chats gelten als gesehen", async () => {
  const { db, chat, postfach, status } = aufbauen((_text, { gateway }) => {
    gateway.vorAufruf({ server: "jira", tool: "seite_anlegen" }, { bereich: "ABAP", titel: "x", inhalt: "x" });
    gateway.nachAufruf({ server: "jira", tool: "ticket_verschieben" }, {}, "verschoben");
  });
  setzeRegel(db, "standard", "jira", "ticket_verschieben", "melden");
  const { id } = await chat.neueAufgabe();
  chat.nimmNachrichtAn(id, "los");
  await warteBis(() => status(id) === "wartet");

  assert.deepEqual(postfach.fuerWorkflows(), []);
  assert.equal(postfach.anzahlOffen(), 0);
  assert.deepEqual(
    postfach.fuerAufgabe(id).map((e) => [e.art, e.status]),
    [
      ["freigabe", "offen"],
      ["meldung", "zur_kenntnis"],
    ],
  );

  // Dieselbe Aufgabe als Workflow (kommt in Phase 4): dann landet sie im Postfach
  db.prepare(`UPDATE aufgaben SET herkunft = 'workflow' WHERE id = ?`).run(id);
  assert.deepEqual(postfach.fuerWorkflows().map((e) => e.nr), [1, 2]);
  assert.equal(postfach.anzahlOffen(), 1);
});
