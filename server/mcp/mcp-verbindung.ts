// Eigener kleiner MCP-Client (stdio, zeilenweise JSON-RPC), ohne Zusatzpaket.
// Wird gebraucht, um die Tools eines Servers auszulesen, und in der Simulation, um sie aufzurufen.
// Im Copilot-Modus startet Copilot die Server selbst; dieser Client ist dann nur fürs Auslesen da.
import { spawn, type ChildProcess } from "node:child_process";
import readline from "node:readline";
import type { McpTool, ToolParameter } from "../../gemeinsam/typen.ts";

export interface StartAngaben {
  befehl: string;
  argumente: string[];
  umgebung: Record<string, string>;
  /** Absoluter Pfad */
  arbeitsordner: string;
}

export interface AufrufErgebnis {
  text: string;
  /** Der Server meldet, dass das Tool fehlgeschlagen ist (isError). */
  fehler: boolean;
}

interface Wartend {
  erledigt: (ergebnis: any) => void;
  scheitert: (fehler: Error) => void;
  zeitlimit: NodeJS.Timeout;
}

/** Großzügig, weil der SAP-MCP beim Start ggf. erst im Browser ein Cookie holt (bis 60 s). */
const standardZeitlimit = 120_000;
/** Ein Tool-Aufruf kann auf die SSO-Anmeldung in Edge warten (ADT-MCP, bis 3 Minuten) und dann noch arbeiten. */
const aufrufZeitlimit = 300_000;

