// Prüft die App-Seite von ADT: Konfiguration, welche Cookies der ADT-MCP bekommt, und dass der
// eingebaute Server mit Zugangsdatei eingetragen wird und seine Tools liefert. npm test
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { oeffneDatenbank } from "../datenbank/datenbank.ts";
import { holeServer } from "../datenbank/mcp-server.ts";
import type { Einstellungen } from "../einstellungen.ts";
import { adtSchluessel, richteAdtEin } from "./adt-einrichten.ts";
import { ladeKonfiguration, pruefeKonfiguration, speichereKonfiguration } from "./adt-konfiguration.ts";
import { cookieZeileFuerAdt, passtName, SsoAnmeldung } from "./sso-anmeldung.ts";

test("Konfiguration: Standard ist das Übungssystem mit $TMP; für SAP werden Adresse und Mandant geprüft", () => {
  const db = oeffneDatenbank(fs.mkdtempSync(path.join(os.tmpdir(), "harness-adt-")));
  assert.deepEqual([ladeKonfiguration(db).gegenstelle, ladeKonfiguration(db).pakete], ["simulation", ["$TMP"]]);

  assert.throws(() => pruefeKonfiguration({ gegenstelle: "sap", url: "sap-host", mandant: "010", pakete: "$TMP" }), /vollständig angeben/);
  assert.throws(() => pruefeKonfiguration({ gegenstelle: "sap", url: "https://sap:44300", mandant: "10", pakete: "$TMP" }), /drei Ziffern/);
  assert.throws(() => pruefeKonfiguration({ gegenstelle: "simulation", pakete: "" }), /Mindestens ein Paket/);

  const gut = pruefeKonfiguration({
    gegenstelle: "sap",
    url: " https://sap:44300/sap/bc/adt/ ",
    mandant: "010",
    sprache: "de",
    pakete: "$tmp, ZTEST",
    cookieNamen: "MYSAPSSO2\nSAP_SESSIONID_*",
    // Benutzer und Passwort gibt es nicht – sie werden nicht übernommen
    benutzer: "DAVID",
    passwort: "geheim",
  });
  assert.deepEqual(gut.pakete, ["$TMP", "ZTEST"]);
  assert.equal(gut.sprache, "DE");
  assert.equal("benutzer" in gut || "passwort" in gut, false);
  speichereKonfiguration(db, gut);
  assert.equal(ladeKonfiguration(db).url, "https://sap:44300/sap/bc/adt/");
});

test("Cookies: Muster mit *, und bei SSO-Ticket keine Sitzungs-Cookies an den ADT-MCP", () => {
  assert.equal(passtName("SAP_SESSIONID_B1E_010", ["MYSAPSSO2", "SAP_SESSIONID_*"]), true);
  assert.equal(passtName("sap-usercontext", ["MYSAPSSO2", "SAP_SESSIONID_*"]), false);
  const cookies = [
    { name: "MYSAPSSO2", value: "ticket" },
    { name: "SAP_SESSIONID_B1E_010", value: "sitzung" },
    { name: "sap-usercontext", value: "sap-client=010" },
  ];
  assert.equal(cookieZeileFuerAdt(cookies), "MYSAPSSO2=ticket; sap-usercontext=sap-client=010");
  assert.equal(cookieZeileFuerAdt(cookies.slice(1)), "SAP_SESSIONID_B1E_010=sitzung; sap-usercontext=sap-client=010");
});

test("SSO im Übungssystem: keine Anmeldung nötig, kein Cookie", async () => {
  const sso = new SsoAnmeldung(() => pruefeKonfiguration({ gegenstelle: "simulation", pakete: "$TMP" }));
  assert.equal(sso.anmeldung().zustand, "angemeldet");
  await assert.rejects(sso.cookie(null), /braucht keine Anmeldung/);
});

test("Der ADT-MCP wird als eingebauter Server eingetragen und liefert seine Tools", async () => {
  const ordner = fs.mkdtempSync(path.join(os.tmpdir(), "harness-adt-"));
  const db = oeffneDatenbank(ordner);
  const einstellungen = { datenOrdner: ordner, port: 4799 } as Einstellungen;
  const schluessel = await richteAdtEin(db, einstellungen);
  const server = holeServer(db, adtSchluessel)!;
  assert.equal(server.eingebaut, true);
  assert.equal(server.leseFehler, null);
  assert.deepEqual(server.tools.map((t) => t.name), ["auschecken", "pruefen", "speichern", "aktivieren", "anlegen", "unit_tests", "atc_pruefen"]);
  const zugang = JSON.parse(fs.readFileSync(path.join(ordner, "adt", "zugang.json"), "utf8"));
  assert.deepEqual(zugang, { adresse: "http://127.0.0.1:4799", schluessel });

  // Beim nächsten Start: neuer Schlüssel, derselbe Eintrag
  const zweiter = await richteAdtEin(db, einstellungen);
  assert.notEqual(zweiter, schluessel);
  assert.equal(holeServer(db, adtSchluessel)!.eingebaut, true);
});
