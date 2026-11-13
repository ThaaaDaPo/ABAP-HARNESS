// Regeln des Tool-Gateways lesen und schreiben.
// Je Agent, Server und Tool eine Regel. Das Tool "*" steht für die Standardregel des Servers.
import type { ToolRegel } from "../../gemeinsam/typen.ts";
import type { Datenbank } from "./datenbank.ts";

export const alleRegeln: ToolRegel[] = ["erlauben", "melden", "freigabe", "verbieten"];

/** Platzhalter für die Standardregel eines Servers. */
export const standardTool = "*";

/** Gilt, wenn für einen Server noch gar nichts eingestellt ist: lieber erst fragen. */
export const vorgabeRegel: ToolRegel = "freigabe";

export function istRegel(wert: unknown): wert is ToolRegel {
  return alleRegeln.includes(wert as ToolRegel);
}

interface RegelZeile {
  tool: string;
  regel: ToolRegel;
}

/** Alle Regeln eines Agenten für einen Server: Standardregel und Regeln je Tool. */
export function holeRegeln(db: Datenbank, agentId: string, server: string) {
  const zeilen = db
    .prepare(`SELECT tool, regel FROM tool_regeln WHERE agent_id = ? AND server = ?`)
    .all(agentId, server) as unknown as RegelZeile[];

  let standardRegel = vorgabeRegel;
  const regeln: Record<string, ToolRegel> = {};
  for (const zeile of zeilen) {
    if (zeile.tool === standardTool) standardRegel = zeile.regel;
    else regeln[zeile.tool] = zeile.regel;
  }
  return { standardRegel, regeln };
}

/** Die Regel, die für genau dieses Tool gilt: eigene Regel, sonst Standardregel des Servers. */
export function regelFuer(db: Datenbank, agentId: string, server: string, tool: string): ToolRegel {
  const { standardRegel, regeln } = holeRegeln(db, agentId, server);
  return regeln[tool] ?? standardRegel;
}

export function setzeRegel(db: Datenbank, agentId: string, server: string, tool: string, regel: ToolRegel): void {
  db.prepare(
    `INSERT INTO tool_regeln (agent_id, server, tool, regel) VALUES (?, ?, ?, ?)
     ON CONFLICT (agent_id, server, tool) DO UPDATE SET regel = excluded.regel`,
  ).run(agentId, server, tool, regel);
}

/** Entfernt die eigene Regel eines Tools; danach gilt wieder die Standardregel. */
export function entferneRegel(db: Datenbank, agentId: string, server: string, tool: string): void {
  db.prepare(`DELETE FROM tool_regeln WHERE agent_id = ? AND server = ? AND tool = ?`).run(agentId, server, tool);
}
