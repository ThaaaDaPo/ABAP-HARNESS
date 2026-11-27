// Prüft Chats löschen, das Aufräumen leerer Chats und die Modellwahl je Chat. npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { holeAlleAufgaben, merkeHinweisFuerAgent } from "../datenbank/aufgaben.ts";
import { aufbauen, warteBis } from "../testhilfe.ts";

test("Neuer Chat räumt leere Chats weg, Chats mit Inhalt bleiben", async () => {
  const { db, chat, status } = aufbauen();
  const mitInhalt = (await chat.neueAufgabe()).id;
  chat.nimmNachrichtAn(mitInhalt, "Hallo");
  await warteBis(() => status(mitInhalt) === "bereit");

  await chat.neueAufgabe();
  await chat.neueAufgabe();
  const letzter = (await chat.neueAufgabe()).id;
  assert.deepEqual(holeAlleAufgaben(db).map((a) => a.id).sort(), [mitInhalt, letzter].sort());
});

test("Löschen entfernt Chat, Verlauf, Postfach-Einträge und die gespeicherte Sitzung", async () => {
  const { db, chat, postfach, geloescht, status } = aufbauen((_text, { gateway }) => {
    gateway.vorAufruf({ server: "jira", tool: "seite_anlegen" }, { bereich: "ABAP", titel: "x", inhalt: "x" });
  });
  const { id } = await chat.neueAufgabe();
  chat.nimmNachrichtAn(id, "Seite anlegen");
  await warteBis(() => status(id) === "wartet");
  assert.equal(postfach.alle().length, 1);

  await chat.loescheAufgabe(id);
  assert.equal(holeAlleAufgaben(db).length, 0);
  assert.equal(postfach.alle().length, 0);
  assert.equal((db.prepare(`SELECT COUNT(*) AS n FROM ereignisse`).get() as { n: number }).n, 0);
  assert.deepEqual(geloescht, ["sitzung-1"]);
});

test("Ein Chat, an dem der Agent arbeitet, wird nicht gelöscht", async () => {
  let loslassen = () => {};
  const { chat, gesendet } = aufbauen(() => new Promise<void>((r) => (loslassen = r)));
  const { id } = await chat.neueAufgabe();
  chat.nimmNachrichtAn(id, "lang");
  await warteBis(() => gesendet.length === 1);
  await assert.rejects(chat.loescheAufgabe(id), /erst abbrechen/);
  loslassen();
});

test("Modellwahl wird geprüft und gilt ab der nächsten Nachricht", async () => {
  const { chat, sitzungsStarts, status } = aufbauen();
  const { id } = await chat.neueAufgabe();
  chat.nimmNachrichtAn(id, "eins");
  await warteBis(() => status(id) === "bereit");
  assert.deepEqual(pick(sitzungsStarts[0]), { modell: "", denkaufwand: "", kontext: "standard" });

  // Was das Modell nicht kann, wird abgelehnt
  await assert.rejects(chat.setzeModellWahl(id, { modell: "gibtsnicht", denkaufwand: "", kontext: "standard" }), /steht nicht zur Wahl/);
  await assert.rejects(chat.setzeModellWahl(id, { modell: "klein", denkaufwand: "high", kontext: "standard" }), /kennt den Thinking Effort/);
  await assert.rejects(chat.setzeModellWahl(id, { modell: "klein", denkaufwand: "", kontext: "lang" }), /keinen langen Kontext/);

  const aufgabe = await chat.setzeModellWahl(id, { modell: "gross", denkaufwand: "high", kontext: "lang" });
  assert.deepEqual(aufgabe.modellWahl, { modell: "gross", denkaufwand: "high", kontext: "lang" });

  // Nächste Nachricht: Sitzung wird mit der neuen Wahl fortgesetzt (gleiche Sitzung, Kontext bleibt)
  chat.nimmNachrichtAn(id, "zwei");
  await warteBis(() => sitzungsStarts.length === 2 && status(id) === "bereit");
  assert.deepEqual(pick(sitzungsStarts[1]), { modell: "gross", denkaufwand: "high", kontext: "lang" });
});

function pick(e: { modell: string; denkaufwand: string; kontext: string }) {
  return { modell: e.modell, denkaufwand: e.denkaufwand, kontext: e.kontext };
}

test("Ein Hinweis der App (z. B. Rückgängig) steht einmal vor der nächsten Nachricht an den Agenten", async () => {
  const { db, chat, gesendet, status } = aufbauen();
  const { id } = await chat.neueAufgabe();
  merkeHinweisFuerAgent(db, id, "Änderung A rückgängig.");
  merkeHinweisFuerAgent(db, id, "Änderung B rückgängig.");
  assert.equal(chat.istBeschaeftigt(id), false);
  chat.nimmNachrichtAn(id, "weiter");
  await warteBis(() => status(id) === "bereit");
  chat.nimmNachrichtAn(id, "noch mal");
  await warteBis(() => gesendet.length === 2 && status(id) === "bereit");
  assert.equal(gesendet[0], "[Hinweis der App: Änderung A rückgängig.\nÄnderung B rückgängig.]\n\nweiter");
  assert.equal(gesendet[1], "noch mal");
});
