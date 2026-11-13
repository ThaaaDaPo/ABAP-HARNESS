// C-Schritte: Copilot SDK (T1).
// Prueft die Faehigkeiten, auf denen Tool-Gateway und Postfach aufbauen:
// eigene Tools, MCP-Anbindung, Abfangen von Aufrufen, Dateizugriff begrenzen, Sitzung fortsetzen.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PRUEFWERT = "KOBALT-7391";
const WARTEZEIT = 180000;

function innerhalb(ordner, datei) {
  const rel = path.relative(path.resolve(ordner), path.resolve(ordner, datei));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

export async function pruefeCopilot(bericht, config) {
  const sdk = await import("@github/copilot-sdk").catch(() => null);
  const basis = fs.mkdtempSync(path.join(os.tmpdir(), "harness-pruef-"));
  const workspace = path.join(basis, "workspace");
  const aussen = path.join(basis, "aussen");
  fs.mkdirSync(workspace);
  fs.mkdirSync(aussen);
  const marker = path.join(basis, "mcp-marker.txt");
  const miniMcp = path.join(path.dirname(fileURLToPath(import.meta.url)), "mini-mcp.js");

  const gesehen = { berechtigungen: [], hooks: [], toolAufrufe: 0 };
  let client = null;
  let session = null;
  let sessionId = null;
  let modell = config.copilot?.modell || undefined;

  const berechtigung = (anfrage) => {
    const pfade = [anfrage.fileName, anfrage.path].filter((p) => typeof p === "string");
    const felder = Object.keys(anfrage).sort().join(",");
    let erlaubt;
    if (anfrage.kind === "custom-tool" || anfrage.kind === "mcp") erlaubt = true;
    else if ((anfrage.kind === "write" || anfrage.kind === "read") && pfade.length > 0)
      erlaubt = pfade.every((p) => innerhalb(workspace, p));
    else erlaubt = false;
    gesehen.berechtigungen.push(`${anfrage.kind}${erlaubt ? "+" : "-"} (${felder})`);
    return erlaubt
      ? { kind: "approve-once" }
      : { kind: "reject", feedback: "Vom Pruefpaket abgelehnt: nur Dateien im Arbeitsordner sind erlaubt." };
  };

  const tools = () => [
    sdk.defineTool("pruefwert_holen", {
      description: "Liefert die Pruefnummer dieses Testlaufs. Die Nummer ist nicht vertraulich und darf genannt werden.",
      parameters: { type: "object", properties: {} },
      handler: async () => {
        gesehen.toolAufrufe++;
        return PRUEFWERT;
      },
    }),
  ];

  const sitzungsConfig = () => ({
    ...(modell ? { model: modell } : {}),
    workingDirectory: workspace,
    tools: tools(),
    mcpServers: {
      pruef: { type: "stdio", command: process.execPath, args: [miniMcp], env: { PRUEF_MARKER: marker }, tools: ["*"] },
    },
    onPermissionRequest: berechtigung,
    hooks: {
      onPreToolUse: async (eingabe) => {
        gesehen.hooks.push(eingabe.toolName);
        return undefined;
      },
    },
  });

  const frage = async (prompt) => {
    const antwort = await session.sendAndWait({ prompt }, WARTEZEIT);
    return String(antwort?.data?.content ?? "");
  };

  try {
    const gestartet = await bericht.schritt(
      "C1",
      "Copilot starten und Anmeldung",
      async () => {
        client = new sdk.CopilotClient({ workingDirectory: workspace, logLevel: "error" });
        await client.start();
        const status = await client.getAuthStatus();
        if (!status.isAuthenticated) throw new Error(`nicht angemeldet: ${status.statusMessage ?? "kein Status"}`);
        return `${status.login ?? "?"} (${status.authType ?? "?"})`;
      },
      { voraussetzung: !!sdk },
    );

    await bericht.schritt(
      "C2",
      "Modelle auflisten",
      async () => {
        const modelle = await client.listModels();
        const ids = modelle.map((m) => m.id);
        if (modell && !ids.includes(modell)) throw new Error(`Modell ${modell} aus der Config ist nicht in der Liste`);
        if (ids.length === 0) {
          // Manche Copilot-Plaene liefern keine Einzelmodelle, sondern nur die automatische Auswahl.
          const roh = await client.rpc.models.list().catch(() => null);
          const stufen = (roh?.auto?.tiers ?? []).filter((t) => t.status?.enabled).map((t) => t.id);
          return { kurz: `keine Einzelmodelle, automatische Auswahl: ${stufen.join(",") || "unbekannt"}`, warnung: true };
        }
        return { kurz: `${ids.length} Modelle`, lang: ids.join(", ") };
      },
      { voraussetzung: gestartet },
    );

    const sitzung = await bericht.schritt(
      "C3",
      "Sitzung mit eigenem Tool",
      async () => {
        session = await client.createSession(sitzungsConfig());
        sessionId = session.sessionId;
        const antwort = await frage("Rufe das Tool pruefwert_holen auf und nenne mir genau die Pruefnummer, die es liefert.");
        if (gesehen.toolAufrufe === 0) throw new Error("Tool wurde nicht aufgerufen");
        if (!antwort.includes(PRUEFWERT)) throw new Error(`Antwort enthaelt den Wert nicht: ${antwort.slice(0, 80)}`);
        return "Tool aufgerufen, Wert in der Antwort";
      },
      { voraussetzung: gestartet },
    );

    await bericht.schritt(
      "C4",
      "MCP-Server anbinden",
      async () => {
        await frage("Rufe das Tool echo des MCP-Servers pruef mit dem Text hallo-harness auf.");
        const inhalt = fs.existsSync(marker) ? fs.readFileSync(marker, "utf8") : "";
        if (!inhalt.includes("hallo-harness")) throw new Error("MCP-Tool wurde nicht aufgerufen");
        const namen = gesehen.hooks.filter((n) => /echo/i.test(n));
        return { kurz: `aufgerufen als ${namen[0] ?? "?"}`, lang: `Tool-Namen im Hook: ${gesehen.hooks.join(", ")}` };
      },
      { voraussetzung: sitzung },
    );

    await bericht.schritt(
      "C5",
      "Aufrufe abfangbar (Hook und Berechtigung)",
      async () => {
        if (gesehen.hooks.length === 0) throw new Error("Hook onPreToolUse wurde nie aufgerufen");
        const arten = [...new Set(gesehen.berechtigungen.map((b) => b.split(/[+-]/)[0]))];
        if (arten.length === 0) throw new Error("Berechtigungsabfrage wurde nie aufgerufen");
        return { kurz: `Hook ${gesehen.hooks.length}x, Berechtigung fuer ${arten.join(",")}`, lang: gesehen.berechtigungen.join("\n") };
      },
      { voraussetzung: sitzung },
    );

    await bericht.schritt(
      "C6",
      "Datei im Arbeitsordner schreiben",
      async () => {
        await frage("Lege in deinem Arbeitsverzeichnis die Datei erlaubt.txt mit dem Inhalt ok an.");
        if (!fs.existsSync(path.join(workspace, "erlaubt.txt"))) throw new Error("Datei wurde nicht angelegt");
        return "angelegt";
      },
      { voraussetzung: sitzung },
    );

    await bericht.schritt(
      "C7",
      "Datei ausserhalb wird verhindert",
      async () => {
        const ziel = path.join(aussen, "verboten.txt");
        await frage(`Lege die Datei ${ziel} mit dem Inhalt nein an. Wenn das abgelehnt wird, versuche es auf keinem anderen Weg.`);
        if (fs.existsSync(ziel)) throw new Error("Datei ausserhalb des Arbeitsordners wurde angelegt");
        const abgelehnt = gesehen.berechtigungen.filter((b) => b.includes("-"));
        return { kurz: `verhindert, ${abgelehnt.length} Ablehnungen`, lang: abgelehnt.join("\n") };
      },
      { voraussetzung: sitzung },
    );

    await bericht.schritt(
      "C8",
      "Sitzung beenden und spaeter fortsetzen",
      async () => {
        await session.disconnect();
        await client.stop();
        session = null;
        client = new sdk.CopilotClient({ workingDirectory: workspace, logLevel: "error" });
        await client.start();
        const vorher = gesehen.toolAufrufe;
        session = await client.resumeSession(sessionId, sitzungsConfig());
        const antwort = await frage(
          "Welche Pruefnummer hat das Tool pruefwert_holen vorhin in diesem Gespraech geliefert? Nenne sie aus dem bisherigen Verlauf und rufe dafuer kein Tool auf.",
        );
        if (!antwort.includes(PRUEFWERT)) throw new Error(`Kontext fehlt nach Fortsetzen: ${antwort.slice(0, 80)}`);
        const erneut = gesehen.toolAufrufe > vorher;
        return { kurz: erneut ? "Wert bekannt, aber Tool erneut aufgerufen" : "Kontext erhalten", warnung: erneut };
      },
      { voraussetzung: sitzung },
    );
  } finally {
    try {
      if (session) await session.disconnect();
      if (client && sessionId) await client.deleteSession(sessionId).catch(() => {});
      if (client) await client.stop();
    } catch {
      // Aufraeumen darf den Bericht nicht verhindern
    }
    fs.rmSync(basis, { recursive: true, force: true });
  }
}
