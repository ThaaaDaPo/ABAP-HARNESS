// Verwaltung der Agenten: Standard-Agent beim ersten Start, Eingaben prüfen, anlegen, kopieren, löschen.
import type { Agent, AgentDaten, ServerRegeln } from "../../gemeinsam/typen.ts";
import * as agenten from "../datenbank/agenten.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import { holeAlleServer } from "../datenbank/mcp-server.ts";
import { holeRegeln } from "../datenbank/tool-regeln.ts";
import type { Einstellungen } from "../einstellungen.ts";
import { Fehler } from "../fehler.ts";

/**
 * Beim ersten Start (auch auf einer Datenbank aus Schritt 3) entsteht aus einstellungen.json der
 * Agent "standard" mit allen eingetragenen MCP-Servern. Seine Regeln gibt es schon: Bis Schritt 3
 * galten alle Regeln für ihn. Danach liest die App agent und modell aus einstellungen.json nicht mehr.
 */
export function richteStandardAgentenEin(db: Datenbank, einstellungen: Einstellungen): void {
  if (agenten.holeAgent(db, agenten.standardAgentId)) return;
  agenten.legeAgentAn(
    db,
    {
      name: einstellungen.agent.name,
      auftrag: einstellungen.agent.auftrag,
      modellWahl: { modell: einstellungen.modell, denkaufwand: "", kontext: "standard" },
      mcpServer: holeAlleServer(db).map((s) => s.schluessel),
      instructions: [],
      skills: [],
    },
    agenten.standardAgentId,
  );
}

const zeichenketten = (wert: unknown): string[] => (Array.isArray(wert) ? [...new Set(wert.map(String))] : []);

/** Prüft, was aus dem Formular kommt. Das Modell prüft der Chat-Dienst (er kennt die Laufzeit). */
export function pruefeEingabe(db: Datenbank, roh: any): AgentDaten {
  const daten: AgentDaten = {
    name: String(roh?.name ?? "").trim(),
    auftrag: String(roh?.auftrag ?? "").trim(),
    modellWahl: {
      modell: String(roh?.modellWahl?.modell ?? ""),
      denkaufwand: String(roh?.modellWahl?.denkaufwand ?? ""),
      kontext: roh?.modellWahl?.kontext === "lang" ? "lang" : "standard",
    },
    mcpServer: zeichenketten(roh?.mcpServer),
    instructions: zeichenketten(roh?.instructions),
    skills: zeichenketten(roh?.skills),
  };
  if (!daten.name) throw new Fehler(400, "Bitte einen Namen angeben.");
  const vorhanden = new Set(holeAlleServer(db).map((s) => s.schluessel));
  const unbekannt = daten.mcpServer.filter((s) => !vorhanden.has(s));
  if (unbekannt.length > 0) throw new Fehler(400, `Unbekannte MCP-Server: ${unbekannt.join(", ")}`);
  return daten;
}

/** Neuer Agent: alle Server, je ohne eigene Regeln – damit gilt überall „Freigabe nötig“ (erst fragen). */
export function legeNeuenAn(db: Datenbank, daten: Partial<AgentDaten> = {}): Agent {
  return agenten.legeAgentAn(db, {
    name: daten.name ?? "Neuer Agent",
    auftrag: daten.auftrag ?? "",
    modellWahl: daten.modellWahl ?? { modell: "", denkaufwand: "", kontext: "standard" },
    mcpServer: daten.mcpServer ?? holeAlleServer(db).map((s) => s.schluessel),
    instructions: daten.instructions ?? [],
    skills: daten.skills ?? [],
  });
}

/** Kopie mit allen Einstellungen und Regeln – Ausgangspunkt für einen ähnlichen Agenten. */
export function kopiere(db: Datenbank, id: string): Agent {
  const vorlage = holeVorhandenen(db, id);
  const { id: _id, erstelltAm: _erstellt, ...daten } = vorlage;
  const kopie = agenten.legeAgentAn(db, { ...daten, name: `${vorlage.name} (Kopie)` });
  agenten.kopiereRegeln(db, id, kopie.id);
  return kopie;
}

export function loesche(db: Datenbank, id: string): void {
  holeVorhandenen(db, id);
  if (id === agenten.standardAgentId) throw new Fehler(409, "Der Standard-Agent lässt sich nicht löschen.");
  agenten.loescheAgent(db, id);
}

export function holeVorhandenen(db: Datenbank, id: string): Agent {
  const agent = agenten.holeAgent(db, id);
  if (!agent) throw new Fehler(404, "Agent nicht gefunden");
  return agent;
}

/** Alle eingetragenen Server mit den Regeln dieses Agenten – auch die, die er (noch) nicht benutzt. */
export function regelnDesAgenten(db: Datenbank, agentId: string): ServerRegeln[] {
  return holeAlleServer(db).map((server) => ({
    schluessel: server.schluessel,
    name: server.name,
    tools: server.tools,
    ...holeRegeln(db, agentId, server.schluessel),
  }));
}
