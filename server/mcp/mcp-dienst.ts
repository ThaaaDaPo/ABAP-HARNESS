// Verwaltung der MCP-Server: eintragen, ändern, Tools auslesen, Regeln setzen.
import path from "node:path";
import type { McpServer, McpServerDaten, ToolRegel } from "../../gemeinsam/typen.ts";
import { holeAlleAgenten } from "../datenbank/agenten.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import * as gespeichert from "../datenbank/mcp-server.ts";
import * as regeln from "../datenbank/tool-regeln.ts";
import { projektOrdner } from "../einstellungen.ts";
import { Fehler } from "../fehler.ts";
import { McpVerbindung, type StartAngaben } from "./mcp-verbindung.ts";

/**
 * Kein Bindestrich erlaubt: Copilot nennt die Tools "<schlüssel>-<tool>", und das Gateway
 * trennt am ersten Bindestrich. Kurz und klein, weil der Schlüssel in jedem Tool-Namen steht.
 */
const schluesselMuster = /^[a-z][a-z0-9_]{0,29}$/;

/** Alle Server mit den Agenten, die sie benutzen – so, wie die MCP-Seite sie braucht. */
export function holeServerUebersicht(db: Datenbank): McpServer[] {
  const alleAgenten = holeAlleAgenten(db);
  return gespeichert.holeAlleServer(db).map((server) => ({
    ...server,
    agenten: alleAgenten.filter((a) => a.mcpServer.includes(server.schluessel)).map((a) => a.name),
  }));
}

/** Womit der Server gestartet wird. Ohne Arbeitsordner gilt der Projektordner. */
export function startAngaben(server: McpServerDaten): StartAngaben {
  return {
    befehl: server.befehl,
    argumente: server.argumente,
    umgebung: server.umgebung,
    arbeitsordner: path.resolve(projektOrdner, server.arbeitsordner || "."),
  };
}

/** Prüft, was aus dem Formular kommt, und macht daraus saubere Serverdaten. */
export function pruefeEingabe(roh: any): McpServerDaten {
  const daten: McpServerDaten = {
    schluessel: String(roh?.schluessel ?? "").trim(),
    name: String(roh?.name ?? "").trim(),
    befehl: String(roh?.befehl ?? "").trim(),
    argumente: Array.isArray(roh?.argumente) ? roh.argumente.map(String) : [],
    umgebung: Object.fromEntries(Object.entries(roh?.umgebung ?? {}).map(([k, v]) => [k, String(v)])),
    arbeitsordner: String(roh?.arbeitsordner ?? "").trim(),
  };
  if (!schluesselMuster.test(daten.schluessel)) {
    throw new Fehler(400, "Der Schlüssel muss mit einem Kleinbuchstaben beginnen und darf nur Kleinbuchstaben, Ziffern und _ enthalten (kein Bindestrich), z. B. jira.");
  }
  if (!daten.name) throw new Fehler(400, "Bitte einen Namen angeben.");
  if (!daten.befehl) throw new Fehler(400, "Bitte den Startbefehl angeben, z. B. node oder npx.");
  return daten;
}

export function legeAn(db: Datenbank, daten: McpServerDaten): void {
  if (gespeichert.holeServer(db, daten.schluessel)) {
    throw new Fehler(409, `Es gibt schon einen Server mit dem Schlüssel ${daten.schluessel}.`);
  }
  gespeichert.legeServerAn(db, daten);
}

export function aendere(db: Datenbank, daten: McpServerDaten): void {
  if (!gespeichert.holeServer(db, daten.schluessel)) throw new Fehler(404, "Server nicht gefunden");
  gespeichert.aendereServer(db, daten);
}

/** Startet den Server kurz, liest seine Tools und speichert sie. Fehler werden am Server vermerkt. */
export async function leseTools(db: Datenbank, schluessel: string): Promise<void> {
  const server = gespeichert.holeServer(db, schluessel);
  if (!server) throw new Fehler(404, "Server nicht gefunden");

  let verbindung: McpVerbindung | null = null;
  try {
    verbindung = await McpVerbindung.oeffne(startAngaben(server));
    gespeichert.speichereTools(db, schluessel, await verbindung.listeTools());
  } catch (fehler) {
    gespeichert.speichereLeseFehler(db, schluessel, (fehler as Error).message);
  } finally {
    verbindung?.schliesse();
  }
}

/** Setzt die Regel eines Agenten für ein Tool oder (tool = "*") die Standardregel. "standard" entfernt die eigene Regel. */
export function setzeRegel(db: Datenbank, agentId: string, server: string, tool: string, regel: ToolRegel | "standard"): void {
  if (!gespeichert.holeServer(db, server)) throw new Fehler(404, "Server nicht gefunden");
  if (regel === "standard") {
    if (tool === regeln.standardTool) throw new Fehler(400, "Die Standardregel braucht einen Wert.");
    regeln.entferneRegel(db, agentId, server, tool);
  } else {
    regeln.setzeRegel(db, agentId, server, tool, regel);
  }
}
