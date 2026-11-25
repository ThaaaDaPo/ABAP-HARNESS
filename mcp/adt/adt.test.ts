// Prüft die Tools des ADT-MCP gegen das Übungssystem: auschecken, prüfen, speichern (nur ohne
// Syntaxfehler, mit Konflikterkennung und Paket-Sperre), aktivieren, anlegen, Unit-Tests, ATC. npm test
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import type { AdtLaufzeitKonfiguration } from "../../gemeinsam/typen.ts";
import { SimulierteGegenstelle } from "./simulierte-gegenstelle.ts";
import { vergleiche } from "./vergleich.ts";
import { erstelleWerkzeuge } from "./werkzeuge.ts";
import { Workspace } from "./workspace.ts";

function aufbauen() {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "harness-adt-"));
  const konfiguration: AdtLaufzeitKonfiguration = {
    gegenstelle: "simulation",
    url: "",
    mandant: "",
    sprache: "DE",
    pakete: ["$TMP"],
    cookieNamen: [],
    edgePfad: "",
    atcVariante: "",
    workspaceOrdner: path.join(ordner, "workspace"),
    simulationsDatei: path.join(ordner, "uebungssystem.json"),
  };
  const gegenstelle = new SimulierteGegenstelle(konfiguration.simulationsDatei);
  const workspace = new Workspace(konfiguration.workspaceOrdner);
  const werkzeuge = erstelleWerkzeuge(async () => ({ gegenstelle, workspace, konfiguration }));
  const rufe = async (name: string, argumente: Record<string, unknown>): Promise<string> => werkzeuge.find((w) => w.name === name)!.ausfuehren(argumente);
  const datei = (relativ: string) => path.join(konfiguration.workspaceOrdner, relativ);
  return { rufe, datei, gegenstelle, werkzeuge };
}

const klasse = "abap/zcl_kunden_service.clas.abap";

test("Auschecken legt die Dateien an; ändern, prüfen, speichern, aktivieren", async () => {
  const { rufe, datei, gegenstelle } = aufbauen();
  const ergebnis = await rufe("auschecken", { name: "zcl_kunden_service" });
  assert.match(ergebnis, /ZCL_KUNDEN_SERVICE \(klasse, Paket \$TMP\) ausgecheckt/);
  assert.match(ergebnis, /Testklassen gibt es noch nicht/);
  assert.doesNotMatch(ergebnis, /locals_def/, "leere Includes werden nicht ausgecheckt");
  const alt = fs.readFileSync(datei(klasse), "utf8");

  // Nichts geändert → nichts zu speichern
  assert.match(await rufe("speichern", { name: "ZCL_KUNDEN_SERVICE" }), /nichts zu speichern/);

  // Syntaxfehler: pruefen zeigt ihn mit Zeile, speichern verweigert
  fs.writeFileSync(datei(klasse), alt.replace("INTO @rs_kunde.", "INTO @lv_unbekannt."));
  assert.match(await rufe("pruefen", { name: "ZCL_KUNDEN_SERVICE" }), /1 Fehler[\s\S]*Zeile 8[\s\S]*LV_UNBEKANNT/);
  await assert.rejects(rufe("speichern", { name: "ZCL_KUNDEN_SERVICE" }), /Nicht gespeichert – Syntaxfehler/);
  const objekt = (await gegenstelle.finde("ZCL_KUNDEN_SERVICE"))!;
  assert.equal(await gegenstelle.lies(objekt, "main"), alt, "im System unverändert");

  // Korrekt: speichern mit Vorher/Nachher, dann aktivieren
  fs.writeFileSync(datei(klasse), alt.replace("SELECT SINGLE *", "SELECT SINGLE kunnr, name1"));
  const gespeichert = await rufe("speichern", { name: "ZCL_KUNDEN_SERVICE" });
  assert.match(gespeichert, /gespeichert \(inaktiv\)/);
  assert.match(gespeichert, /Hauptteil: 1 Zeilen raus, 1 rein\n@ Zeile 8\n- +SELECT SINGLE \* FROM kna1.*\n\+ +SELECT SINGLE kunnr, name1/);
  assert.match(await rufe("aktivieren", { namen: ["ZCL_KUNDEN_SERVICE"] }), /^Aktiviert: ZCL_KUNDEN_SERVICE/);
  assert.match((await gegenstelle.lies(objekt, "main"))!, /SELECT SINGLE kunnr, name1/);
});

test("Reste eines früheren Auscheckens (leere Includes) gelten nicht als Änderung", async () => {
  const { rufe, datei } = aufbauen();
  fs.mkdirSync(datei("abap"), { recursive: true });
  fs.writeFileSync(datei("abap/zcl_kunden_service.clas.macros.abap"), "");
  await rufe("auschecken", { name: "ZCL_KUNDEN_SERVICE" });
  assert.equal(fs.existsSync(datei("abap/zcl_kunden_service.clas.macros.abap")), false);
  fs.writeFileSync(datei("abap/zcl_kunden_service.clas.macros.abap"), "");
  assert.match(await rufe("speichern", { name: "ZCL_KUNDEN_SERVICE" }), /nichts zu speichern/);
});

