// Agenten lesen, schreiben und löschen. Die Regeln je Tool stehen in tool-regeln.ts.
import { randomUUID } from "node:crypto";
import type { Agent, AgentDaten, ModellWahl } from "../../gemeinsam/typen.ts";
import type { Datenbank } from "./datenbank.ts";

/** Der Agent, der beim ersten Start aus einstellungen.json entsteht. Er lässt sich nicht löschen. */
export const standardAgentId = "standard";

interface AgentenZeile {
  id: string;
  name: string;
  auftrag: string;
  modell: string;
  denkaufwand: string;
  kontext: ModellWahl["kontext"];
  mcp_server: string;
  instructions: string;
  skills: string;
  workflows: string;
  erstellt_am: string;
}

function ausZeile(zeile: AgentenZeile): Agent {
  return {
    id: zeile.id,
    name: zeile.name,
    auftrag: zeile.auftrag,
    modellWahl: { modell: zeile.modell, denkaufwand: zeile.denkaufwand, kontext: zeile.kontext },
    mcpServer: JSON.parse(zeile.mcp_server),
    instructions: JSON.parse(zeile.instructions),
    skills: JSON.parse(zeile.skills),
    workflows: JSON.parse(zeile.workflows),
    erstelltAm: zeile.erstellt_am,
  };
}

export function holeAlleAgenten(db: Datenbank): Agent[] {
  // Der Standard-Agent zuerst, dann in der Reihenfolge, in der sie angelegt wurden.
  const zeilen = db.prepare(`SELECT * FROM agenten ORDER BY id != ?, erstellt_am`).all(standardAgentId) as unknown as AgentenZeile[];
  return zeilen.map(ausZeile);
}

export function holeAgent(db: Datenbank, id: string): Agent | null {
  const zeile = db.prepare(`SELECT * FROM agenten WHERE id = ?`).get(id) as AgentenZeile | undefined;
  return zeile ? ausZeile(zeile) : null;
}

/** Legt den Agenten an und gibt ihn zurück. Ohne `id` bekommt er eine neue. */
export function legeAgentAn(db: Datenbank, daten: AgentDaten, id: string = randomUUID()): Agent {
  db.prepare(
    `INSERT INTO agenten (id, name, auftrag, modell, denkaufwand, kontext, mcp_server, instructions, skills, workflows, erstellt_am)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, ...werte(daten), new Date().toISOString());
  return holeAgent(db, id)!;
}

export function aendereAgent(db: Datenbank, id: string, daten: AgentDaten): void {
  db.prepare(
    `UPDATE agenten SET name = ?, auftrag = ?, modell = ?, denkaufwand = ?, kontext = ?, mcp_server = ?, instructions = ?, skills = ?, workflows = ?
     WHERE id = ?`,
  ).run(...werte(daten), id);
}

function werte(daten: AgentDaten): string[] {
  const { modell, denkaufwand, kontext } = daten.modellWahl;
  return [
    daten.name,
    daten.auftrag,
    modell,
    denkaufwand,
    kontext,
    JSON.stringify(daten.mcpServer),
    JSON.stringify(daten.instructions),
    JSON.stringify(daten.skills),
    JSON.stringify(daten.workflows),
  ];
}

/**
 * Löscht den Agenten mit seinen Regeln. Seine Chats übernimmt der Standard-Agent – so bleibt ihr
 * Verlauf erhalten und sie lassen sich weiterführen.
 */
export function loescheAgent(db: Datenbank, id: string): void {
  db.prepare(`UPDATE aufgaben SET agent_id = ? WHERE agent_id = ?`).run(standardAgentId, id);
  db.prepare(`DELETE FROM tool_regeln WHERE agent_id = ?`).run(id);
  db.prepare(`DELETE FROM agenten WHERE id = ?`).run(id);
}

/** Darf der Agent den Server benutzen? Wird bei jedem Tool-Aufruf neu gelesen. */
export function hatServer(db: Datenbank, agentId: string, server: string): boolean {
  return holeAgent(db, agentId)?.mcpServer.includes(server) ?? false;
}

/** Ein gelöschter MCP-Server verschwindet aus allen Agenten. */
export function entferneServerUeberall(db: Datenbank, server: string): void {
  for (const agent of holeAlleAgenten(db)) {
    if (agent.mcpServer.includes(server)) aendereAgent(db, agent.id, { ...agent, mcpServer: agent.mcpServer.filter((s) => s !== server) });
  }
}

/** Übernimmt alle Regeln eines Agenten für einen anderen (beim Kopieren). */
export function kopiereRegeln(db: Datenbank, vonId: string, nachId: string): void {
  db.prepare(`INSERT OR REPLACE INTO tool_regeln (agent_id, server, tool, regel) SELECT ?, server, tool, regel FROM tool_regeln WHERE agent_id = ?`).run(
    nachId,
    vonId,
  );
}
