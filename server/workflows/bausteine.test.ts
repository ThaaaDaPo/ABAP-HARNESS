// Prüft die Bausteine der Workflows ohne Lauf: Platzhalter, Bedingungen, Prüfung der Datei,
// Eingaben und Zeitplan. npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { alsListe, argumentWert, lies, pruefeBedingung, setzeEin } from "./ausdruecke.ts";
import { beispielWorkflow } from "./beispiel.ts";
import { pruefeDefinition, pruefeEingaben } from "./pruefen.ts";
import { toleranz, uhrzeitFaellig, Zeitsteuerung } from "./zeitsteuerung.ts";

const variablen = {
  eingaben: { status: "Offen" },
  tickets: [{ schluessel: "ABAP-1", titel: "Eins" }, { schluessel: "ABAP-2" }],
  json: '{"a": {"b": 7}}',
  zahl: 3,
};

test("Platzhalter: einzelner behält den Typ, sonst wird Text eingesetzt", () => {
  assert.deepEqual(setzeEin("{{tickets}}", variablen), variablen.tickets);
  assert.equal(setzeEin("{{ tickets[1].schluessel }}", variablen), "ABAP-2");
  assert.equal(setzeEin("Status {{eingaben.status}}, {{zahl}} Stück, {{fehlt}}!", variablen), "Status Offen, 3 Stück, !");
  assert.equal(lies(variablen, "json.a.b"), 7, "JSON im Text lässt sich durchsuchen");
  assert.equal(lies(variablen, "tickets[5].titel"), undefined);
  assert.throws(() => setzeEin("{{a..b}}", variablen), /Ungültiger Platzhalter/);
});

test("Tool-Argumente: Text bleibt Text, geschriebenes JSON wird übernommen", () => {
  assert.equal(argumentWert("123", variablen, "string"), "123");
  assert.equal(argumentWert("123", variablen, ""), 123);
  assert.deepEqual(argumentWert('["A","B"]', variablen, "array"), ["A", "B"]);
  assert.equal(argumentWert("{{eingaben.status}}", variablen, ""), "Offen");
});

test("Für jedes: Liste, JSON-Liste oder eine Zeile je Eintrag", () => {
  assert.deepEqual(alsListe(["a"]), ["a"]);
  assert.deepEqual(alsListe('[1, 2]'), [1, 2]);
  assert.deepEqual(alsListe("A\n\n B \n"), ["A", "B"]);
  assert.deepEqual(alsListe(""), []);
});

test("Bedingungen", () => {
  const b = (links: string, vergleich: any, rechts = "") => pruefeBedingung({ links, vergleich, rechts }, variablen);
  assert.equal(b("{{zahl}}", "gleich", "3"), true);
  assert.equal(b("{{eingaben.status}}", "gleich", "offen"), true, "ohne Groß-/Kleinschreibung");
  assert.equal(b("{{tickets}}", "groesser", "1"), true, "Liste: Anzahl");
  assert.equal(b("{{tickets}}", "leer"), false);
  assert.equal(b("{{fehlt}}", "leer"), true);
  assert.equal(b("ja", "wahr"), true);
  assert.equal(b("{{eingaben.status}}", "enthaelt", "ff"), true);
});

test("Prüfung: Beispiel ist gültig, Fehler werden verständlich gemeldet", () => {
  assert.deepEqual(pruefeDefinition(beispielWorkflow), beispielWorkflow);
  const mit = (aenderung: object) => () => pruefeDefinition({ ...beispielWorkflow, ...aenderung });
  assert.throws(mit({ name: "" }), /Namen/);
  assert.throws(mit({ start: { manuell: false } }), /mindestens einen Weg/);
  assert.throws(mit({ beschreibung: "" }), /Start durch Agent: Bitte beschreiben/);
  assert.throws(mit({ schritte: [{ id: "a", art: "setzen", name: "x", wert: "" }, { id: "a", art: "setzen", name: "y", wert: "" }] }), /a gibt es zweimal/);
  assert.throws(mit({ schritte: [{ id: "a", art: "setzen", name: "eingaben", wert: "" }] }), /reserviert/);
  assert.throws(mit({ start: { manuell: true, zeitplan: { art: "uhrzeit", uhrzeit: "25:00", wochentage: [1] } } }), /keine Uhrzeit/);
  assert.equal(pruefeDefinition({ name: "x", schritte: [] }).creditLimit, 500, "Startwert des Credit-Limits (E-69)");
});

test("Eingaben: Standardwerte, Typen, Pflicht", () => {
  const definition = pruefeDefinition({
    name: "x",
    eingaben: [
      { name: "anzahl", typ: "zahl", standard: "2" },
      { name: "namen", typ: "liste", pflicht: true },
      { name: "aktiv", typ: "ja_nein", standard: "ja" },
    ],
  });
  assert.deepEqual(pruefeEingaben(definition, { namen: "A, B" }), { anzahl: 2, namen: ["A", "B"], aktiv: true });
  assert.throws(() => pruefeEingaben(definition, {}), /namen fehlt/);
  assert.throws(() => pruefeEingaben(definition, { namen: ["A"], anzahl: "viele" }), /Zahl/);
  assert.throws(() => pruefeEingaben(definition, { namen: ["A"], tippfehler: 1 }), /Unbekannte Eingaben: tippfehler/);
});

test("Zeitplan Uhrzeit: fällig im Fenster, verpasste Zeitpunkte werden verworfen (E-70)", () => {
  const plan = { art: "uhrzeit" as const, uhrzeit: "07:00", wochentage: [1, 2, 3, 4, 5] };
  // Montag, 30.11.2026
  const um = (stunde: number, minute: number, tag = 30) => new Date(2026, 10, tag, stunde, minute);
  assert.equal(uhrzeitFaellig(plan, um(6, 59), um(7, 0)), true);
  assert.equal(uhrzeitFaellig(plan, um(7, 0), um(7, 1)), false, "nur einmal");
  assert.equal(uhrzeitFaellig(plan, um(6, 0), um(9, 0)), false, "Rechner war im Ruhezustand: verpasst");
  assert.equal(uhrzeitFaellig(plan, new Date(2026, 10, 29, 6, 59), new Date(2026, 10, 29, 7, 0)), false, "Sonntag nicht angehakt");
});

test("Zeitplan Intervall: erstes Mal nach einem vollen Intervall, nicht doppelt, nichts nachholen", () => {
  const gestartet: string[] = [];
  let laeuft = false;
  const beginn = new Date(2026, 10, 30, 8, 0);
  const steuerung = new Zeitsteuerung(
    {
      geplante: () => [{ id: "w", zeitplan: { art: "intervall", minuten: 10 } }],
      laeuftNoch: () => laeuft,
      starte: (id) => void gestartet.push(id),
      protokolliere: () => {},
    },
    beginn,
  );
  const nach = (minuten: number) => new Date(beginn.getTime() + minuten * 60_000);
  steuerung.pruefe(nach(0));
  steuerung.pruefe(nach(5));
  assert.deepEqual(gestartet, []);
  steuerung.pruefe(nach(10));
  assert.deepEqual(gestartet, ["w"]);
  laeuft = true;
  steuerung.pruefe(nach(20));
  assert.deepEqual(gestartet, ["w"], "läuft noch – dieser Start entfällt");
  laeuft = false;
  steuerung.pruefe(nach(30 + toleranz / 60_000 + 30));
  assert.deepEqual(gestartet, ["w"], "lange verpasst – nicht nachgeholt");
});
