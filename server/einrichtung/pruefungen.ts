// Prüfungen für die Einrichtungsseite: Läuft alles, was die App braucht? Nur prüfen und anzeigen –
// geändert wird hier nichts (E-60). Jede Prüfung liefert eine Zeile mit verständlichem Hinweis.
import fs from "node:fs";
import path from "node:path";
import type { EinrichtungsBericht, Pruefung } from "../../gemeinsam/typen.ts";
import type { Datenbank } from "../datenbank/datenbank.ts";
import { holeAlleServer } from "../datenbank/mcp-server.ts";
import { einstellungsDatei, type Einstellungen } from "../einstellungen.ts";
import { durchsuche } from "../instructions/instructions-ordner.ts";
import type { AgentenLaufzeit } from "../laufzeit/laufzeit.ts";
import { startAngaben } from "../mcp/mcp-dienst.ts";
import { McpVerbindung } from "../mcp/mcp-verbindung.ts";

/** Mindestversion: abap-adt-api verlangt 22.15, am Firmenrechner läuft 22.16 (Phase 0). */
const nodeMindestens = [22, 16];

/**
 * `mcpStarten`: MCP-Server wirklich starten und ihre Tools lesen. Das kann dauern und beim SAP-MCP
 * Edge für das Cookie öffnen – deshalb nur auf Knopfdruck. Sonst zeigt die Seite den letzten Stand.
 */
export async function pruefeEinrichtung(
  einstellungen: Einstellungen,
  db: Datenbank,
  laufzeit: AgentenLaufzeit,
  mcpStarten: boolean,
): Promise<EinrichtungsBericht> {
  const pruefungen: Pruefung[] = [
    pruefeNode(),
    pruefeModus(einstellungen),
    await pruefeAnmeldung(laufzeit),
    await pruefeModelle(laufzeit),
    pruefeOrdner("Workspace-Ordner", einstellungen.workspaceOrdner, "workspaceOrdner"),
    pruefeInstructions(einstellungen.instructionsOrdner),
    ...(mcpStarten ? await starteMcpServer(db) : letzterMcpStand(db)),
  ];
  return {
    pruefungen,
    einstellungen: [
      { name: "Einstellungsdatei", wert: fs.existsSync(einstellungsDatei) ? einstellungsDatei : `keine (${einstellungsDatei} fehlt – es gelten die Standardwerte)` },
      { name: "Modus", wert: einstellungen.modus },
      { name: "Port", wert: String(einstellungen.port) },
      { name: "Workspace-Ordner", wert: einstellungen.workspaceOrdner },
      { name: "Instructions-Ordner", wert: einstellungen.instructionsOrdner },
      { name: "Daten-Ordner", wert: einstellungen.datenOrdner },
    ],
  };
}

function pruefeNode(): Pruefung {
  const [haupt, neben] = process.versions.node.split(".").map(Number);
  const ok = haupt > nodeMindestens[0] || (haupt === nodeMindestens[0] && neben >= nodeMindestens[1]);
  return {
    titel: "Node.js",
    ok,
    text: `Version ${process.versions.node}`,
    ...(ok ? {} : { hinweis: `Mindestens ${nodeMindestens.join(".")} nötig. Bitte Node.js aktualisieren.` }),
  };
}

function pruefeModus(einstellungen: Einstellungen): Pruefung {
  if (einstellungen.modus === "copilot") return { titel: "Modus", ok: true, text: "Copilot – die Agenten arbeiten mit echten Modellen." };
  return {
    titel: "Modus",
    ok: null,
    text: "Simulation – statt eines Modells läuft ein Drehbuch.",
    hinweis: 'Für echtes Copilot in einstellungen.json "modus": "copilot" eintragen und die App neu starten.',
  };
}

async function pruefeAnmeldung(laufzeit: AgentenLaufzeit): Promise<Pruefung> {
  const { angemeldet, text } = await laufzeit.anmeldung();
  return {
    titel: "Copilot-Anmeldung",
    ok: angemeldet,
    text,
    ...(angemeldet === false ? { hinweis: "In einem Terminal `npx @github/copilot` starten, dort `/login` ausführen, dann `/exit` und die App neu starten." } : {}),
  };
}

