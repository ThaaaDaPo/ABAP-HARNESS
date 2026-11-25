// Echte Laufzeit über das GitHub Copilot SDK.
// Kann auf dem Privatrechner nicht getestet werden (kein Copilot erlaubt) – Vorlage war das
// Prüfpaket (pruefpaket/src/schritte-copilot.js), das auf dem Firmenrechner erfolgreich lief.
import {
  CopilotClient,
  defineTool,
  type CopilotSession,
  type MCPServerConfig,
  type ModelInfo,
  type SessionConfig,
  type Tool,
} from "@github/copilot-sdk";
import type { ModellInfo } from "../../../gemeinsam/typen.ts";
import { laufzeitName } from "../../gateway/gateway.ts";
import { startAngaben } from "../../mcp/mcp-dienst.ts";
import type { AgentenLaufzeit, AgentenSitzung, EreignisEmpfaenger, SitzungsEinstellungen } from "../laufzeit.ts";
import { erstelleBerechtigungsPruefung, shellWerkzeuge } from "./berechtigungen.ts";
import { uebersetze } from "./ereignisse-uebersetzen.ts";
import { erstelleGatewayHooks } from "./gateway-hooks.ts";

// Steht immer im Auftrag. Ohne diesen Hinweis probiert der Agent gesperrte Wege mehrfach aus
// (am Firmenrechner beobachtet: fünf Versuche für `dir`) und verbraucht dabei Credits.
// Freigaben und Rückfragen laufen im Chat anders als ohne Nutzer (Workflow), daher zwei Fassungen.
function umgebungsRegeln(imChat: boolean): string {
  return [
    "Regeln dieser Umgebung:",
    "- Shell-Befehle und Internetzugriff sind technisch gesperrt. Versuche sie nicht und suche keine Umwege.",
    "- Dateien kannst du nur im Arbeitsverzeichnis lesen und schreiben.",
    imChat
      ? "- Manche Tool-Aufrufe brauchen eine Freigabe durch den Nutzer. Der Aufruf wartet dann, bis er entschieden hat – das ist normal. " +
        "Kündige ihn nicht vorher an und frag nicht zusätzlich um Erlaubnis. Wünscht der Nutzer Änderungen, bekommst du sie als " +
        "Ergebnis und rufst das Tool angepasst erneut auf. Hat er verworfen, hör ohne weiteren Text auf. " +
        "Ist die Aufgabe mit dem freigegebenen Aufruf erledigt, genügt ein kurzer Satz."
      : "- Manche Tool-Aufrufe brauchen eine Freigabe. Sie werden dann nicht ausgeführt, sondern als Vorschlag abgelegt, den der Nutzer freigibt; " +
        "nach der Freigabe führt die Plattform sie selbst aus. Wiederhole sie nicht. Ist die Aufgabe damit erledigt, schließe ab. " +
        "Brauchst du das Ergebnis zum Weitermachen, rufe auf_freigabe_warten auf und beende deine Antwort.",
    // E-47: nur bei wirklich wichtigen Fragen, aber nicht so selten, dass das Ergebnis leidet.
    "- Rückfragen: Fehlt dir eine Information oder Entscheidung, die das Ergebnis wesentlich verändert und die du nicht " +
      "selbst klären kannst, rufe rueckfrage_stellen auf" +
      (imChat ? " – es liefert dir die Antwort des Nutzers. " : " und beende danach deine Antwort. ") +
      "Bündle mehrere Fragen in einer Rückfrage. Für Kleinigkeiten triff eine begründete Annahme und nenne sie im Ergebnis. " +
      "Rate aber nicht, wenn das Ergebnis an der Frage hängt – lieber einmal fragen als eine falsche Lösung abliefern.",
    "- Wird eine Aktion abgelehnt, nimm das hin und sage dem Nutzer, was du nicht tun konntest.",
  ].join("\n");
}

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

/** Die eigenen Tools der App (Postfach) in der Form des SDK. */
function plattformTools(einstellungen: SitzungsEinstellungen): Tool<any>[] {
  return einstellungen.plattformTools.map((tool) =>
    defineTool(tool.name, {
      description: tool.beschreibung,
      parameters: tool.parameter,
      handler: async (argumente) => tool.fuehreAus(argumente),
      // Immer anbieten, nicht erst über die Tool-Suche: Der Agent soll sie ohne Umweg kennen.
      defer: "never",
    }),
  );
}