/** Fügt ein Argument für cmd.exe zusammen; Leerzeichen brauchen Anführungszeichen. */
function fuerCmd(teil: string): string {
  return /[\s"&|<>^]/.test(teil) ? `"${teil.replace(/"/g, '\\"')}"` : teil;
}

/**
 * Startet den Prozess. Unter Windows über cmd.exe, weil Befehle wie `npx` dort .cmd-Dateien
 * sind und Node die ohne Shell nicht startet.
 */
function starteProzess(angaben: StartAngaben): ChildProcess {
  const optionen = {
    cwd: angaben.arbeitsordner,
    // Die eigene Umgebung mitgeben, sonst fehlt z. B. PATH
    env: { ...process.env, ...angaben.umgebung },
    stdio: ["pipe", "pipe", "pipe"] as ["pipe", "pipe", "pipe"],
    windowsHide: true,
  };
  if (process.platform === "win32") {
    const zeile = [angaben.befehl, ...angaben.argumente].map(fuerCmd).join(" ");
    return spawn(zeile, { ...optionen, shell: true });
  }
  return spawn(angaben.befehl, angaben.argumente, optionen);
}

/** Die Parameter aus dem inputSchema eines Tools – nur, was der Workflow-Editor zum Vorbelegen braucht. */
function parameterAus(schema: any): ToolParameter[] {
  const pflicht: string[] = Array.isArray(schema?.required) ? schema.required : [];
  return Object.entries(schema?.properties ?? {}).map(([name, angaben]: [string, any]) => ({
    name,
    typ: typeof angaben?.type === "string" ? angaben.type : "",
    beschreibung: String(angaben?.description ?? ""),
    pflicht: pflicht.includes(name),
  }));
}

export class McpVerbindung {
  private prozess: ChildProcess;
  private naechsteId = 1;
  private wartend = new Map<number, Wartend>();
  /** Die letzten Zeilen der Fehlerausgabe des Servers – für verständliche Fehlermeldungen. */
  private fehlerAusgabe: string[] = [];
  private beendet: Error | null = null;

  /** Startet den Server und führt die MCP-Begrüßung durch. */
  static async oeffne(angaben: StartAngaben): Promise<McpVerbindung> {
    const verbindung = new McpVerbindung(angaben);
    try {
      await verbindung.anfrage("initialize", {
        protocolVersion: "2025-06-18",
        capabilities: {},
        clientInfo: { name: "abap-harness", version: "0.1.0" },
      });
      verbindung.benachrichtige("notifications/initialized");
      return verbindung;
    } catch (fehler) {
      verbindung.schliesse();
      throw fehler;
    }
  }

  private constructor(angaben: StartAngaben) {
    this.prozess = starteProzess(angaben);

    readline.createInterface({ input: this.prozess.stdout! }).on("line", (zeile) => this.beiZeile(zeile));
    readline.createInterface({ input: this.prozess.stderr! }).on("line", (zeile) => {
      this.fehlerAusgabe.push(zeile);
      if (this.fehlerAusgabe.length > 5) this.fehlerAusgabe.shift();
    });

    this.prozess.on("error", (fehler) => this.alleScheitern(new Error(`Server startet nicht: ${fehler.message}`)));
    this.prozess.on("exit", (code) => {
      const ausgabe = this.fehlerAusgabe.join(" | ");
      this.alleScheitern(new Error(`Server wurde beendet (Code ${code})${ausgabe ? `: ${ausgabe}` : ""}`));
    });
  }

  /** Liest alle Tools, auch wenn der Server sie seitenweise liefert. */
  async listeTools(): Promise<McpTool[]> {
    const tools: McpTool[] = [];
    let cursor: string | undefined;
    do {
      const seite = await this.anfrage("tools/list", cursor ? { cursor } : {});
      for (const tool of seite?.tools ?? []) {
        tools.push({
          name: String(tool.name),
          beschreibung: String(tool.description ?? ""),
          nurLesend: tool.annotations?.readOnlyHint === true,
          parameter: parameterAus(tool.inputSchema),
        });
      }
      cursor = seite?.nextCursor;
    } while (cursor);
    return tools;
  }

  async rufeAuf(tool: string, argumente: unknown): Promise<AufrufErgebnis> {
    const ergebnis = await this.anfrage("tools/call", { name: tool, arguments: argumente ?? {} }, aufrufZeitlimit);
    const teile: { type: string; text?: string }[] = ergebnis?.content ?? [];
    const text = teile.map((teil) => (teil.type === "text" ? teil.text : `[${teil.type}]`)).join("\n");
    return { text, fehler: ergebnis?.isError === true };
  }

  schliesse(): void {
    // Erst die Eingabe schließen – ordentliche Server beenden sich dann selbst.
    this.prozess.stdin?.end();
    setTimeout(() => this.prozess.kill(), 1000).unref();
  }

  private anfrage(methode: string, parameter: unknown, zeitlimitMs = standardZeitlimit): Promise<any> {
    if (this.beendet) return Promise.reject(this.beendet);
    const id = this.naechsteId++;
    return new Promise((erledigt, scheitert) => {
      const zeitlimit = setTimeout(() => {
        this.wartend.delete(id);
        scheitert(new Error(`Keine Antwort auf ${methode} nach ${zeitlimitMs / 1000} s`));
      }, zeitlimitMs);
      this.wartend.set(id, { erledigt, scheitert, zeitlimit });
      this.schreibe({ jsonrpc: "2.0", id, method: methode, params: parameter });
    });
  }

  private benachrichtige(methode: string): void {
    this.schreibe({ jsonrpc: "2.0", method: methode });
  }

  private schreibe(nachricht: object): void {
    this.prozess.stdin?.write(JSON.stringify(nachricht) + "\n");
  }

  private beiZeile(zeile: string): void {
    let nachricht: any;
    try {
      nachricht = JSON.parse(zeile);
    } catch {
      return; // Manche Server schreiben Protokollzeilen auf stdout – ignorieren
    }

    // Anfragen des Servers an uns (z. B. roots/list) beantworten wir nicht inhaltlich,
    // aber mit einer Antwort, damit der Server nicht wartet.
    if (nachricht.method && nachricht.id !== undefined) {
      this.schreibe({ jsonrpc: "2.0", id: nachricht.id, error: { code: -32601, message: "Nicht unterstützt" } });
      return;
    }

    const wartend = this.wartend.get(nachricht.id);
    if (!wartend) return;
    this.wartend.delete(nachricht.id);
    clearTimeout(wartend.zeitlimit);
    if (nachricht.error) wartend.scheitert(new Error(nachricht.error.message ?? "Fehler vom Server"));
    else wartend.erledigt(nachricht.result);
  }

  private alleScheitern(fehler: Error): void {
    this.beendet ??= fehler;
    for (const wartend of this.wartend.values()) {
      clearTimeout(wartend.zeitlimit);
      wartend.scheitert(fehler);
    }
    this.wartend.clear();
  }
}
