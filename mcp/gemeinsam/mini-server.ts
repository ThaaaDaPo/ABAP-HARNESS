// Kleinster MCP-Server (stdio, zeilenweise JSON-RPC) ohne Abhängigkeiten.
// Grundlage der Stellvertreter-Server; Vorlage war pruefpaket/src/mini-mcp.js.
import readline from "node:readline";

export interface ToolDefinition {
  name: string;
  beschreibung: string;
  /** Ändert nichts. Wird als MCP-Angabe readOnlyHint weitergegeben. */
  nurLesend: boolean;
  /** JSON-Schema der Parameter */
  parameter: { type: "object"; properties: Record<string, unknown>; required?: string[] };
  /** Liefert den Ergebnistext. Ein geworfener Fehler wird als fehlgeschlagener Aufruf gemeldet. */
  ausfuehren: (argumente: Record<string, any>) => string | Promise<string>;
}

/** Ein Fehler, den der Agent sehen soll (z. B. „Objekt nicht gefunden"). */
export class ToolFehler extends Error {}

/**
 * `beimBeenden`: läuft, wenn die Eingabe endet (Copilot oder die App schließen die Verbindung),
 * z. B. um eine SAP-Sitzung abzumelden. Danach beendet sich der Prozess auch dann, wenn noch
 * Verbindungen offen sind.
 */
export function starteMcpServer(name: string, tools: ToolDefinition[], beimBeenden?: () => Promise<void>): void {
  const sende = (nachricht: object) => process.stdout.write(JSON.stringify(nachricht) + "\n");
  const antworte = (id: unknown, result: unknown) => sende({ jsonrpc: "2.0", id, result });

  // Aufrufe laufen gleichzeitig; jede Antwort trägt ihre id, die Reihenfolge ist egal.
  async function rufeAuf(id: unknown, toolName: string, argumente: Record<string, any>) {
    const tool = tools.find((t) => t.name === toolName);
    if (!tool) {
      sende({ jsonrpc: "2.0", id, error: { code: -32602, message: `Unbekanntes Tool ${toolName}` } });
      return;
    }
    try {
      antworte(id, { content: [{ type: "text", text: await tool.ausfuehren(argumente) }], isError: false });
    } catch (fehler) {
      antworte(id, { content: [{ type: "text", text: (fehler as Error).message }], isError: true });
    }
  }

  function behandle(anfrage: any) {
    const { id, method, params } = anfrage;
    if (id === undefined || id === null) return; // Benachrichtigung, keine Antwort nötig
    switch (method) {
      case "initialize":
        return antworte(id, {
          protocolVersion: params?.protocolVersion ?? "2025-06-18",
          capabilities: { tools: {} },
          serverInfo: { name, version: "0.1.0" },
        });
      case "ping":
        return antworte(id, {});
      case "tools/list":
        return antworte(id, {
          tools: tools.map((t) => ({
            name: t.name,
            description: t.beschreibung,
            inputSchema: t.parameter,
            annotations: { readOnlyHint: t.nurLesend },
          })),
        });
      case "tools/call":
        void rufeAuf(id, String(params?.name), params?.arguments ?? {});
        return;
      default:
        return sende({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unbekannte Methode ${method}` } });
    }
  }

  const eingabe = readline.createInterface({ input: process.stdin });
  eingabe.on("line", (zeile) => {
    if (!zeile.trim()) return;
    try {
      behandle(JSON.parse(zeile));
    } catch {
      // Unlesbare Zeile ignorieren
    }
  });
  // Ohne beimBeenden endet der Prozess von selbst, sobald nichts mehr offen ist.
  if (beimBeenden) {
    eingabe.on("close", () => {
      beimBeenden()
        .catch(() => {})
        .finally(() => process.exit(0));
    });
  }
}
