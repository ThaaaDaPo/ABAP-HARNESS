// Prüft den eigenen MCP-Client gegen den echten Stellvertreter-Prozess. Läuft ohne Copilot: npm test
import assert from "node:assert/strict";
import { test } from "node:test";
import { projektOrdner } from "../einstellungen.ts";
import { McpVerbindung } from "./mcp-verbindung.ts";

const stellvertreterSap = {
  befehl: process.execPath,
  argumente: ["--experimental-strip-types", "--disable-warning=ExperimentalWarning", "mcp/stellvertreter-sap/server.ts"],
  umgebung: {},
  arbeitsordner: projektOrdner,
};

test("Tools auslesen und aufrufen", async () => {
  const verbindung = await McpVerbindung.oeffne(stellvertreterSap);
  try {
    const tools = await verbindung.listeTools();
    assert.deepEqual(
      tools.map((t) => [t.name, t.nurLesend]),
      [
        ["objekt_lesen", true],
        ["objekte_suchen", true],
        ["objekt_aendern", false],
      ],
    );

    const treffer = await verbindung.rufeAuf("objekt_lesen", { name: "zcl_kunden_service" });
    assert.equal(treffer.fehler, false);
    assert.match(treffer.text, /CLASS zcl_kunden_service DEFINITION/);

    const fehlt = await verbindung.rufeAuf("objekt_lesen", { name: "ZGIBT_ES_NICHT" });
    assert.equal(fehlt.fehler, true);
    assert.match(fehlt.text, /nicht gefunden/);
  } finally {
    verbindung.schliesse();
  }
});

test("Verständlicher Fehler, wenn der Server nicht startet", async () => {
  await assert.rejects(
    McpVerbindung.oeffne({ ...stellvertreterSap, befehl: "gibt-es-nicht-xyz", argumente: [] }),
    /startet nicht|beendet/,
  );
});
