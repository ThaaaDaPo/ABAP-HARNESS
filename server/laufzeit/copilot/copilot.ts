// Echte Laufzeit über das GitHub Copilot SDK.
// Kann auf dem Privatrechner nicht getestet werden (kein Copilot erlaubt) – Vorlage war das
// Prüfpaket (pruefpaket/src/schritte-copilot.js), das auf dem Firmenrechner erfolgreich lief.
import { CopilotClient, type CopilotSession, type SessionConfig } from "@github/copilot-sdk";
import type { AgentenLaufzeit, AgentenSitzung, EreignisEmpfaenger, SitzungsEinstellungen } from "../laufzeit.ts";
import { erstelleBerechtigungsPruefung } from "./berechtigungen.ts";
import { uebersetze } from "./ereignisse-uebersetzen.ts";

function sitzungsKonfiguration(einstellungen: SitzungsEinstellungen): SessionConfig {
  return {
    ...(einstellungen.modell ? { model: einstellungen.modell } : {}),
    workingDirectory: einstellungen.workspaceOrdner,
    systemMessage: { mode: "append", content: einstellungen.auftrag },
    streaming: true,
    onPermissionRequest: erstelleBerechtigungsPruefung(einstellungen.workspaceOrdner),
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
