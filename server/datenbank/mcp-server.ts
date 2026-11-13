// Eingetragene MCP-Server lesen und schreiben. Die Regeln je Tool stehen in tool-regeln.ts.
import type { McpServerDaten, McpTool } from "../../gemeinsam/typen.ts";
import type { Datenbank } from "./datenbank.ts";

interface ServerZeile {
  schluessel: string;
  name: string;
  befehl: string;
  argumente: string;
  umgebung: string;
  arbeitsordner: string;
  tools: string;
  tools_gelesen_am: string | null;
  lese_fehler: string | null;
}

/** Ein Server, wie er in der Datenbank steht – ohne Regeln. */
export interface GespeicherterServer extends McpServerDaten {
  tools: McpTool[];
  toolsGelesenAm: string | null;
  leseFehler: string | null;
}

function ausZeile(zeile: ServerZeile): GespeicherterServer {
  return {
    schluessel: zeile.schluessel,
    name: zeile.name,
    befehl: zeile.befehl,
    argumente: JSON.parse(zeile.argumente),
    umgebung: JSON.parse(zeile.umgebung),
    arbeitsordner: zeile.arbeitsordner,
    tools: JSON.parse(zeile.tools),
    toolsGelesenAm: zeile.tools_gelesen_am,
    leseFehler: zeile.lese_fehler,
  };
}

export function holeAlleServer(db: Datenbank): GespeicherterServer[] {
  const zeilen = db.prepare(`SELECT * FROM mcp_server ORDER BY erstellt_am`).all() as unknown as ServerZeile[];
  return zeilen.map(ausZeile);
}

export function holeServer(db: Datenbank, schluessel: string): GespeicherterServer | null {
  const zeile = db.prepare(`SELECT * FROM mcp_server WHERE schluessel = ?`).get(schluessel) as ServerZeile | undefined;
  return zeile ? ausZeile(zeile) : null;
}

export function legeServerAn(db: Datenbank, daten: McpServerDaten): void {
  db.prepare(
    `INSERT INTO mcp_server (schluessel, name, befehl, argumente, umgebung, arbeitsordner, tools, erstellt_am)
     VALUES (?, ?, ?, ?, ?, ?, '[]', ?)`,
  ).run(
    daten.schluessel,
    daten.name,
    daten.befehl,
    JSON.stringify(daten.argumente),
    JSON.stringify(daten.umgebung),
    daten.arbeitsordner,
    new Date().toISOString(),
  );
}

/** Ändert Name und Startbefehl. Der Schlüssel bleibt, weil die Regeln daran hängen. */
export function aendereServer(db: Datenbank, daten: McpServerDaten): void {
  db.prepare(`UPDATE mcp_server SET name = ?, befehl = ?, argumente = ?, umgebung = ?, arbeitsordner = ? WHERE schluessel = ?`).run(
    daten.name,
    daten.befehl,
    JSON.stringify(daten.argumente),
    JSON.stringify(daten.umgebung),
    daten.arbeitsordner,
    daten.schluessel,
  );
}

export function speichereTools(db: Datenbank, schluessel: string, tools: McpTool[]): void {
  db.prepare(`UPDATE mcp_server SET tools = ?, tools_gelesen_am = ?, lese_fehler = NULL WHERE schluessel = ?`).run(
    JSON.stringify(tools),
    new Date().toISOString(),
    schluessel,
  );
}

export function speichereLeseFehler(db: Datenbank, schluessel: string, fehler: string): void {
  db.prepare(`UPDATE mcp_server SET lese_fehler = ? WHERE schluessel = ?`).run(fehler, schluessel);
}

export function loescheServer(db: Datenbank, schluessel: string): void {
  db.prepare(`DELETE FROM tool_regeln WHERE server = ?`).run(schluessel);
  db.prepare(`DELETE FROM mcp_server WHERE schluessel = ?`).run(schluessel);
}
