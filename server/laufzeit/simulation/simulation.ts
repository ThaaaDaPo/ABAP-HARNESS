// Simulierte Laufzeit: spielt das Drehbuch ab statt ein echtes Modell zu fragen.
// Damit lässt sich die ganze App ohne Copilot entwickeln und testen.
// Tool-Aufrufe aus dem Drehbuch gehen wie bei Copilot durch das Tool-Gateway und werden,
// wenn es sie erlaubt, wirklich beim eingetragenen MCP-Server ausgeführt. Die Plattform-Tools
// (Rückfrage, auf Freigabe warten) laufen ebenfalls echt.
// KI-Schritte von Workflows: Bietet die Sitzung ergebnis_melden an und ruft das Drehbuch es nicht auf,
// meldet die Simulation am Ende selbst ein Beispielergebnis – so laufen Workflows auch ohne Copilot durch.
import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { ModellAufrufVerbrauch, ModellInfo } from "../../../gemeinsam/typen.ts";
import type { McpAufrufer } from "../../mcp/mcp-aufrufer.ts";
import type { AgentenLaufzeit, AgentenSitzung, EreignisEmpfaenger, SitzungsEinstellungen } from "../laufzeit.ts";
import { liegtImOrdner } from "../copilot/berechtigungen.ts";
import { findeSchritte, type DrehbuchSchritt } from "./drehbuch.ts";

const pause = (ms: number) => new Promise((fertig) => setTimeout(fertig, ms));

type ToolSchritt = Extract<DrehbuchSchritt, { tool: string }>;

/** Zwei Modelle zum Ausprobieren der Modellwahl: eins ohne, eins mit Einstellmöglichkeiten. */
const simulierteModelle: ModellInfo[] = [
  {
    id: "sim-schnell",
    name: "Simulation schnell",
    denkStufen: [],
    standardDenkStufe: null,
    kontextStandard: 128000,
    langerKontext: false,
    kontextLang: null,
    multiplikator: 0,
  },
  {
    id: "sim-gruendlich",
    name: "Simulation gründlich",
    denkStufen: ["low", "medium", "high"],
    standardDenkStufe: "medium",
    kontextStandard: 200000,
    langerKontext: true,
    kontextLang: 1000000,
    multiplikator: 1,
  },
];

/**
 * Erfundene, aber plausible Zahlen, damit die Verbrauchsanzeige etwas zu zeigen hat: grob vier
 * Zeichen je Token; die Kosten richten sich nach dem Kostenfaktor des Modells (automatisch = 1).
 */
function erfundenerVerbrauch(modell: string, zeichenEin: number, zeichenAus: number): ModellAufrufVerbrauch {
  const eingabeTokens = 900 + Math.round(zeichenEin / 4);
  const ausgabeTokens = 20 + Math.round(zeichenAus / 4);
  const faktor = simulierteModelle.find((m) => m.id === modell)?.multiplikator ?? 1;
  return {
    modell,
    eingabeTokens,
    ausgabeTokens,
    cacheTokens: Math.round(eingabeTokens * 0.6),
    nanoAiu: Math.round((eingabeTokens + 4 * ausgabeTokens) * 10_000 * faktor),
    kostenfaktor: faktor,
  };
}

class SimulationsSitzung implements AgentenSitzung {
  readonly id: string;
  private einstellungen: SitzungsEinstellungen;
  private empfaenger: EreignisEmpfaenger;
  private aufrufer: McpAufrufer;
  private abgebrochen = false;
  /** Hat das Drehbuch in diesem Lauf schon ergebnis_melden aufgerufen? */
  private ergebnisGemeldet = false;

  constructor(id: string, einstellungen: SitzungsEinstellungen, empfaenger: EreignisEmpfaenger, aufrufer: McpAufrufer) {
    this.id = id;
    this.einstellungen = einstellungen;
    this.empfaenger = empfaenger;
    this.aufrufer = aufrufer;
  }

  async sende(text: string): Promise<void> {
    this.abgebrochen = false;
    this.ergebnisGemeldet = false;
    const modell = this.einstellungen.modell || "sim-automatisch";
    this.empfaenger({ art: "modell", modell });
    const geschrieben = await this.spiele(text);
    await this.meldeBeispielergebnis();
    this.empfaenger({ art: "verbrauch", ...erfundenerVerbrauch(modell, this.einstellungen.auftrag.length + text.length, geschrieben) });
  }

