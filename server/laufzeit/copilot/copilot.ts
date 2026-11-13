// Echte Laufzeit über das GitHub Copilot SDK.
// Kann auf dem Privatrechner nicht getestet werden (kein Copilot erlaubt) – Vorlage war das
// Prüfpaket (pruefpaket/src/schritte-copilot.js), das auf dem Firmenrechner erfolgreich lief.
import { CopilotClient, type CopilotSession, type MCPServerConfig, type SessionConfig } from "@github/copilot-sdk";
import { laufzeitName } from "../../gateway/gateway.ts";
import { startAngaben } from "../../mcp/mcp-dienst.ts";
import type { AgentenLaufzeit, AgentenSitzung, EreignisEmpfaenger, SitzungsEinstellungen } from "../laufzeit.ts";
import { erstelleBerechtigungsPruefung, shellWerkzeuge } from "./berechtigungen.ts";
import { uebersetze } from "./ereignisse-uebersetzen.ts";
import { erstelleGatewayHooks } from "./gateway-hooks.ts";

// Steht immer im Auftrag. Ohne diesen Hinweis probiert der Agent gesperrte Wege mehrfach aus
// (am Firmenrechner beobachtet: fünf Versuche für `dir`) und verbraucht dabei Credits.
const umgebungsRegeln = [
  "Regeln dieser Umgebung:",
  "- Shell-Befehle und Internetzugriff sind technisch gesperrt. Versuche sie nicht und suche keine Umwege.",
  "- Dateien kannst du nur im Arbeitsverzeichnis lesen und schreiben.",
  "- Manche Tool-Aufrufe brauchen eine Freigabe. Sie werden dann nicht ausgeführt, sondern als Vorschlag ins Postfach gelegt. " +
    "Wiederhole sie nicht, arbeite mit dem weiter, was nicht davon abhängt, und nenne dem Nutzer die Nummer des Vorschlags.",
  "- Wird eine Aktion abgelehnt, nimm das hin und sage dem Nutzer, was du nicht tun konntest.",
].join("\n");

/** Die eingetragenen MCP-Server in der Form, die Copilot erwartet. Copilot startet sie selbst. */
function mcpKonfiguration(einstellungen: SitzungsEinstellungen): Record<string, MCPServerConfig> {
  const konfiguration: Record<string, MCPServerConfig> = {};
  for (const server of einstellungen.mcpServer) {
    const start = startAngaben(server);
    konfiguration[server.schluessel] = {
      type: "stdio",
      command: start.befehl,
      args: start.argumente,
      // Nur mitgeben, wenn etwas eingetragen ist. Ob Copilot die eigene Umgebung (PATH usw.)
      // dann ergänzt oder ersetzt, ist am Firmenrechner noch zu prüfen.
      ...(Object.keys(start.umgebung).length > 0 ? { env: start.umgebung } : {}),
      workingDirectory: start.arbeitsordner,
      tools: ["*"],
    };
  }
  return konfiguration;
}

function sitzungsKonfiguration(einstellungen: SitzungsEinstellungen): SessionConfig {
  const { gateway } = einstellungen;
  // Verbotene Tools gar nicht erst anbieten; abgelehnt werden sie trotzdem, falls doch aufgerufen.
  const verboten = gateway.verboteneTools(einstellungen.mcpServer).map((adresse) => `mcp:${laufzeitName(adresse)}`);
  return {
    ...(einstellungen.modell ? { model: einstellungen.modell } : {}),
    workingDirectory: einstellungen.workspaceOrdner,
    systemMessage: { mode: "append", content: `${einstellungen.auftrag}\n\n${umgebungsRegeln}` },
    streaming: true,
    mcpServers: mcpKonfiguration(einstellungen),
    excludedTools: [...shellWerkzeuge, ...verboten],
    hooks: erstelleGatewayHooks(gateway),
    onPermissionRequest: erstelleBerechtigungsPruefung(einstellungen.workspaceOrdner, gateway),
  };
}

class CopilotSitzung implements AgentenSitzung {
  readonly id: string;
  private sitzung: CopilotSession;
  private abmelden: () => void;

  constructor(sitzung: CopilotSession, empfaenger: EreignisEmpfaenger) {
    this.id = sitzung.sessionId;
    this.sitzung = sitzung;
    this.abmelden = sitzung.on((sdkEreignis) => {
      const ereignis = uebersetze(sdkEreignis);
      if (ereignis) empfaenger(ereignis);
    });
  }

  async sende(text: string): Promise<void> {
    // Fertig ist der Agent, wenn die Sitzung "idle" meldet. Kein Zeitlimit, denn Aufgaben
    // dürfen lange dauern; abbrechen geht über abbrechen().
    const fertig = new Promise<void>((erledigt) => {
      const weg = this.sitzung.on("session.idle", () => {
        weg();
        erledigt();
      });
    });
    await this.sitzung.send({ prompt: text });
    await fertig;
  }

  async abbrechen(): Promise<void> {
    await this.sitzung.abort();
  }

  async trennen(): Promise<void> {
    this.abmelden();
    await this.sitzung.disconnect();
  }
}

export class CopilotLaufzeit implements AgentenLaufzeit {
  readonly name = "copilot";
  private client: CopilotClient | null = null;

  /** Startet Copilot beim ersten Bedarf und prüft die Anmeldung. */
  private async holeClient(): Promise<CopilotClient> {
    if (this.client) return this.client;
    const client = new CopilotClient({ logLevel: "error" });
    await client.start();
    const anmeldung = await client.getAuthStatus();
    if (!anmeldung.isAuthenticated) {
      await client.stop();
      throw new Error(
        "Copilot ist nicht angemeldet. Bitte in einem Terminal `npx @github/copilot` starten, dort `/login` ausführen und die App neu starten.",
      );
    }
    this.client = client;
    return client;
  }

  async starte(einstellungen: SitzungsEinstellungen, empfaenger: EreignisEmpfaenger): Promise<AgentenSitzung> {
    const client = await this.holeClient();
    const sitzung = await client.createSession(sitzungsKonfiguration(einstellungen));
    return new CopilotSitzung(sitzung, empfaenger);
  }

  async setzeFort(sitzungId: string, einstellungen: SitzungsEinstellungen, empfaenger: EreignisEmpfaenger): Promise<AgentenSitzung> {
    const client = await this.holeClient();
    const sitzung = await client.resumeSession(sitzungId, sitzungsKonfiguration(einstellungen));
    return new CopilotSitzung(sitzung, empfaenger);
  }

  async beenden(): Promise<void> {
    await this.client?.stop();
    this.client = null;
  }
}
