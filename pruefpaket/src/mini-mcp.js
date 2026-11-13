// Minimaler MCP-Server (stdio, zeilenweise JSON-RPC) ohne Abhaengigkeiten.
// Dient nur dazu zu pruefen, ob das Copilot SDK MCP-Server anbindet und Aufrufe abfangbar sind.
// Jeder Tool-Aufruf wird in die Datei aus PRUEF_MARKER geschrieben.
import fs from "node:fs";
import readline from "node:readline";

const marker = process.env.PRUEF_MARKER;

const tools = [
  {
    name: "echo",
    description: "Gibt den uebergebenen Text unveraendert zurueck. Nur fuer Pruefzwecke.",
    inputSchema: {
      type: "object",
      properties: { text: { type: "string", description: "Text, der zurueckgegeben wird" } },
      required: ["text"],
    },
  },
];

function sende(nachricht) {
  process.stdout.write(JSON.stringify(nachricht) + "\n");
}

function behandle(anfrage) {
  const { id, method, params } = anfrage;
  if (id === undefined || id === null) return; // Benachrichtigung, keine Antwort
  switch (method) {
    case "initialize":
      return sende({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: params?.protocolVersion ?? "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: { name: "pruef", version: "0.1.0" },
        },
      });
    case "ping":
      return sende({ jsonrpc: "2.0", id, result: {} });
    case "tools/list":
      return sende({ jsonrpc: "2.0", id, result: { tools } });
    case "tools/call": {
      const text = String(params?.arguments?.text ?? "");
      if (marker) fs.appendFileSync(marker, `${params?.name}:${text}\n`, "utf8");
      return sende({
        jsonrpc: "2.0",
        id,
        result: { content: [{ type: "text", text: `echo: ${text}` }], isError: false },
      });
    }
    default:
      return sende({ jsonrpc: "2.0", id, error: { code: -32601, message: `Unbekannte Methode ${method}` } });
  }
}

readline.createInterface({ input: process.stdin }).on("line", (zeile) => {
  if (!zeile.trim()) return;
  try {
    behandle(JSON.parse(zeile));
  } catch {
    // Unlesbare Zeile ignorieren
  }
});