  /** Spielt das Drehbuch zu einem Text ab. Gibt zurück, wie viele Zeichen der Agent geschrieben hat. */
  private async spiele(text: string): Promise<number> {
    let geschrieben = 0;
    for (const schritt of findeSchritte(text)) {
      if (this.abgebrochen) return geschrieben;

      if ("warten" in schritt) {
        await this.warte(schritt.warten);
      } else if ("datei" in schritt) {
        await this.schreibeDatei(schritt.datei, schritt.inhalt);
      } else if ("tool" in schritt) {
        const aufrufId = randomUUID();
        this.empfaenger({ art: "tool_start", aufrufId, toolName: schritt.tool, argumente: schritt.argumente });
        await pause(300);
        const { erfolgreich, ergebnis } = await this.fuehreAus(schritt, aufrufId);
        this.empfaenger({ art: "tool_ende", aufrufId, erfolgreich, ergebnis });
        // Wie ein echtes Modell auf einen Änderungswunsch reagieren: mit dem Drehbuch dafür
        if (!erfolgreich && ergebnis.includes("wünscht Änderungen")) return geschrieben + (await this.spiele(ergebnis));
      } else {
        const { agentName, auftrag, abgeschalteteSkills } = this.einstellungen;
        const ausgabe = schritt.text
          .replace("{eingabe}", text)
          .replace("{modell}", this.modellText())
          .replace("{agent}", agentName)
          .replace("{auftrag}", auftrag.trim() || "(leer)")
          .replace("{abgeschaltet}", abgeschalteteSkills.join(", ") || "keine");
        await this.schreibe(ausgabe);
        geschrieben += ausgabe.length;
      }
    }
    return geschrieben;
  }

  /** Damit man in der Simulation sieht, dass die Modellwahl des Chats ankommt. */
  private modellText(): string {
    const { modell, denkaufwand, kontext } = this.einstellungen;
    return [modell || "automatisch", denkaufwand && `Thinking Effort ${denkaufwand}`, kontext === "lang" && "langer Kontext"]
      .filter(Boolean)
      .join(", ");
  }

  /** Fragt das Gateway und ruft das Tool beim MCP-Server auf, wenn es erlaubt ist. */
  private async fuehreAus(schritt: ToolSchritt, aufrufId: string): Promise<{ erfolgreich: boolean; ergebnis: string }> {
    const { gateway, mcpServer, plattformTools } = this.einstellungen;

    const plattformTool = plattformTools.find((t) => t.name === schritt.tool);
    if (plattformTool) {
      if (schritt.tool === "ergebnis_melden") this.ergebnisGemeldet = true;
      return { erfolgreich: true, ergebnis: await plattformTool.fuehreAus(schritt.argumente ?? {}) };
    }

    const adresse = gateway.zerlege(schritt.tool);

    // Kein MCP-Tool eines eingetragenen Servers: das Ergebnis steht im Drehbuch.
    if (!adresse) return { erfolgreich: !schritt.fehlgeschlagen, ergebnis: schritt.ergebnis ?? "" };

    const entscheidung = await gateway.vorAufruf(adresse, schritt.argumente, aufrufId);
    if (!entscheidung.ausfuehren) return { erfolgreich: false, ergebnis: entscheidung.grund };

    try {
      const server = mcpServer.find((s) => s.schluessel === adresse.server);
      if (!server) throw new Error(`Server ${adresse.server} war beim Start der Sitzung nicht eingetragen.`);
      const antwort = await this.aufrufer.rufeAuf(server, adresse.tool, schritt.argumente);
      if (!antwort.fehler) gateway.nachAufruf(adresse, schritt.argumente, antwort.text, aufrufId);
      return { erfolgreich: !antwort.fehler, ergebnis: antwort.text };
    } catch (fehler) {
      return { erfolgreich: false, ergebnis: (fehler as Error).message };
    }
  }