function sitzungsKonfiguration(einstellungen: SitzungsEinstellungen): SessionConfig {
  const { gateway } = einstellungen;
  // Verbotene Tools gar nicht erst anbieten; abgelehnt werden sie trotzdem, falls doch aufgerufen.
  const verboten = gateway.verboteneTools(einstellungen.mcpServer).map((adresse) => `mcp:${laufzeitName(adresse)}`);
  return {
    // Ohne Modell wählt Copilot automatisch (so am Firmenrechner erprobt). Offen: ob ein fortgesetzter
    // Chat nach dem Zurückstellen auf „automatisch“ beim zuletzt gewählten Modell bleibt.
    ...(einstellungen.modell ? { model: einstellungen.modell } : {}),
    ...(einstellungen.denkaufwand ? { reasoningEffort: einstellungen.denkaufwand } : {}),
    // "default" ausdrücklich (laut SDK erlaubt), damit ein Chat beim Zurückstellen nicht lang bleibt.
    contextTier: einstellungen.kontext === "lang" ? "long_context" : "default",
    workingDirectory: einstellungen.workspaceOrdner,
    systemMessage: { mode: "append", content: `${einstellungen.auftrag}\n\n${umgebungsRegeln(einstellungen.imChat)}` },
    streaming: true,
    tools: plattformTools(einstellungen),
    mcpServers: mcpKonfiguration(einstellungen),
    // Skills aus dem Instructions-Ordner; was dem Agenten nicht zugeordnet ist, wird abgeschaltet.
    // Ob Copilot das genau so umsetzt, ist am Firmenrechner zu prüfen.
    ...(einstellungen.skillOrdner.length > 0
      ? { skillDirectories: einstellungen.skillOrdner, disabledSkills: einstellungen.abgeschalteteSkills }
      : {}),
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
      for (const ereignis of uebersetze(sdkEreignis)) empfaenger(ereignis);
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

  async loescheSitzung(sitzungId: string): Promise<void> {
    const client = await this.holeClient();
    // Gibt es die Sitzung nicht (mehr), ist das Ziel auch erreicht.
    await client.deleteSession(sitzungId).catch(() => {});
  }

  async modelle(): Promise<ModellInfo[]> {
    const client = await this.holeClient();
    const liste = await client.listModels();
    return liste.filter((m) => m.policy?.state !== "disabled").map(alsModellInfo);
  }

  async anmeldung(): Promise<{ angemeldet: boolean | null; text: string }> {
    try {
      const status = await (await this.holeClient()).getAuthStatus();
      return { angemeldet: true, text: `Angemeldet${status.login ? ` als ${status.login}` : ""}${status.host ? ` (${status.host})` : ""}.` };
    } catch (fehler) {
      return { angemeldet: false, text: (fehler as Error).message };
    }
  }

  async beenden(): Promise<void> {
    await this.client?.stop();
    this.client = null;
  }
}

/**
 * Größe der Context Windows. Das SDK nennt je Stufe das Budget für den Prompt; das ganze Fenster
 * ist dieses Budget plus die maximale Ausgabe. Fehlen die Angaben, gilt die allgemeine Obergrenze.
 * Modelle mit langem Kontext haben dafür eigene Angaben (tokenPrices.longContext).
 */
function kontextGroessen(modell: ModelInfo): Pick<ModellInfo, "kontextStandard" | "langerKontext" | "kontextLang"> {
  const preise = modell.billing?.tokenPrices;
  const ausgabe = modell.capabilities?.limits?.max_output_tokens ?? 0;
  const fenster = (prompt: number | undefined) => (prompt ? prompt + ausgabe : null);
  return {
    kontextStandard: fenster(preise?.maxPromptTokens) ?? modell.capabilities?.limits?.max_context_window_tokens ?? null,
    langerKontext: !!preise?.longContext,
    kontextLang: fenster(preise?.longContext?.maxPromptTokens),
  };
}

function alsModellInfo(modell: ModelInfo): ModellInfo {
  return {
    id: modell.id,
    name: modell.name,
    denkStufen: modell.supportedReasoningEfforts ?? [],
    standardDenkStufe: modell.defaultReasoningEffort ?? null,
    ...kontextGroessen(modell),
    multiplikator: modell.billing?.multiplier ?? null,
  };
}
