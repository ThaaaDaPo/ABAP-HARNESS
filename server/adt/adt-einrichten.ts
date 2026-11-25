// Trägt den ADT-MCP (mcp/adt/) als eingebauten Server ein und schreibt die Zugangsdatei, über die
// er Konfiguration und SSO-Cookie bei der App holt. Läuft bei jedem Start der App:
// - Startbefehl immer aktuell (Pfad zu Node und zum Projekt können sich ändern)
// - neuer Schlüssel für den Zugang, damit nur die eigenen ADT-MCP-Prozesse das Cookie bekommen
// - Tools neu auslesen (sie können sich mit einer neuen Version der App ändern)
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { McpServerDaten } from "../../gemeinsam/typen.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import { aendereServer, holeServer, legeServerAn } from "../datenbank/mcp-server.ts";
import { projektOrdner, type Einstellungen } from "../einstellungen.ts";
import { leseTools } from "../mcp/mcp-dienst.ts";
import { nodeMitTypeScript } from "../mcp/stellvertreter.ts";

/** So heißen seine Tools für den Agenten: adt-auschecken, adt-speichern … */
export const adtSchluessel = "adt";

export function adtOrdner(einstellungen: Einstellungen): string {
  return path.join(einstellungen.datenOrdner, "adt");
}

/** Gibt den Schlüssel zurück, den die internen Routen verlangen. */
export async function richteAdtEin(db: Datenbank, einstellungen: Einstellungen): Promise<string> {
  const ordner = adtOrdner(einstellungen);
  fs.mkdirSync(ordner, { recursive: true });
  const zugangsDatei = path.join(ordner, "zugang.json");
  const schluessel = randomBytes(24).toString("hex");
  // Nur für den eigenen Benutzer lesbar (unter Windows ohne Wirkung; dort schützt das Benutzerprofil)
  fs.writeFileSync(zugangsDatei, JSON.stringify({ adresse: `http://127.0.0.1:${einstellungen.port}`, schluessel }), { mode: 0o600 });

  const daten: McpServerDaten = {
    schluessel: adtSchluessel,
    name: "ADT (ABAP entwickeln)",
    // Derselbe Node, mit dem die App läuft – mit vollem Pfad, unabhängig von PATH
    befehl: process.execPath,
    argumente: [...nodeMitTypeScript, path.join(projektOrdner, "mcp", "adt", "server.ts"), "--zugang", zugangsDatei],
    umgebung: {},
    arbeitsordner: "",
  };
  const vorhanden = holeServer(db, adtSchluessel);
  if (vorhanden && !vorhanden.eingebaut) {
    console.warn(`Ein eigener MCP-Server heißt schon "${adtSchluessel}" – der eingebaute ADT-MCP wird nicht eingetragen.`);
    return schluessel;
  }
  if (vorhanden) aendereServer(db, daten);
  else legeServerAn(db, daten, true);
  await leseTools(db, adtSchluessel);
  return schluessel;
}