  /** Ruft ergebnis_melden mit Beispielwerten passend zu den Feldern auf, falls das Drehbuch es nicht getan hat. */
  private async meldeBeispielergebnis(): Promise<void> {
    const werkzeug = this.einstellungen.plattformTools.find((t) => t.name === "ergebnis_melden");
    if (!werkzeug || this.ergebnisGemeldet || this.abgebrochen) return;
    const felder = (werkzeug.parameter.properties ?? {}) as Record<string, { type?: string; description?: string }>;
    const argumente = Object.fromEntries(Object.entries(felder).map(([name, feld]) => [name, beispielWert(name, feld)]));
    const aufrufId = randomUUID();
    this.empfaenger({ art: "tool_start", aufrufId, toolName: werkzeug.name, argumente });
    await pause(200);
    this.empfaenger({ art: "tool_ende", aufrufId, erfolgreich: true, ergebnis: await werkzeug.fuehreAus(argumente) });
  }

  /**
   * Wie das Datei-Werkzeug von Copilot: Datei im Workspace schreiben, als Tool-Aufruf „edit“ sichtbar.
   * Außerhalb des Workspace wird abgelehnt – wie bei Copilot durch die Berechtigungsprüfung.
   */
  private async schreibeDatei(datei: string, inhalt: string): Promise<void> {
    const aufrufId = randomUUID();
    this.empfaenger({ art: "tool_start", aufrufId, toolName: "edit", argumente: { path: datei } });
    await pause(300);
    const ziel = path.resolve(this.einstellungen.workspaceOrdner, datei);
    if (!liegtImOrdner(this.einstellungen.workspaceOrdner, ziel)) {
      this.empfaenger({ art: "tool_ende", aufrufId, erfolgreich: false, ergebnis: "Schreiben ist nur im Workspace-Ordner erlaubt." });
      return;
    }
    fs.mkdirSync(path.dirname(ziel), { recursive: true });
    fs.writeFileSync(ziel, inhalt, "utf8");
    this.empfaenger({ art: "tool_ende", aufrufId, erfolgreich: true, ergebnis: `${datei} geschrieben (${inhalt.split("\n").length} Zeilen).` });
  }

  /** Gibt den Text Wort für Wort aus, wie ein echtes Modell beim Streamen. */
  private async schreibe(text: string): Promise<void> {
    for (const wort of text.split(/(?<=\s)/)) {
      if (this.abgebrochen) return;
      this.empfaenger({ art: "agent_schreibt", textTeil: wort });
      await pause(25);
    }
    this.empfaenger({ art: "agent_nachricht", text });
  }

  /** Wartet, lässt sich aber durch Abbrechen unterbrechen. */
  private async warte(ms: number): Promise<void> {
    const ende = Date.now() + ms;
    while (Date.now() < ende && !this.abgebrochen) await pause(100);
  }

  async abbrechen(): Promise<void> {
    this.abgebrochen = true;
  }

  async trennen(): Promise<void> {}
}

/** Beispielwert für ein Ergebnisfeld: ja/nein immer ja, Zahlen 1, Texte mit Hinweis auf die Simulation. */
function beispielWert(name: string, feld: { type?: string; description?: string }): unknown {
  switch (feld.type) {
    case "boolean":
      return true;
    case "number":
      return 1;
    case "array":
      return ["(Simulation) Eintrag 1", "(Simulation) Eintrag 2"];
    default:
      return `(Simulation) ${feld.description || name}`;
  }
}

export class SimulationsLaufzeit implements AgentenLaufzeit {
  readonly name = "simulation";
  private aufrufer: McpAufrufer;

  constructor(aufrufer: McpAufrufer) {
    this.aufrufer = aufrufer;
  }

  async starte(einstellungen: SitzungsEinstellungen, empfaenger: EreignisEmpfaenger): Promise<AgentenSitzung> {
    return new SimulationsSitzung(randomUUID(), einstellungen, empfaenger, this.aufrufer);
  }

  async setzeFort(sitzungId: string, einstellungen: SitzungsEinstellungen, empfaenger: EreignisEmpfaenger): Promise<AgentenSitzung> {
    return new SimulationsSitzung(sitzungId, einstellungen, empfaenger, this.aufrufer);
  }

  async loescheSitzung(): Promise<void> {}

  async modelle(): Promise<ModellInfo[]> {
    return simulierteModelle;
  }

  async anmeldung(): Promise<{ angemeldet: boolean | null; text: string }> {
    return { angemeldet: null, text: "Nicht nötig – die Simulation spricht nicht mit Copilot." };
  }

  // Die MCP-Verbindungen gehören dem Aufrufer und werden beim Herunterfahren dort geschlossen.
  async beenden(): Promise<void> {}
}
