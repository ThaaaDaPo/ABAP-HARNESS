// Stellvertreter für den SAP-MCP: liefert feste Beispieldaten, damit sich Gateway und Chat
// auf dem Privatrechner ohne SAP prüfen lassen. Die Tool-Namen sind ausgedacht; der echte
// SAP-MCP hat eigene.
import { starteMcpServer, ToolFehler } from "../gemeinsam/mini-server.ts";

const objekte: Record<string, { typ: string; paket: string; quelltext: string }> = {
  ZCL_KUNDEN_SERVICE: {
    typ: "CLAS",
    paket: "$TMP",
    quelltext: [
      "CLASS zcl_kunden_service DEFINITION PUBLIC FINAL CREATE PUBLIC.",
      "  PUBLIC SECTION.",
      "    METHODS get_kunde IMPORTING iv_id TYPE kunnr RETURNING VALUE(rs_kunde) TYPE kna1.",
      "ENDCLASS.",
      "",
      "CLASS zcl_kunden_service IMPLEMENTATION.",
      "  METHOD get_kunde.",
      "    SELECT SINGLE * FROM kna1 WHERE kunnr = @iv_id INTO @rs_kunde.",
      "  ENDMETHOD.",
      "ENDCLASS.",
    ].join("\n"),
  },
  ZIF_KUNDEN_LESER: {
    typ: "INTF",
    paket: "$TMP",
    quelltext: "INTERFACE zif_kunden_leser PUBLIC.\n  METHODS lese IMPORTING iv_id TYPE kunnr RETURNING VALUE(rs_kunde) TYPE kna1.\nENDINTERFACE.",
  },
  Z_KUNDEN_LISTE: {
    typ: "PROG",
    paket: "ZVERTRIEB",
    quelltext: "REPORT z_kunden_liste.\n\nSELECT kunnr, name1 FROM kna1 INTO TABLE @DATA(lt_kunden) UP TO 10 ROWS.\ncl_demo_output=>display( lt_kunden ).",
  },
};

function finde(name: unknown) {
  const schluessel = String(name ?? "").toUpperCase();
  const objekt = objekte[schluessel];
  if (!objekt) throw new ToolFehler(`Objekt ${schluessel || "(ohne Namen)"} nicht gefunden`);
  return { name: schluessel, ...objekt };
}

starteMcpServer("stellvertreter-sap", [
  {
    name: "objekt_lesen",
    beschreibung: "Liest den Quelltext eines ABAP-Objekts (Klasse, Interface, Report).",
    nurLesend: true,
    parameter: {
      type: "object",
      properties: { name: { type: "string", description: "Name des Objekts, z. B. ZCL_KUNDEN_SERVICE" } },
      required: ["name"],
    },
    ausfuehren: ({ name }) => {
      const objekt = finde(name);
      return `${objekt.name} (${objekt.typ}, Paket ${objekt.paket})\n\n${objekt.quelltext}`;
    },
  },
  {
    name: "objekte_suchen",
    beschreibung: "Sucht ABAP-Objekte, deren Name den Suchbegriff enthält.",
    nurLesend: true,
    parameter: {
      type: "object",
      properties: { suchbegriff: { type: "string", description: "Teil des Objektnamens" } },
      required: ["suchbegriff"],
    },
    ausfuehren: ({ suchbegriff }) => {
      const begriff = String(suchbegriff ?? "").toUpperCase();
      const treffer = Object.entries(objekte).filter(([name]) => name.includes(begriff));
      if (treffer.length === 0) return "Keine Treffer.";
      return treffer.map(([name, o]) => `${name} (${o.typ}, Paket ${o.paket})`).join("\n");
    },
  },
  {
    name: "objekt_aendern",
    beschreibung: "Überschreibt den Quelltext eines ABAP-Objekts. Schreibender Zugriff.",
    nurLesend: false,
    parameter: {
      type: "object",
      properties: {
        name: { type: "string", description: "Name des Objekts" },
        quelltext: { type: "string", description: "Neuer vollständiger Quelltext" },
      },
      required: ["name", "quelltext"],
    },
    ausfuehren: ({ name, quelltext }) => {
      const objekt = finde(name);
      objekte[objekt.name].quelltext = String(quelltext ?? "");
      return `${objekt.name} gespeichert (nur im Stellvertreter, nichts im SAP).`;
    },
  },
]);