async function pruefeModelle(laufzeit: AgentenLaufzeit): Promise<Pruefung> {
  try {
    const modelle = await laufzeit.modelle();
    if (modelle.length === 0) return { titel: "Modelle", ok: null, text: "Keine Einzelmodelle – nur automatische Auswahl." };
    return { titel: "Modelle", ok: true, text: `${modelle.length}: ${modelle.map((m) => m.name).join(", ")}` };
  } catch (fehler) {
    return { titel: "Modelle", ok: false, text: (fehler as Error).message, hinweis: "Meist fehlt die Copilot-Anmeldung (siehe oben)." };
  }
}

/** Gibt es den Ordner, und darf die App dort schreiben? Geprüft mit einer kurzen Testdatei. */
function pruefeOrdner(titel: string, ordner: string, einstellung: string): Pruefung {
  if (!fs.existsSync(ordner)) {
    return { titel, ok: false, text: `${ordner} gibt es nicht.`, hinweis: `Ordner anlegen oder "${einstellung}" in einstellungen.json korrigieren.` };
  }
  const testdatei = path.join(ordner, `.harness-schreibtest-${process.pid}`);
  try {
    fs.writeFileSync(testdatei, "");
    fs.rmSync(testdatei);
    return { titel, ok: true, text: `${ordner} – vorhanden und beschreibbar.` };
  } catch (fehler) {
    return { titel, ok: false, text: `${ordner} ist nicht beschreibbar: ${(fehler as Error).message}`, hinweis: "Rechte des Ordners prüfen." };
  }
}

function pruefeInstructions(ordner: string): Pruefung {
  const grundlage = pruefeOrdner("Instructions-Ordner", ordner, "instructionsOrdner");
  if (!grundlage.ok) return grundlage;
  try {
    const { instructions, skills } = durchsuche(ordner);
    return { ...grundlage, text: `${grundlage.text} ${instructions.length} Instructions, ${skills.length} Skills.` };
  } catch (fehler) {
    return { ...grundlage, ok: false, text: (fehler as Error).message };
  }
}

/** Ohne Starten: was beim letzten Auslesen der Tools herauskam. */
function letzterMcpStand(db: Datenbank): Pruefung[] {
  const server = holeAlleServer(db);
  if (server.length === 0) return [{ titel: "MCP-Server", ok: null, text: "Keine Server eingetragen." }];
  return server.map((server) => {
    const titel = `MCP-Server ${server.name}`;
    if (server.leseFehler) return { titel, ok: false, text: `Zuletzt fehlgeschlagen: ${server.leseFehler}`, hinweis: "Startbefehl auf der Seite MCP-Server prüfen." };
    if (!server.toolsGelesenAm) return { titel, ok: null, text: "Noch nie ausgelesen." };
    return {
      titel,
      ok: true,
      text: `${server.tools.length} Tools, zuletzt ausgelesen am ${new Date(server.toolsGelesenAm).toLocaleString("de-DE")}.`,
    };
  });
}

/** Startet jeden Server kurz und liest seine Tools – ohne etwas zu speichern. */
async function starteMcpServer(db: Datenbank): Promise<Pruefung[]> {
  const ergebnisse: Pruefung[] = [];
  for (const server of holeAlleServer(db)) {
    const titel = `MCP-Server ${server.name}`;
    let verbindung: McpVerbindung | null = null;
    try {
      verbindung = await McpVerbindung.oeffne(startAngaben(server));
      const tools = await verbindung.listeTools();
      ergebnisse.push({ titel, ok: true, text: `Erreichbar, ${tools.length} Tools.` });
    } catch (fehler) {
      ergebnisse.push({ titel, ok: false, text: (fehler as Error).message, hinweis: "Startbefehl auf der Seite MCP-Server prüfen." });
    } finally {
      verbindung?.schliesse();
    }
  }
  if (ergebnisse.length === 0) ergebnisse.push({ titel: "MCP-Server", ok: null, text: "Keine Server eingetragen." });
  return ergebnisse;
}