test("Speichern bricht ab, wenn das Objekt seit dem Auschecken im System geändert wurde", async () => {
  const { rufe, datei, gegenstelle } = aufbauen();
  await rufe("auschecken", { name: "ZIF_KUNDEN_LESER" });
  // Jemand anderes ändert im System
  const objekt = (await gegenstelle.finde("ZIF_KUNDEN_LESER"))!;
  await gegenstelle.schreibe(objekt, [{ teil: "main", quelltext: "INTERFACE zif_kunden_leser PUBLIC.\nENDINTERFACE.\n" }]);

  const pfad = datei("abap/zif_kunden_leser.intf.abap");
  fs.writeFileSync(pfad, fs.readFileSync(pfad, "utf8").replace("METHODS lese", "METHODS lies"));
  await assert.rejects(rufe("speichern", { name: "ZIF_KUNDEN_LESER" }), /seit dem Auschecken im System geändert/);
  // Neu auschecken schützt die eigene, ungespeicherte Änderung
  await assert.rejects(rufe("auschecken", { name: "ZIF_KUNDEN_LESER" }), /ungespeicherte Änderungen/);
  assert.match(await rufe("auschecken", { name: "ZIF_KUNDEN_LESER", ueberschreiben: true }), /ausgecheckt/);
});

test("Paket-Sperre: lesen ja, speichern, aktivieren und anlegen nur in freigegebenen Paketen", async () => {
  const { rufe, datei } = aufbauen();
  assert.match(await rufe("auschecken", { name: "Z_KUNDEN_LISTE" }), /Paket ZVERTRIEB ist nicht freigegeben/);
  fs.appendFileSync(datei("abap/z_kunden_liste.prog.abap"), "WRITE 'x'.\n");
  await assert.rejects(rufe("speichern", { name: "Z_KUNDEN_LISTE" }), /liegt im Paket ZVERTRIEB. Ändern darf ich nur in: \$TMP/);
  await assert.rejects(rufe("aktivieren", { namen: ["Z_KUNDEN_LISTE"] }), /liegt im Paket ZVERTRIEB/);
  await assert.rejects(rufe("anlegen", { art: "klasse", name: "ZCL_NEU", beschreibung: "x", paket: "ZVERTRIEB" }), /nur in diesen Paketen/);
});

test("Anlegen mit Testklassen, Unit-Tests und ATC; Funktionsbaustein in einer Gruppe", async () => {
  const { rufe, datei } = aufbauen();
  const angelegt = await rufe("anlegen", { art: "klasse", name: "zcl_harness_test", beschreibung: "Test" });
  assert.match(angelegt, /ZCL_HARNESS_TEST in \$TMP angelegt/);
  assert.ok(fs.existsSync(datei("abap/zcl_harness_test.clas.abap")));
  await assert.rejects(rufe("anlegen", { art: "klasse", name: "ZCL_HARNESS_TEST", beschreibung: "x" }), /gibt es schon/);
  await assert.rejects(rufe("anlegen", { art: "programm", name: "KEIN_Z", beschreibung: "x" }), /beginnen mit Z oder Y/);

  // Testklassen-Datei neu anlegen → speichern legt sie im System an
  fs.writeFileSync(
    datei("abap/zcl_harness_test.clas.testclasses.abap"),
    "CLASS ltc DEFINITION FOR TESTING.\n  PRIVATE SECTION.\n    METHODS eins FOR TESTING.\n    METHODS zwei FOR TESTING.\nENDCLASS.\n",
  );
  fs.appendFileSync(datei("abap/zcl_harness_test.clas.abap"), "* SELECT * FROM kna1 in einem Kommentar\n");
  await rufe("speichern", { name: "ZCL_HARNESS_TEST" });
  assert.match(await rufe("unit_tests", { name: "ZCL_HARNESS_TEST" }), /keine Testmethoden/, "vor dem Aktivieren gibt es nichts Aktives");
  await rufe("aktivieren", { namen: ["ZCL_HARNESS_TEST"] });
  assert.match(await rufe("unit_tests", { name: "ZCL_HARNESS_TEST" }), /2 Testmethoden, alle erfolgreich/);
  assert.match(await rufe("atc_pruefen", { name: "ZCL_KUNDEN_SERVICE" }), /Warnung \(Zeile 8\): SELECT \*/);

  await assert.rejects(rufe("anlegen", { art: "funktionsbaustein", name: "Z_FB", beschreibung: "x" }), /Funktionsgruppe angeben/);
  assert.match(await rufe("anlegen", { art: "funktionsbaustein", name: "Z_FB", beschreibung: "x", funktionsgruppe: "ZKUNDEN" }), /z_fb\.func\.abap/);
  await assert.rejects(rufe("auschecken", { name: "ZKUNDEN" }), /Funktionsgruppe/);
});

test("Werkzeuge: Namen, Pflichtangaben und unbekannte Objekte", async () => {
  const { rufe, werkzeuge } = aufbauen();
  assert.deepEqual(werkzeuge.map((w) => w.name), ["auschecken", "pruefen", "speichern", "aktivieren", "anlegen", "unit_tests", "atc_pruefen"]);
  await assert.rejects(rufe("auschecken", { name: "ZGIBTSNICHT" }), /gibt es im System nicht/);
  await assert.rejects(rufe("pruefen", { name: "ZCL_KUNDEN_SERVICE" }), /nicht ausgecheckt/);
  await assert.rejects(rufe("anlegen", { art: "tabelle", name: "ZT", beschreibung: "x" }), /Unbekannte Art/);
});

test("Vergleich zeigt nur die geänderten Zeilen, je Stelle mit Zeilennummer", () => {
  assert.equal(vergleiche("a\nb\nc", "a\nb\nc"), "keine Änderung");
  assert.equal(vergleiche("a\nb\nc", "a\nX\nY\nc"), "1 Zeilen raus, 2 rein\n@ Zeile 2\n- b\n+ X\n+ Y");
  // Zwei getrennte Stellen: zwei Abschnitte, das Gleiche dazwischen fehlt
  assert.equal(vergleiche("a\nb\nc\nd\ne", "a\nB\nc\nd\ne\nf"), "1 Zeilen raus, 2 rein\n@ Zeile 2\n- b\n+ B\n@ Zeile 6\n+ f");
});
